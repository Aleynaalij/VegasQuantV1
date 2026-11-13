import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [member, tester, admin, memberSession, testerSession, adminSession] = [
  1, 2, 3, 11, 12, 13,
].map(id);
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema private; create schema auth;
grant usage on schema private,auth to anon,authenticated,service_role;
create table auth.users(id uuid primary key, email_confirmed_at timestamptz, is_anonymous boolean, banned_until timestamptz);
create table auth.sessions(id uuid primary key, user_id uuid references auth.users(id) on delete cascade, not_after timestamptz);
create table private.account_erasure_jobs(user_id uuid, expires_at timestamptz);
create table private.admin_users(user_id uuid);
insert into private.admin_users values ('${admin}');
insert into auth.users values ('${member}',now(),false,null), ('${tester}',now(),false,null), ('${admin}',now(),false,null);
insert into auth.sessions values ('${memberSession}','${member}',null), ('${testerSession}','${tester}',null), ('${adminSession}','${admin}',null);
create function auth.jwt() returns jsonb language sql as $$ select current_setting('app.claims')::jsonb $$;
create function auth.uid() returns uuid language sql as $$ select (auth.jwt()->>'sub')::uuid $$;
`);
// Compose the deployed authorization definitions with synthetic Auth tables/claims.
const age = readFileSync(
  "supabase/migrations/20261014103812_verified_age_gate.sql",
  "utf8",
);
const endAge = age.indexOf("create function private.age_verification_status");
assert.ok(endAge > 0);
await db.exec(age.slice(0, endAge));
const membership = readFileSync(
  "supabase/migrations/20260930133259_membership_and_payments.sql",
  "utf8",
);
const adminHelper = membership.match(
  /create or replace function private\.is_admin\(\)[\s\S]*?\$\$;/i,
);
assert.ok(adminHelper);
await db.exec(adminHelper[0]);
await db.exec(`update private.age_policy set enforced = true;
insert into private.age_checks(user_id,state,policy_version,consent_version)
select id,'verified',1,'fixture' from auth.users;`);
const testerSql = readFileSync(
  "supabase/migrations/20261107173919_platform_tester_research_access.sql",
  "utf8",
);
const testerTables = testerSql.match(
  /create table private\.tester_batches \([\s\S]*?create index tester_batch_accounts_by_user[\s\S]*?;/,
);
const testerCheck = testerSql.match(
  /create function private\.tester_feature_access\(p_feature text\)[\s\S]*?to authenticated;/,
);
assert.ok(testerTables && testerCheck);
await db.exec(testerTables[0]);
await db.exec(testerCheck[0]);
await db.exec(`insert into private.tester_batches(name,cutoff,sealed_at,canary_only,enabled_features)
values('fixture',now(),now(),false,array['research']);
insert into private.tester_batch_accounts(batch,user_id) values('fixture','${tester}');`);
await db.exec(
  readFileSync(
    "supabase/migrations/20261108105426_admin_operations_support.sql",
    "utf8",
  ),
);
const as = async (sub, session_id, extra = {}) => {
  await db.exec("reset role");
  await db.query("select set_config('app.claims',$1,false)", [
    JSON.stringify({ sub, session_id, aal: "aal1", ...extra }),
  ]);
  await db.exec("set role authenticated");
};
const call = async (
  action,
  ticket = null,
  feature = null,
  symptom = null,
  expected = null,
  scope = "public",
) =>
  (
    await db.query(
      `select ${scope}.operations_support($1,$2,$3,$4,$5) result`,
      [action, ticket, feature, symptom, expected],
    )
  ).rows[0].result;
const state = async (...args) => (await call(...args)).state;

for (const role of ["anon", "service_role"]) {
  await db.exec(`reset role; set role ${role}`);
  await assert.rejects(call("list"), /permission denied/);
}
await as(member, memberSession);
assert.equal(await state("list"), "forbidden");
assert.equal(await state("submit", id(20), "raw token", "slow"), "invalid");
assert.equal(await state("submit", null, "research", "slow"), "invalid");
const receipt = await call("submit", id(20), "research", "slow");
assert.equal(receipt.state, "submitted");
assert.deepEqual(await call("submit", id(20), "research", "slow"), receipt);
assert.equal(
  await state("submit", id(20), "research", "incorrect"),
  "conflict",
);
for (const n of [21, 22, 23, 24])
  assert.equal(
    await state("submit", id(n), "zone", "unavailable"),
    "submitted",
  );
assert.equal(await state("submit", id(25), "zone", "unavailable"), "limit");
assert.deepEqual(await call("submit", id(20), "research", "slow"), receipt);
assert.equal(await state("detail", receipt.id), "forbidden");
await as(tester, testerSession, {
  aal: "aal2",
  user_metadata: { admin: true },
  app_metadata: { tester: true },
});
assert.equal(
  (await db.query("select public.tester_feature_access('research') allowed"))
    .rows[0].allowed,
  true,
);
assert.equal(await state("detail", receipt.id), "forbidden");
assert.equal(
  await state("triage", receipt.id, null, null, "new", "private"),
  "forbidden",
);
assert.notEqual(
  (await call("submit", id(20), "research", "slow")).id,
  receipt.id,
);
await assert.rejects(
  db.exec("select * from private.operations_tickets"),
  /permission denied/,
);
await as(admin, adminSession);
assert.equal(await state("list"), "forbidden", "admin requires MFA");
await as(admin, "bad-session", { aal: "aal2" });
assert.equal(await state("list"), "forbidden");
await as(admin, memberSession, { aal: "aal2" });
assert.equal(await state("list"), "forbidden", "foreign session rejected");
await db.exec(
  `reset role; update private.age_checks set state='underage' where user_id='${admin}'`,
);
await as(admin, adminSession, { aal: "aal2" });
assert.equal(await state("list"), "forbidden");
await db.exec(`reset role; update private.age_checks set state='verified' where user_id='${admin}';
update auth.sessions set not_after=now()-interval '1 minute' where id='${adminSession}'`);
await as(admin, adminSession, { aal: "aal2" });
assert.equal(await state("list"), "forbidden", "expired session rejected");
await db.exec(
  `reset role; delete from auth.sessions where id='${adminSession}'`,
);
await as(admin, adminSession, { aal: "aal2" });
assert.equal(
  await state("list", null, null, null, null, "private"),
  "forbidden",
  "revoked session rejected directly",
);
await db.exec(
  `reset role; insert into auth.sessions values ('${adminSession}','${admin}',null)`,
);
await as(admin, adminSession, { aal: "aal2", is_anonymous: true });
assert.equal(await state("list"), "forbidden");
await as(admin, adminSession, { aal: "aal2" });
assert.equal((await call("list")).tickets.length, 6);
assert.equal(await state("detail", id(99)), "not_found");
assert.equal(
  await state("triage", receipt.id, null, null, "in_review"),
  "conflict",
);
const reviewed = await call("triage", receipt.id, null, null, "new");
assert.equal(reviewed.ticket.status, "in_review");
assert.equal(await state("triage", receipt.id, null, null, "new"), "conflict");
const resolved = await call("triage", receipt.id, null, null, "in_review");
assert.equal(resolved.ticket.status, "resolved");
assert.deepEqual(
  resolved.events.map((e) => e.action),
  ["submitted", "triaged", "resolved"],
);
assert.doesNotMatch(
  JSON.stringify(resolved),
  /reporter_id|actor_id|request_id|session_id/,
);
assert.deepEqual(await call("detail", receipt.id), resolved);
await assert.rejects(
  db.exec("update private.operations_ticket_events set status='resolved'"),
  /permission denied/,
);
await db.exec("reset role");
assert.deepEqual(
  (
    await db.query(
      "select action, actor_id from private.operations_ticket_events where ticket_id=$1 order by action",
      [receipt.id],
    )
  ).rows,
  [
    { action: "resolved", actor_id: admin },
    { action: "submitted", actor_id: member },
    { action: "triaged", actor_id: admin },
  ],
);
// Fifty-one tied timestamps plus real earlier reports exercise the UUID tie-breaker.
await db.exec(`insert into private.operations_tickets(reporter_id,request_id,feature,symptom,created_at)
select '${tester}',gen_random_uuid(),'other','other','2030-01-01T00:00:00.000123Z' from generate_series(1,51)`);
await as(admin, adminSession, { aal: "aal2" });
const first = await call("list");
assert.equal(first.tickets.length, 50);
assert.ok(first.next);
assert.equal(
  await state("list", first.next.id),
  "invalid",
  "cursor requires both sort values",
);
const queuePage = async (history, cursor = {}) =>
  (
    await db.query(
      "select public.operations_support('list', $1, null, null, null, $2, $3) result",
      [cursor.id ?? null, history, cursor.before ?? null],
    )
  ).rows[0].result;
const older = await queuePage(false, first.next);
assert.equal(older.tickets.length, 6);
assert.equal(older.next, null);
const open = [...first.tickets, ...older.tickets];
assert.equal(new Set(open.map((t) => t.id)).size, 56);
assert.ok(open.every((t) => t.status !== "resolved"));
assert.deepEqual(
  (await queuePage(true)).tickets.map((t) => t.id),
  [receipt.id],
);
await db.exec(
  "reset role; delete from private.operations_tickets where created_at > '2029-01-01'",
);
// Publication evidence is a separate read-only RPC using the same live session gate.
await db.exec(`
reset role;
create schema cron;
create table cron.job(jobid int, jobname text, schedule text, active boolean);
create table cron.job_run_details(jobid int, start_time timestamptz, end_time timestamptz, status text);
create table private.zone_automation(name text, user_id uuid);
create table private.nba_threes_posts(day date, status text, post_id uuid, updated_at timestamptz);
create function private.is_dealer_publisher(uuid) returns boolean language sql as 'select true';
create table public.feed_runs(id uuid, provider text, status text, details jsonb, created_at timestamptz);
create table public.nba_games(season_type int, tipoff timestamptz);
create table public.community_posts(id uuid, user_id uuid, sport text, kind text, card text, legs jsonb, stake numeric, photo_path text, title text, body text, created_at timestamptz);
delete from private.account_erasure_jobs;
update auth.users set banned_until = null where id = '${admin}';
insert into public.nba_games values (2, now());
insert into private.zone_automation values ('nba_threes', '${admin}');
insert into private.nba_threes_posts values ((now() at time zone 'America/New_York')::date, 'POSTED', '${id(40)}', now());
insert into public.community_posts select '${id(40)}','${admin}','nba','talk',
  'nba-threes:' || (now() at time zone 'America/New_York')::date,
  '[]',null,null,'3-point volume · ' || trim(to_char((now() at time zone 'America/New_York')::date,'Dy Mon FMDD')),
  'Most 3s attempted per game · Most 3s made per game · Research only, not picks. Box scores: ESPN.',now();
`);
await db.exec(
  readFileSync("scripts/operations/nba-publication-evidence.sql", "utf8"),
);
const publication = async () =>
  (await db.query("select public.nba_publication_evidence() as evidence"))
    .rows[0].evidence;
await db.exec("set role anon");
await assert.rejects(publication(), /permission denied/);
await as(member, memberSession, { aal: "aal2" });
assert.equal(await publication(), null);
await as(admin, adminSession);
assert.equal(await publication(), null);
await as(admin, adminSession, { aal: "aal2" });
await db.exec("begin read only");
const observation = await publication();
assert.equal(observation.eligibleGames, 1);
assert.equal(observation.journal.postId, id(40));
assert.deepEqual(
  observation.posts.map(({ dealer, contentMatches }) => [
    dealer,
    contentMatches,
  ]),
  [[true, true]],
);
assert.ok(!("body" in observation.posts[0]));
await db.exec("commit; reset role");

await db.exec(
  `update auth.users set banned_until=now()+interval '1 hour' where id='${admin}'`,
);
await as(admin, adminSession, { aal: "aal2" });
assert.equal(await state("list"), "forbidden");
await db.exec(
  `reset role; update auth.users set banned_until=null where id='${admin}'; insert into private.account_erasure_jobs values ('${admin}',now()+interval '1 hour')`,
);
await as(admin, adminSession, { aal: "aal2" });
assert.equal(await state("list"), "forbidden");
await db.exec(
  `reset role; delete from auth.users where id='${admin}'; delete from auth.users where id='${member}'`,
);
assert.equal(
  (await db.query("select count(*)::int n from private.operations_tickets"))
    .rows[0].n,
  1,
);
assert.equal(
  (
    await db.query(
      "select count(*)::int n from private.operations_ticket_events",
    )
  ).rows[0].n,
  1,
);
await db.close();

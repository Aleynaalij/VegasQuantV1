import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
const a = "00000000-0000-4000-8000-000000000001",
  b = "00000000-0000-4000-8000-000000000002",
  c = "00000000-0000-4000-8000-000000000003",
  p = "00000000-0000-4000-8000-000000000004",
  comment = "00000000-0000-4000-8000-000000000005";
await db.exec(
  `create role anon;create role authenticated;create role service_role;create schema private;create schema auth;
create function auth.uid()returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,encrypted_password text);
create table private.age_policy(singleton boolean,enforced boolean,version int);insert into private.age_policy values(true,true,1);
create table private.age_checks(user_id uuid,state text,policy_version int default 1);
create table auth.sessions(id uuid,user_id uuid,not_after timestamptz);
create function auth.jwt()returns jsonb language sql as $$select jsonb_build_object('session_id','00000000-0000-4000-8000-000000000099')$$;
create function private.age_eligible(p_user uuid)returns boolean language sql as $$select exists(select 1 from private.age_checks where user_id=p_user and state='verified')$$;
create function private.age_member_allowed()returns boolean language sql as $$select auth.uid() is not null$$;
create table private.account_erasure_jobs(user_id uuid,expires_at timestamptz);create table private.community_restrictions(user_id uuid);
create table public.member_blocks(user_id uuid,target_user_id uuid);
create function private.community_member_allowed(target uuid)returns boolean language sql security definer as $$select not exists(select 1 from public.member_blocks where(user_id=auth.uid() and target_user_id=target)or(target_user_id=auth.uid() and user_id=target))$$;
create table public.community_profiles(user_id uuid,username text,avatar text,visible boolean);
create table public.community_posts(id uuid primary key,user_id uuid,sport text,body text);
create table public.community_post_comments(id uuid primary key,user_id uuid,post_id uuid,body text,created_at timestamptz default now());
create table public.community_reactions(post_id uuid,user_id uuid,created_at timestamptz default now(),primary key(post_id,user_id));
create table public.member_follows(user_id uuid,target_user_id uuid,created_at timestamptz default now(),primary key(user_id,target_user_id));
create table public.push_subscriptions(id uuid primary key default gen_random_uuid(),user_id uuid,endpoint text,p256dh text,auth text);
create table public.app_updates(id uuid primary key default gen_random_uuid(),title text,body text,created_at timestamptz default now());create table public.app_update_reads(user_id uuid,update_id uuid,read_at timestamptz default now());
grant usage on schema public,private,auth to authenticated;grant execute on all functions in schema auth,private to authenticated;
grant select on public.community_post_comments,public.community_comment_reactions to authenticated;
insert into auth.users values('${a}','a@example.com',now(),'old'),('${b}','b@example.com',now(),'old'),('${c}','c@example.com',now(),'old');
insert into private.age_checks(user_id,state) values('${a}','verified'),('${b}','verified'),('${c}','verified');
insert into auth.sessions values('00000000-0000-4000-8000-000000000099','${a}',now()+interval '1 day');
insert into public.community_profiles values('${a}','Alice','a.jpg',true),('${b}','Bob','b.jpg',true),('${c}','Carol','c.jpg',true);`.replace(
    "grant select on public.community_post_comments,public.community_comment_reactions to authenticated;",
    "grant select on public.community_post_comments to authenticated;",
  ),
);
const age = fs.readFileSync(
  "supabase/migrations/20261014103812_verified_age_gate.sql",
  "utf8",
);
for (const name of ["private.age_eligible", "private.age_member_allowed"]) {
  const start = age.indexOf("create function " + name + "("),
    end = age.indexOf("$$;", start) + 3;
  assert.ok(start >= 0 && end > start);
  await db.exec(
    age
      .slice(start, end)
      .replace("create function", "create or replace function"),
  );
}
await db.exec(
  fs
    .readFileSync(
      "supabase/migrations/20261017015506_social_notification_system.sql",
      "utf8",
    )
    .replace(/^select cron.schedule.*$/gm, ""),
);

await db.exec(`create schema storage;create table storage.objects(bucket_id text,name text,owner_id text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select on storage.objects to authenticated;
create function public.is_admin() returns boolean language sql as $$select nullif(current_setting('app.admin',true),'')='true'$$;`);
await db.exec(
  fs.readFileSync(
    "supabase/migrations/20261023210220_ruby_contributor_cards.sql",
    "utf8",
  ),
);
await db.exec(
  fs.readFileSync(
    "supabase/migrations/20261023212700_ruby_feature_account_erasure.sql",
    "utf8",
  ),
);
await db.exec(
  fs.readFileSync(
    "supabase/migrations/20261024080046_goat_diamond_contributor.sql",
    "utf8",
  ),
);
await db.exec(
  `create function private.is_admin() returns boolean language sql as 'select public.is_admin()';create function private.immutable() returns trigger language plpgsql as $$begin raise exception 'Published records are immutable. Add a new version or an explicit correction event.';end$$;`,
);
await db.exec(
  fs.readFileSync(
    "supabase/migrations/20261024134617_admin_contributor_card_revisions.sql",
    "utf8",
  ),
);
await db.exec(
  fs.readFileSync(
    "supabase/migrations/20261024134918_admin_card_edit_verified_check.sql",
    "utf8",
  ),
);
await db.exec(
  fs.readFileSync(
    "supabase/migrations/20261024160000_card_revision_erasure.sql",
    "utf8",
  ),
);
await db.exec(
  `insert into public.ruby_contributors(user_id,brand,theme) values('${c}','The GOAT','diamond')`,
);
await assert.rejects(
  db.exec(
    `update public.ruby_contributors set theme='orbit' where user_id='${c}'`,
  ),
  /check constraint|unique constraint/,
);
await db.exec(
  `insert into public.ruby_contributors(user_id,brand,theme) values('${a}','OmaticsZone','orbit');insert into public.push_subscriptions(user_id,endpoint,p256dh,auth) values('${b}','https://example.invalid','key','auth');insert into public.notification_preferences(user_id,push_enabled) values('${b}',true) on conflict(user_id) do update set push_enabled=true;set app.uid='${a}';set role authenticated;`,
);

await db.exec("reset role");
await db.exec(
  fs.readFileSync(
    "supabase/migrations/20261024190000_contributor_records.sql",
    "utf8",
  ),
);
await db.exec(
  fs.readFileSync(
    "supabase/migrations/20261105233947_ruby_kalshi_source_link.sql",
    "utf8",
  ),
);
const canonical =
  "https://kalshi.com/markets/kxmvecrosscategory/combo/sample-combo?marketTicker=SYNTHETIC-YES";
const changed = canonical.replace("SYNTHETIC-YES", "SYNTHETIC-NEXT");
const id = "00000000-0000-4000-8000-000000000010";
const typed = "00000000-0000-4000-8000-000000000011";
const fresh = "00000000-0000-4000-8000-000000000012";
const submit = (pid, link = canonical) =>
  db.query(
    `select public.submit_ruby_link($1,'NFL','Shared source','[]','',null,null,null,$2)`,
    [pid, link],
  );
const plain = (pid) =>
  db.query(
    `select public.submit_ruby($1,'NFL','Typed','["A over 1.5","B over 2.5"]','',null,null,null)`,
    [pid],
  );
const edit = (pid, rev, link, legs = "[]") =>
  db.query(
    `select public.edit_ruby_link($1,$2,'Edited',$3::jsonb,'','NFL',null,null,null,$4)`,
    [pid, rev, legs, link],
  );
const source = async (pid) =>
  (
    await db.query("select source_link from public.ruby_cards where id=$1", [
      pid,
    ])
  ).rows[0].source_link;
const pause = fs.readFileSync(
  "supabase/migrations/20261106225003_kalshi_temporary_pause.sql",
  "utf8",
);
const rollback = fs.readFileSync("supabase/rollback/kalshi_pause.sql", "utf8");
// Build historical data, including an already revised source, before pausing.
await db.exec(
  `set app.uid='${a}';set role authenticated;set app.admin='true';`,
);
await submit(id);
await edit(id, 0, changed);
await plain(typed);
await db.exec("reset role");
await db.query(
  `insert into public.ruby_result_reports(submission_id,revision,outcome,reported_by) values($1,1,'WIN',$2)`,
  [id, a],
);
const protectedState = async () => ({
  functions: (
    await db.query(
      `select p.oid::regprocedure::text name,pg_get_functiondef(p.oid) definition,p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname not like 'guard_kalshi_%' order by 1`,
    )
  ).rows,
  views: (
    await db.query(
      `select c.relname,pg_get_viewdef(c.oid) definition,c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v' order by 1`,
    )
  ).rows,
  tables: (
    await db.query(
      `select c.relname,c.relacl::text acl,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' order by 1`,
    )
  ).rows,
  policies: (
    await db.query(
      `select * from pg_policies where schemaname='public' order by tablename,policyname`,
    )
  ).rows,
  data: (
    await db.query(
      `select 'submission' kind,to_jsonb(s) data from public.ruby_submissions s union all select 'revision',to_jsonb(r) from public.ruby_card_revisions r union all select 'result',to_jsonb(r) from public.ruby_result_reports r order by kind,data`,
    )
  ).rows,
});
const before = await protectedState();
// Absent prerequisites abort atomically, without silently pretending to pause.
await db.exec(
  `alter function private.submit_ruby_link(uuid,text,text,jsonb,text,text,text,integer,text) rename to test_missing_submit;`,
);
await assert.rejects(
  db.exec(pause),
  /requires the complete ruby_kalshi_source_link/,
);
await db.exec(
  `rollback;alter function private.test_missing_submit(uuid,text,text,jsonb,text,text,text,integer,text) rename to submit_ruby_link;`,
);
await db.exec(pause);
assert.deepEqual(await protectedState(), before);
await db.exec("set role authenticated");
for (const signature of [
  "private.guard_kalshi_submission_pause()",
  "private.guard_kalshi_revision_pause()",
]) {
  assert.equal(
    (
      await db.query(
        "select has_function_privilege(current_user,$1,'execute') ok",
        [signature],
      )
    ).rows[0].ok,
    false,
  );
}
assert.equal(await source(id), changed);
const notifications = (
  await db.query("select count(*)::int n from public.notifications")
).rows[0].n;
await submit(id); // Exact historic retry: no duplicate or notification.
assert.equal(
  (await db.query("select count(*)::int n from public.notifications")).rows[0]
    .n,
  notifications,
);
await assert.rejects(submit(id, changed), /identifier already used/);
await assert.rejects(submit(fresh), /Kalshi is temporarily unavailable/);
await assert.rejects(
  db.query(
    `select private.submit_ruby_link($1,'NFL','Shared source','[]','',null,null,null,$2)`,
    [fresh, canonical],
  ),
  /Kalshi is temporarily unavailable/,
);
await assert.rejects(
  db.query(
    `insert into public.ruby_submissions(id,user_id,brand,theme,sport,title,source_link) values($1,$2,'OmaticsZone','orbit','NFL','bad',$3)`,
    [fresh, a, canonical],
  ),
  /permission denied/,
);
// Current links, rather than original links, determine permitted edits.
await assert.rejects(edit(id, 1, canonical), /Kalshi source changes/);
await assert.rejects(edit(typed, 0, canonical), /Kalshi source changes/);
assert.equal(
  (
    await db.query(
      "select reported_result from public.ruby_cards where id=$1",
      [id],
    )
  ).rows[0].reported_result,
  "WIN",
);
await edit(id, 1, changed + "&utm_source=ignored");
assert.equal(
  (
    await db.query(
      "select reported_result from public.ruby_cards where id=$1",
      [id],
    )
  ).rows[0].reported_result,
  null,
); // Old result cannot attach to a newer revision.
assert.equal(await source(id), changed);
await assert.rejects(edit(id, 1, changed), /Card changed/);
await db.query(
  `select public.edit_ruby($1,2,'Legacy edit','[]','','NFL',null,null,null)`,
  [id],
);
assert.equal(await source(id), changed);
await assert.rejects(edit(id, 3, null), /check constraint/);
await edit(id, 3, null, '["A over 1.5","B over 2.5"]');
assert.equal(await source(id), null);
await assert.rejects(edit(id, 4, changed), /Kalshi source changes/);
await edit(id, 4, null, '["A over 2.5","B over 3.5"]');
await db.query(
  `select public.edit_ruby($1,5,'Legacy after removal','["A over 2.5","B over 3.5"]','','NFL',null,null,null)`,
  [id],
);
assert.equal(await source(id), null);
// Guard order, authorization and minimum content remain owned by existing RPCs.
await db.exec("set app.admin='false'");
await assert.rejects(edit(typed, 0, canonical), /Verified admin/);
await db.exec("set app.admin='true';reset role");
await db.exec(
  `delete from private.age_checks where user_id='${a}';set role authenticated`,
);
await assert.rejects(submit(id), /age|Age|verification/);
await db.exec(
  `reset role;insert into private.age_checks(user_id,state) values('${a}','verified');insert into private.account_erasure_jobs values('${a}',now()+interval '1 day');set role authenticated`,
);
await assert.rejects(submit(id), /deletion in progress/);
await db.exec(
  `reset role;delete from private.account_erasure_jobs where user_id='${a}';set role authenticated`,
);
await plain(fresh); // Existing typed path still works; third daily submission.
await assert.rejects(
  plain("00000000-0000-4000-8000-000000000013"),
  /three daily/,
);
await db.exec("reset role");
// Privileged writes also hit the pause (not merely HTTP or authenticated grants).
await assert.rejects(
  db.query(
    `insert into public.ruby_submissions(id,user_id,brand,theme,sport,title,source_link) values(gen_random_uuid(),$1,'OmaticsZone','orbit','NFL','direct',$2)`,
    [a, canonical],
  ),
  /Kalshi is temporarily unavailable/,
);
await assert.rejects(
  db.query(`update public.ruby_submissions set source_link=$1 where id=$2`, [
    changed,
    id,
  ]),
  /Kalshi source changes/,
);
await assert.rejects(
  db.query(
    `update public.ruby_card_revisions set source_link=$1 where submission_id=$2`,
    [canonical, id],
  ),
  /immutable/,
);
assert.equal(
  (
    await db.query(
      "select source_link from public.ruby_submissions where id=$1",
      [id],
    )
  ).rows[0].source_link,
  canonical,
);
assert.equal(
  (
    await db.query(
      "select source_link from public.ruby_card_revisions where submission_id=$1 and revision=1",
      [id],
    )
  ).rows[0].source_link,
  changed,
);
await db.exec("set role anon");
await assert.rejects(submit(id), /permission denied/);
await db.exec("reset role");
// Pause also preserves result next-day gating, blocked readers and screenshot uploads.
await db.exec("set role authenticated");
await assert.rejects(
  db.query(`select public.report_ruby($1,'WIN',6)`, [id]),
  /next Eastern day/,
);
await db.exec(
  `reset role;insert into public.member_blocks values('${b}','${a}');insert into auth.sessions values('00000000-0000-4000-8000-000000000099','${b}',now()+interval '1 day');set app.uid='${b}';set role authenticated;`,
);
assert.equal(
  (await db.query("select count(*)::int n from public.ruby_cards")).rows[0].n,
  0,
);
await assert.rejects(
  submit("00000000-0000-4000-8000-000000000015"),
  /Contributor access/,
);
await db.exec(
  `reset role;set app.uid='${a}';update public.ruby_submissions set submission_day=submission_day-1 where user_id='${a}';set role authenticated`,
);
await db.query(`select public.report_ruby($1,'WIN',6)`, [id]);
const photoId = "00000000-0000-4000-8000-000000000016";
const photo = `${a}/${photoId}.jpg`;
await assert.rejects(
  db.query(`select public.submit_ruby($1,'NFL','Photo','[]','',$2,null,null)`, [
    photoId,
    photo,
  ]),
  /Upload your own screenshot/,
);
await db.exec("reset role");
await db.query(`insert into storage.objects values('community-photos',$1,$2)`, [
  photo,
  a,
]);
await db.exec("set role authenticated");
await db.query(
  `select public.submit_ruby($1,'NFL','Photo','[]','',$2,null,null)`,
  [photoId, photo],
);
await db.exec("reset role");
const during = await protectedState();
await db.exec(rollback);
assert.deepEqual(await protectedState(), during);
await db.exec("set role authenticated");
await edit(typed, 0, canonical);
assert.equal(await source(typed), canonical);
// Use a new synthetic Eastern day to prove rollback restores inserts too.
await db.exec(
  `reset role;update public.ruby_submissions set submission_day=submission_day-1 where user_id='${a}';set role authenticated`,
);
await submit("00000000-0000-4000-8000-000000000014");
console.log(
  "PASS Kalshi pause: prerequisites, stale/direct writes, historical retries, current/legacy revisions, removal, guards, grants/history preservation and rollback",
);
await db.close();

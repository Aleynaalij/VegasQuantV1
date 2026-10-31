import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite(),
  frank = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002",
  admin = "00000000-0000-4000-8000-000000000003",
  request = "00000000-0000-4000-8000-000000000010";
await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;create schema auth;
grant usage on schema private,auth to anon,authenticated,service_role;
create table auth.users(id uuid primary key);insert into auth.users values('${frank}'),('${other}'),('${admin}');
create function auth.uid()returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
create function private.age_member_allowed()returns boolean language sql as $$select current_setting('app.age',true)='yes'$$;
create function private.is_admin()returns boolean language sql as $$select current_setting('app.admin',true)='yes' and current_setting('app.aal',true)='aal2'$$;
create table public.ruby_contributors(user_id uuid,brand text,active boolean);insert into public.ruby_contributors values('${frank}','FranksCorner',true);
create table private.frank_anniversary_config(singleton boolean primary key,target_user_id uuid,enabled boolean);insert into private.frank_anniversary_config values(true,'${other}',true);
create table private.frank_anniversary_receipts(user_id uuid primary key,celebrated_at timestamptz);`);
const sql = readFileSync(
  "supabase/migrations/20261031183133_frank_nhl_feedback.sql",
  "utf8",
);
await assert.rejects(db.exec(sql), /Verified FranksCorner identity/);
await db.exec(
  `update private.frank_anniversary_config set target_user_id='${frank}'`,
);
await db.exec(sql);
const call = async (action = "status", answers = null, id = null) =>
  (
    await db.query("select public.frank_nhl_feedback($1,$2,$3) r", [
      action,
      answers,
      id,
    ])
  ).rows[0].r;
const actor = async (uid, age = true) =>
  db.exec(
    `reset role;set app.uid='${uid}';set app.age='${age ? "yes" : "no"}';set app.admin='no';set app.aal='aal1';set role authenticated;`,
  );
await db.exec("set role anon");
await assert.rejects(call(), /permission denied/);
await actor(other);
assert.equal((await call()).state, "hidden");
await actor(frank, false);
assert.equal((await call()).state, "hidden");
await actor(frank);
assert.equal(
  (await call()).state,
  "hidden",
  "do not spoil pending anniversary",
);
await db.exec(
  `reset role;insert into private.frank_anniversary_receipts values('${frank}',now());set role authenticated`,
);
assert.equal((await call()).state, "offer");
await assert.rejects(call("submit", {}, request), /at least one/);
await assert.rejects(
  call("submit", { track: " \n\t " }, request),
  /at least one/,
);
await assert.rejects(call("submit", { track: 123 }, request), /must be text/);
await assert.rejects(
  call("submit", { track: "x".repeat(3001) }, request),
  /3000/,
);
await assert.rejects(
  call("submit", { track: "Ice time", user_id: other }, request),
  /Unknown feedback field/,
);
await assert.rejects(call("submit", { track: "Ice time" }, null), /request ID/);
const answers = {
  track: "  Ice time and goalie confirmation  ",
  players: "Fixture skater",
  expanded_report: "Power-play role and recent form",
  notes: "Use source timestamps",
};
let result = await call("submit", answers, request);
assert.equal(result.state, "submitted");
assert.equal(result.answers.track, "Ice time and goalie confirmation");
assert.ok(Number.isFinite(Date.parse(result.submitted_at)));
assert.deepEqual(
  await call("submit", answers, request),
  result,
  "retry is idempotent",
);
await assert.rejects(
  call("submit", { ...answers, track: "Different answer" }, request),
  /different feedback/,
);
assert.deepEqual(await call(), result, "saved answers survive a new read");
await assert.rejects(
  db.query("select * from private.frank_nhl_feedback"),
  /permission denied/,
);
await assert.rejects(
  db.query("select public.frank_nhl_feedback_review()"),
  /Verified admin/,
);
await actor(other);
assert.equal((await call("submit", answers, request)).state, "hidden");
assert.equal((await call()).state, "hidden");
await actor(admin);
await db.exec("reset role;set app.admin='yes';set role authenticated");
await assert.rejects(
  db.query("select public.frank_nhl_feedback_review()"),
  /Verified admin/,
);
await db.exec("reset role;set app.aal='aal2';set role authenticated");
let rows = (await db.query("select public.frank_nhl_feedback_review() r"))
  .rows[0].r;
assert.equal(rows.length, 1);
assert.equal(rows[0].answers.track, result.answers.track);
assert.equal("user_id" in rows[0], false);
await db.exec("reset role;set app.age='no';set role authenticated");
await assert.rejects(
  db.query("select public.frank_nhl_feedback_review()"),
  /Verified admin/,
);
await actor(frank);
await call(
  "submit",
  { notes: "An additional idea" },
  "00000000-0000-4000-8000-000000000011",
);
await db.exec("reset role");
assert.equal(
  (await db.query("select count(*)::int n from private.frank_nhl_feedback"))
    .rows[0].n,
  2,
);
assert.equal(
  (
    await db.query(
      "select count(*)::int n from private.frank_anniversary_receipts where celebrated_at is not null",
    )
  ).rows[0].n,
  1,
);
assert.equal(
  (
    await db.query(
      "select has_table_privilege('service_role','private.frank_nhl_feedback','select') p",
    )
  ).rows[0].p,
  false,
);
assert.equal(
  (
    await db.query(
      "select prosecdef from pg_proc where oid='public.frank_nhl_feedback(text,jsonb,uuid)'::regprocedure",
    )
  ).rows[0].prosecdef,
  false,
);
await db.exec("update public.ruby_contributors set active=false");
await actor(frank);
assert.equal((await call()).state, "hidden");
console.log(
  "PASS feedback: pinned identity, anniversary ordering, age, private storage, MFA admin review, text validation, retry idempotency and no receipt consumption",
);
await db.close();

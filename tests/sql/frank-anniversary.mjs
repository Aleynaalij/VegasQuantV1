import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
const frank = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const wrong = "00000000-0000-4000-8000-000000000003";
await db.exec(`create role anon; create role authenticated; create role service_role;
create schema private; create schema auth; grant usage on schema private,auth to authenticated;
create table auth.users(id uuid primary key); insert into auth.users values('${frank}'),('${other}');
create table public.ruby_contributors(user_id uuid primary key references auth.users, brand text unique,active boolean not null);
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
create function private.age_member_allowed() returns boolean language sql as $$select coalesce(current_setting('app.age',true)='yes',false)$$;`);
const migration = readFileSync(
  "supabase/migrations/20261031170000_frank_anniversary.sql",
  "utf8",
);
// An unknown recipient must stop deployment rather than silently target a name match.
await assert.rejects(
  db.exec(`begin;${migration}commit;`),
  /exactly one active/,
);
await db.exec("rollback");
await db.exec(
  `insert into public.ruby_contributors values('${frank}','FranksCorner',true)`,
);
await db.exec(migration);
const asUser = async (uid, age = "yes") => {
  await db.exec(
    `reset role;select set_config('app.uid','${uid}',false);select set_config('app.age','${age}',false);set role authenticated`,
  );
};
const rpc = async (action = "status", token = null) =>
  (
    await db.query("select public.frank_anniversary($1,$2::uuid) r", [
      action,
      token,
    ])
  ).rows[0].r;
const count = async () => {
  await db.exec("reset role");
  return Number(
    (
      await db.query(
        "select count(*) n from private.frank_anniversary_receipts",
      )
    ).rows[0].n,
  );
};
assert.equal(
  (
    await db.query(
      "select has_function_privilege('anon','public.frank_anniversary(text,uuid)','execute') p",
    )
  ).rows[0].p,
  false,
);
assert.equal(
  (
    await db.query(
      "select prosecdef from pg_proc where oid='public.frank_anniversary(text,uuid)'::regprocedure",
    )
  ).rows[0].prosecdef,
  false,
);
await db.exec("set role anon");
await assert.rejects(rpc(), /permission denied/);
await asUser(frank);
for (const action of ["status", "reveal", "arrive"])
  assert.equal((await rpc(action)).state, "hidden");
assert.equal(await count(), 0);
await db.exec(
  "update private.frank_anniversary_config set enabled=true,released_at=now()+interval '1 day'",
);
await asUser(frank);
assert.equal((await rpc()).state, "hidden");
await db.exec("reset role");
await db.exec(
  "update private.frank_anniversary_config set released_at=now()-interval '1 second'",
);
await asUser(other);
for (const action of ["status", "reveal", "arrive"])
  assert.equal((await rpc(action, wrong)).state, "hidden");
await asUser("");
assert.equal((await rpc()).state, "hidden");
await asUser(frank, "no");
assert.equal((await rpc()).state, "hidden");
await asUser(frank);
assert.equal((await rpc()).state, "offer");
assert.equal((await rpc()).state, "offer");
assert.equal(await count(), 0); // Merely opening/refreshing the page is not a reveal.
await asUser(frank);
await assert.rejects(
  db.exec("select * from private.frank_anniversary_config"),
  /permission denied/,
);
await assert.rejects(
  db.exec(`update private.frank_anniversary_config set enabled=true`),
  /permission denied/,
);
await assert.rejects(rpc("reset"), /Unknown anniversary action/);
const reveal = await rpc("reveal");
assert.equal(reveal.state, "revealed");
assert.match(reveal.token, /^[a-f0-9-]{36}$/);
assert.deepEqual(await rpc("reveal"), reveal);
assert.deepEqual(await rpc(), reveal); // Duplicate Yes and device reload resume same handoff.
assert.equal((await rpc("arrive", wrong)).state, "done");
assert.deepEqual(await rpc(), reveal);
await asUser(other);
assert.equal((await rpc("arrive", reveal.token)).state, "hidden");
await asUser(frank);
assert.equal((await rpc("arrive", reveal.token)).state, "celebrate");
assert.equal((await rpc("arrive", reveal.token)).state, "done"); // Other tab/device cannot replay.
assert.equal((await rpc()).state, "done");
assert.equal((await rpc("reveal")).state, "done");
assert.equal(await count(), 1);
await db.exec("update private.frank_anniversary_config set enabled=false");
await asUser(frank);
assert.equal((await rpc()).state, "hidden");
await db.exec("reset role");
await db.exec("update private.frank_anniversary_config set enabled=true");
await asUser(frank);
assert.equal((await rpc()).state, "done"); // Neither relaunch nor another anniversary resets it.
await db.exec("reset role");
await db.exec(
  `update public.ruby_contributors set user_id='${other}' where brand='FranksCorner'`,
);
await asUser(other);
assert.equal((await rpc()).state, "hidden"); // No silent retargeting if contributor ownership changes.
console.log(
  "PASS Frank anniversary: verified target, disabled release gate, age/role checks, durable one-time handoff, replay denial, no retargeting",
);
await db.close();

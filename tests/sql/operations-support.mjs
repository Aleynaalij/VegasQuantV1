import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [member, tester, admin, memberSession, testerSession, adminSession] = [1, 2, 3, 11, 12, 13].map(id);
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
create function private.is_admin() returns boolean language sql as $$
  select auth.jwt()->>'aal' = 'aal2' and exists(select 1 from private.admin_users where user_id = auth.uid()) $$;
create function private.age_member_allowed() returns boolean language sql as $$ select auth.jwt()->>'fixture_age' = 'yes' $$;
`);
await db.exec(readFileSync("supabase/migrations/20261108105426_admin_operations_support.sql", "utf8"));
const as = async (sub, session_id, extra = {}) => {
  await db.exec("reset role");
  await db.query("select set_config('app.claims',$1,false)", [JSON.stringify({ sub, session_id, aal: "aal1", fixture_age: "yes", ...extra })]);
  await db.exec("set role authenticated");
};
const call = async (action, ticket = null, feature = null, symptom = null, expected = null, scope = "public") => (
  await db.query(`select ${scope}.operations_support($1,$2,$3,$4,$5) result`, [action, ticket, feature, symptom, expected])
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
assert.equal(await state("submit", id(20), "research", "incorrect"), "conflict");
for (const n of [21, 22, 23, 24]) assert.equal(await state("submit", id(n), "zone", "unavailable"), "submitted");
assert.equal(await state("submit", id(25), "zone", "unavailable"), "limit");
assert.deepEqual(await call("submit", id(20), "research", "slow"), receipt);
assert.equal(await state("detail", receipt.id), "forbidden");
await as(tester, testerSession, { aal: "aal2", user_metadata: { admin: true }, app_metadata: { tester: true } });
assert.equal(await state("detail", receipt.id), "forbidden");
assert.equal(await state("triage", receipt.id, null, null, "new", "private"), "forbidden");
assert.notEqual((await call("submit", id(20), "research", "slow")).id, receipt.id);
await assert.rejects(db.exec("select * from private.operations_tickets"), /permission denied/);
await as(admin, adminSession);
assert.equal(await state("list"), "forbidden", "admin requires MFA");
await as(admin, "bad-session", { aal: "aal2" });
assert.equal(await state("list"), "forbidden");
await as(admin, memberSession, { aal: "aal2" });
assert.equal(await state("list"), "forbidden", "foreign session rejected");
await as(admin, adminSession, { aal: "aal2", fixture_age: "no" });
assert.equal(await state("list"), "forbidden");
await as(admin, adminSession, { aal: "aal2", is_anonymous: true });
assert.equal(await state("list"), "forbidden");
await as(admin, adminSession, { aal: "aal2" });
assert.equal((await call("list")).tickets.length, 6);
assert.equal(await state("detail", id(99)), "not_found");
assert.equal(await state("triage", receipt.id, null, null, "in_review"), "conflict");
const reviewed = await call("triage", receipt.id, null, null, "new");
assert.equal(reviewed.ticket.status, "in_review");
assert.equal(await state("triage", receipt.id, null, null, "new"), "conflict");
const resolved = await call("triage", receipt.id, null, null, "in_review");
assert.equal(resolved.ticket.status, "resolved");
assert.deepEqual(resolved.events.map((e) => e.action), ["submitted", "triaged", "resolved"]);
assert.doesNotMatch(JSON.stringify(resolved), /reporter_id|actor_id|request_id|session_id/);
assert.deepEqual(await call("detail", receipt.id), resolved);
await assert.rejects(db.exec("update private.operations_ticket_events set status='resolved'"), /permission denied/);
await db.exec("reset role");
assert.deepEqual((await db.query("select action, actor_id from private.operations_ticket_events where ticket_id=$1 order by action", [receipt.id])).rows, [
  { action: "resolved", actor_id: admin }, { action: "submitted", actor_id: member }, { action: "triaged", actor_id: admin },
]);
await db.exec(`update auth.users set banned_until=now()+interval '1 hour' where id='${admin}'`);
await as(admin, adminSession, { aal: "aal2" });
assert.equal(await state("list"), "forbidden");
await db.exec(`reset role; update auth.users set banned_until=null where id='${admin}'; insert into private.account_erasure_jobs values ('${admin}',now()+interval '1 hour')`);
await as(admin, adminSession, { aal: "aal2" });
assert.equal(await state("list"), "forbidden");
await db.exec(`reset role; delete from auth.users where id='${admin}'; delete from auth.users where id='${member}'`);
assert.equal((await db.query("select count(*)::int n from private.operations_tickets")).rows[0].n, 1);
assert.equal((await db.query("select count(*)::int n from private.operations_ticket_events")).rows[0].n, 1);
await db.close();

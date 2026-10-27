import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
const a = "00000000-0000-4000-8000-000000000001",
  b = "00000000-0000-4000-8000-000000000002";
await db.exec(`create role authenticated;create role anon;create role service_role;create schema private;create schema auth;
create function auth.uid()returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
create table auth.users(id uuid primary key,created_at timestamptz default now(),is_anonymous boolean default false);
insert into auth.users(id)values('${a}');
create function private.before_age_has_membership()returns boolean language sql stable security definer set search_path='' as $$select false;$$;
create function private.has_membership()returns boolean language sql as $$select coalesce(current_setting('app.age_blocked',true),'')<>'true'and private.before_age_has_membership()$$;
create function private.membership_status()returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('allowed',private.has_membership(),'admin',false,'trial_active',true,'expires_at','2026-10-20');$$;
`);
await db.exec(
  fs.readFileSync(
    "supabase/migrations/20261014180409_existing_accounts_complimentary_premium.sql",
    "utf8",
  ),
);
await db.exec(`set app.uid='${a}'`);
let r = (await db.query("select private.membership_status()s")).rows[0].s;
assert.equal(r.allowed, true);
assert.equal(r.complimentary_premium, true);
assert.equal(r.trial_active, false);
assert.equal(r.expires_at, null);
assert.equal(r.admin, false);
await db.exec(`insert into auth.users(id)values('${b}');set app.uid='${b}'`);
r = (await db.query("select private.membership_status()s")).rows[0].s;
assert.equal(r.complimentary_premium, false);
assert.equal(r.allowed, false);
await db.exec(`set app.uid='${a}';set app.age_blocked='true'`);
assert.equal(
  (await db.query("select private.membership_status()s")).rows[0].s.allowed,
  false,
);
await db.exec("set role authenticated");
await assert.rejects(db.query("select * from private.existing_member_premium"));
await db.exec("reset role");
await db.exec(`delete from auth.users where id='${a}'`);
assert.equal(
  (
    await db.query(
      "select count(*)::int n from private.existing_member_premium",
    )
  ).rows[0].n,
  0,
);
await db.close();
console.log(
  "Existing Premium: existing cohort only, no admin promotion, no age bypass, deletion cascades and direct member access denied.",
);

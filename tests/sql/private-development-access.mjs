import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const owner = "11111111-1111-4111-8111-111111111111";
const member = "22222222-2222-4222-8222-222222222222";
const ownerSession = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const memberSession = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("private development requires a current MFA session for an allowlisted identity", async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create schema private;
      grant usage on schema private to anon, authenticated, service_role;
      create function auth.jwt() returns jsonb language sql stable as
        'select nullif(current_setting(''request.jwt.claims'', true), '''')::jsonb';
      create function auth.uid() returns uuid language sql stable as
        'select (auth.jwt()->>''sub'')::uuid';
      create table auth.users (id uuid primary key, email_confirmed_at timestamptz,
        is_anonymous boolean, deleted_at timestamptz, banned_until timestamptz);
      create table auth.sessions (id uuid primary key, user_id uuid not null references auth.users(id),
        aal text, not_after timestamptz);
      insert into auth.users(id, email_confirmed_at, is_anonymous) values
        ('${owner}', now(), false), ('${member}', now(), false);
      insert into auth.sessions(id, user_id, aal) values
        ('${ownerSession}', '${owner}', 'aal2'), ('${memberSession}', '${member}', 'aal2');
      create table public.fixture_records (id integer);
      insert into public.fixture_records values (1);
      alter table public.fixture_records enable row level security;
      create policy existing_read on public.fixture_records for select to anon, authenticated using (true);
      grant select, insert on public.fixture_records to anon, authenticated, service_role;
    `);
    await db.exec(await readFile(new URL("./fixtures/private-development-access.sql", import.meta.url), "utf8"));
    await db.exec(`
      create policy private_development on public.fixture_records as restrictive for all
        to anon, authenticated using ((select private.private_development_allowed()))
        with check ((select private.private_development_allowed()));
    `);

    async function as(role, claims, query, args = []) {
      return db.transaction(async (tx) => {
        await tx.exec(`set local role ${role}`);
        await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
        return (await tx.query(query, args)).rows;
      });
    }
    const ownerClaims = { sub: owner, aal: "aal2", session_id: ownerSession };
    const memberClaims = { sub: member, aal: "aal2", session_id: memberSession };
    const read = (role, claims = {}) => as(role, claims, "select * from public.fixture_records");
    const access = (role, claims) => as(role, claims, "select private.private_development_allowed() as allowed");

    assert.equal((await read("anon")).length, 1);
    assert.equal((await read("authenticated", memberClaims)).length, 1);
    await assert.rejects(as("authenticated", ownerClaims, "insert into public.fixture_records values (2)"), /row-level security/);
    await assert.rejects(as("authenticated", memberClaims,
      "update private.private_development_settings set enabled = true"), /permission denied/);
    await assert.rejects(as("service_role", {},
      "update private.private_development_settings set enabled = true"), /permission denied/);

    await db.query("insert into private.private_development_owners values ($1)", [owner]);
    await db.exec("update private.private_development_settings set enabled = true");
    assert.equal((await read("anon")).length, 0);
    assert.equal((await read("authenticated", memberClaims)).length, 0);
    assert.equal((await read("authenticated", ownerClaims)).length, 1);
    assert.equal((await read("authenticated", { ...ownerClaims, aal: "aal1" })).length, 0);
    assert.equal((await read("authenticated", { ...ownerClaims, is_anonymous: true })).length, 0);
    assert.equal((await read("authenticated", { ...ownerClaims, session_id: memberSession })).length, 0);
    assert.equal((await read("authenticated", { ...ownerClaims, session_id: "not-a-uuid" })).length, 0);
    assert.equal((await read("authenticated", { sub: owner, aal: "aal2" })).length, 0);
    assert.equal((await read("service_role")).length, 1);
    await assert.rejects(as("authenticated", ownerClaims, "insert into public.fixture_records values (2)"), /row-level security/);
    await db.query("update auth.sessions set aal = 'aal1' where id = $1", [ownerSession]);
    assert.deepEqual(await access("authenticated", ownerClaims), [{ allowed: false }]);
    await db.query("update auth.sessions set aal = 'aal2' where id = $1", [ownerSession]);
    await db.query("update auth.users set is_anonymous = true where id = $1", [owner]);
    assert.deepEqual(await access("authenticated", ownerClaims), [{ allowed: false }]);
    await db.query("update auth.users set is_anonymous = false, email_confirmed_at = null where id = $1", [owner]);
    assert.deepEqual(await access("authenticated", ownerClaims), [{ allowed: false }]);
    await db.query("update auth.users set email_confirmed_at = now() where id = $1", [owner]);
    await db.query("delete from private.private_development_owners where user_id = $1", [owner]);
    assert.deepEqual(await access("authenticated", ownerClaims), [{ allowed: false }]);
    await db.query("insert into private.private_development_owners values ($1)", [owner]);
    assert.deepEqual(await access("authenticated", ownerClaims), [{ allowed: true }]);
    await db.query("update auth.sessions set not_after = now() - interval '1 second' where id = $1", [ownerSession]);
    assert.deepEqual(await access("authenticated", ownerClaims), [{ allowed: false }]);
    await db.query("update auth.sessions set not_after = null where id = $1", [ownerSession]);
    await db.query("update auth.users set banned_until = 'infinity' where id = $1", [owner]);
    assert.deepEqual(await access("authenticated", ownerClaims), [{ allowed: false }]);
    await db.query("update auth.users set banned_until = null where id = $1", [owner]);
    await db.query("delete from auth.sessions where id = $1", [ownerSession]);
    assert.deepEqual(await access("authenticated", ownerClaims), [{ allowed: false }]);
    await db.exec("delete from private.private_development_settings");
    assert.equal((await read("anon")).length, 0);
    await db.exec("insert into private.private_development_settings(enabled) values (false)");
    assert.equal((await read("anon")).length, 1);
    assert.equal((await read("authenticated", memberClaims)).length, 1);
  } finally {
    await db.close();
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { PGlite } from "@electric-sql/pglite";
import { GET as apiGet } from "../src/app/api/staging/private-access/route.stage";
import { GET as pageGet } from "../src/app/staging/private-access/records/route.stage";
import { GET as loginGet, POST as loginPost } from "../src/app/staging/private-access/route.stage";
import { privateAccessConfig, stageBuildProfile } from "../src/lib/private-access-stage-config";
import { stageRedirect } from "../src/lib/private-access-stage";
import { proxy } from "../src/proxy";

const project = "caynldluziwrzmvuslzg";
const origin = "https://atlas-test.vercel.app";
const stage = {
  VERCEL: "1", VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "atlas-private-access",
  VERCEL_URL: new URL(origin).host, VQ_PRIVATE_ACCESS_PROJECT_REF: project,
  NEXT_PUBLIC_SUPABASE_URL: `https://${project}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
  BILLING_ENABLED: "false", LIVE_SCORES_DISABLED: "1", AGE_VERIFICATION_ENABLED: "false",
  VQ_STAGE_BUILD_PROFILE: "gate", VQ_PUBLICATION_PREVIEW_LIVE_ENABLED: "false",
};
const combined = {
  ...stage, VQ_STAGE_BUILD_PROFILE: "combined", STAGING_DISCOVERY_PROJECT: project,
  STAGING_DISCOVERY_ENABLED: "true", STAGING_DISCOVERY_FIXTURES: "true",
  STAGING_DISCOVERY_LINKED_PUBLICATIONS: "false", CONSUMER_UI_ENABLED: "true",
};
const api = "/api/staging/private-access";
const path = "/staging/private-access";
const recordPath = `${path}/records`;
const token = "header.payload.signature";

test("requires explicit stage-only configuration and rejects production and side-effect credentials", () => {
  assert.ok(privateAccessConfig(stage));
  assert.equal(stageBuildProfile(stage), "gate");
  assert.equal(stageBuildProfile(combined), "combined");
  assert.equal(stageBuildProfile({ VERCEL: "1", VERCEL_ENV: "preview" }), "standard");
  assert.equal(stageBuildProfile({ ...combined, VERCEL_ENV: "production" }), "standard");
  assert.throws(() => stageBuildProfile({ ...combined, VQ_STAGE_BUILD_PROFILE: undefined }));
  assert.throws(() => stageBuildProfile({ ...combined, STAGING_DISCOVERY_FIXTURES: "false" }));
  assert.throws(() => stageBuildProfile({ ...combined, STAGING_DISCOVERY_PROJECT: "production" }));
  assert.throws(() => stageBuildProfile({ ...combined, STAGING_DISCOVERY_LINKED_PUBLICATIONS: "true" }));
  const fixture = {
    CI: "true", VERCEL_ENV: "preview", VQ_STAGE_BUILD_PROFILE: "consumer-fixture",
    STAGING_DISCOVERY_PROJECT: "synthetic", NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-public-fixture",
  };
  assert.equal(stageBuildProfile(fixture), "consumer-fixture");
  assert.throws(() => stageBuildProfile({ ...fixture, VERCEL: "1" }));
  for (const name of Object.keys(stage)) {
    assert.equal(privateAccessConfig({ ...stage, [name]: undefined }), null, name);
  }
  for (const overrides of [
    { VERCEL_ENV: "production" },
    { VERCEL_TARGET_ENV: "Atlas-private-access" },
    { VERCEL_URL: "vegasquant.app" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://uowearboulykfcwnuirn.supabase.co" },
    { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_test" },
    { BILLING_ENABLED: "true" },
    { SUPABASE_SERVICE_ROLE_KEY: "fixture-secret" },
    { SPORTRADAR_API_KEY: "fixture-secret" },
    { RESEND_API_KEY: "fixture-secret" },
    { STRIPE_SECRET_KEY: "fixture-secret" },
  ]) assert.equal(privateAccessConfig({ ...stage, ...overrides }), null);
});

test("combined proxy checks the same live stage identity and denies effects before dispatch", async (t) => {
  const variables = { ...combined, VQ_COMBINED_STAGE_BUILD: "1" };
  const saved = Object.fromEntries(Object.keys(variables).map((name) => [name, process.env[name]]));
  Object.assign(process.env, variables);
  t.after(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  const request = (path: string, signedIn = true, method = "GET") =>
    new NextRequest(origin + path, {
      method, headers: signedIn ? { cookie: `__Host-vq-private-access=${token}` } : {},
    });
  let payload = "false";
  const transport = t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, `https://${project}.supabase.co/rest/v1/rpc/vq_private_access_stage_authorized`);
    assert.equal(new Headers(init.headers).get("authorization"), `Bearer ${token}`);
    assert.equal(init.cache, "no-store");
    return new Response(payload);
  });
  const anonymous = await proxy(request("/", false));
  assert.equal(anonymous.status, 303);
  assert.equal(anonymous.headers.get("location"), origin + path);
  for (const apiPath of ["/api/checkout", "/api/notifications/dispatch", "/api/internal/sportradar", "/_next/image"])
    assert.equal((await proxy(request(apiPath))).status, 404);
  assert.equal((await proxy(request("/community", true, "POST"))).status, 405);
  assert.equal(transport.mock.callCount(), 0);
  assert.equal((await proxy(request("/community"))).status, 403);
  payload = "{}";
  assert.equal((await proxy(request("/community"))).status, 503);
  payload = "true";
  for (const url of ["/", "/community", "/staging/discovery/rooms/nba/test", "/nba/games/example"]) {
    const response = await proxy(request(url));
    assert.equal(response.headers.get("x-middleware-next"), "1");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.match(response.headers.get("content-security-policy") ?? "", /connect-src 'self'/);
  }
  assert.equal((await proxy(request("/?game=abc"))).status, 308);
  process.env.STAGING_DISCOVERY_ENABLED = "false";
  assert.equal((await proxy(request("/staging/discovery"))).status, 404);
  delete process.env.VQ_PRIVATE_ACCESS_PROJECT_REF;
  assert.equal((await proxy(request("/community"))).status, 404);
});

test("server routes authorize each request and deny missing configuration", async (t) => {
  const saved = Object.fromEntries(Object.keys(stage).map((name) => [name, process.env[name]]));
  t.after(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  const request = (pathname: string, bearer?: string) => new NextRequest(origin + pathname, {
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  });

  Object.assign(process.env, stage, { VERCEL_ENV: "production" });
  assert.equal(loginGet().status, 404);
  assert.equal((await apiGet(request(api, token))).status, 404);

  Object.assign(process.env, stage);
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  assert.equal((await pageGet(request(recordPath, token))).status, 404);
  Object.assign(process.env, stage);
  assert.equal((await loginPost(new NextRequest(origin + path, { method: "POST" }))).status, 403);

  let body: string | null = "null";
  let status = 200;
  const mock = t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, `https://${project}.supabase.co/rest/v1/rpc/vq_private_access_stage_read`);
    assert.equal(new Headers(init.headers).get("authorization"), `Bearer ${token}`);
    assert.equal(init.cache, "no-store");
    if (body === null) throw new Error("backend unavailable");
    return new Response(body, { status });
  });

  assert.equal((await apiGet(request(api))).status, 401);
  assert.equal((await apiGet(request(api, "invalid"))).status, 401);
  assert.equal(mock.mock.callCount(), 0);
  assert.equal((await apiGet(request(api, token))).status, 403);
  assert.equal((await pageGet(request(recordPath, token))).status, 403);

  status = 401;
  assert.equal((await apiGet(request(api, token))).status, 403);
  status = 200;
  body = '["<synthetic>"]';
  const browser = await pageGet(new NextRequest(origin + recordPath, {
    headers: { cookie: `__Host-vq-private-access=${token}` },
  }));
  assert.equal(browser.status, 200);
  assert.match(await browser.text(), /&lt;synthetic&gt;/);
  assert.equal(browser.headers.get("cache-control"), "private, no-store");
  const response = await apiGet(request(api, token));
  assert.deepEqual(await response.json(), { records: ["<synthetic>"] });

  body = null;
  assert.equal((await apiGet(request(api, token))).status, 503);
  body = '{"records":[]}';
  assert.equal((await pageGet(request(recordPath, token))).status, 503);
  const session = stageRedirect(recordPath, privateAccessConfig(stage)!, token);
  assert.match(session.headers.get("set-cookie") ?? "", /Secure; HttpOnly; SameSite=strict/i);
});

const primary = "11111111-1111-4111-8111-111111111111";
const recovery = "22222222-2222-4222-8222-222222222222";
const member = "33333333-3333-4333-8333-333333333333";
const sessionIds = [
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
];

test("isolated SQL denies stored live sessions, preserves records and workers, and restores prior access", async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      grant usage on schema auth to authenticated;
      create function auth.jwt() returns jsonb language sql stable
        as $$select nullif(current_setting('request.jwt.claims', true), '')::jsonb$$;
      create function auth.uid() returns uuid language sql stable
        as $$select (auth.jwt()->>'sub')::uuid$$;
      create table auth.users (id uuid primary key, email_confirmed_at timestamptz,
        is_anonymous boolean, deleted_at timestamptz, banned_until timestamptz);
      create table auth.sessions (id uuid primary key, user_id uuid not null references auth.users(id),
        aal text, not_after timestamptz);
      create schema supabase_migrations;
      create table supabase_migrations.schema_migrations (version text, name text);
    `);
    const { stagingInstallSql } = await import("../scripts/operations/private-access-stage-install.mjs");
    const install = await stagingInstallSql();
    await assert.rejects(db.exec(install), /requires the consumer synthetic validation database/);
    await db.exec("rollback;");
    await db.exec(`
      insert into supabase_migrations.schema_migrations values
        ('20261115172210', 'consumer_phase1_synthetic_contract_fixture'),
        ('20261115173820', 'consumer_phase1_synthetic_age_shell');
    `);
    await db.exec(install);

    const users = [primary, recovery, member];
    for (const [index, id] of users.entries()) {
      await db.query("insert into auth.users(id, email_confirmed_at) values ($1, now())", [id]);
      await db.query("insert into auth.sessions(id, user_id, aal) values ($1, $2, 'aal2')", [sessionIds[index], id]);
      await db.query("insert into vq_private_access_stage.entitlements(user_id) values ($1)", [id]);
      await db.query("insert into public.vq_private_access_stage_records values ($1, $2)", [id, `original ${index}`]);
    }
    await db.query("insert into vq_private_access_stage.private_development_owners values ($1), ($2)", [primary, recovery]);

    const claims = users.map((sub, i) => ({ sub, session_id: sessionIds[i], aal: "aal2" }));
    async function as(role: "authenticated" | "service_role" | "anon", jwt: object, sql: string, args: string[] = []) {
      return db.transaction(async (tx) => {
        await tx.exec(`set local role ${role}`);
        await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(jwt)]);
        return (await tx.query(sql, args)).rows;
      });
    }
    const read = (jwt: object) => as("authenticated", jwt, "select public.vq_private_access_stage_read() as records");
    const authorize = (jwt: object) => as("authenticated", jwt, "select public.vq_private_access_stage_authorized() as allowed");
    const direct = (jwt: object) => as("authenticated", jwt, "select record from public.vq_private_access_stage_records");
    const setMode = (enabled: boolean) => db.query("update vq_private_access_stage.private_development_settings set enabled = $1", [enabled]);

    await assert.rejects(as("anon", {}, "select public.vq_private_access_stage_read()"), /permission denied/);
    await assert.rejects(as("anon", {}, "select public.vq_private_access_stage_authorized()"), /permission denied/);
    assert.deepEqual(await authorize(claims[0]), [{ allowed: true }]);
    assert.deepEqual(await authorize(claims[1]), [{ allowed: true }]);
    assert.deepEqual(await authorize(claims[2]), [{ allowed: false }]);
    assert.deepEqual(await read(claims[0]), [{ records: ["original 0"] }]);
    assert.deepEqual(await read(claims[1]), [{ records: ["original 1"] }]);
    assert.deepEqual(await read(claims[2]), [{ records: null }]);
    assert.deepEqual(await direct(claims[2]), []);
    assert.deepEqual(await read({ ...claims[0], aal: "aal1" }), [{ records: null }]);
    assert.deepEqual(await read({ ...claims[0], session_id: claims[1].session_id }), [{ records: null }]);
    await assert.rejects(as("authenticated", claims[0], "update vq_private_access_stage.private_development_settings set enabled = false"), /permission denied/);

    await as("service_role", {}, "insert into public.vq_private_access_stage_records values ($1, 'worker output')", [member]);
    await db.query("update vq_private_access_stage.entitlements set active = false where user_id = $1", [recovery]);
    assert.deepEqual(await read(claims[1]), [{ records: null }]);
    await db.query("update vq_private_access_stage.entitlements set active = true where user_id = $1", [recovery]);
    await db.query("delete from auth.sessions where id = $1", [sessionIds[0]]);
    assert.deepEqual(await read(claims[0]), [{ records: null }]);
    assert.deepEqual(await authorize(claims[0]), [{ allowed: false }]);
    assert.deepEqual(await read(claims[1]), [{ records: ["original 1"] }]);

    await setMode(false);
    assert.deepEqual(await authorize(claims[2]), [{ allowed: true }]);
    assert.deepEqual(await read(claims[2]), [{ records: ["original 2", "worker output"] }]);
    assert.deepEqual(await read(claims[0]), [{ records: null }]);
    const recovered = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    await db.query("insert into auth.sessions(id, user_id, aal) values ($1, $2, 'aal2')", [recovered, primary]);
    assert.deepEqual(await direct({ ...claims[0], session_id: recovered }), [{ record: "original 0" }]);
    assert.deepEqual(await direct(claims[0]), []);
    await setMode(true);
    assert.deepEqual(await direct(claims[2]), []);
  } finally {
    await db.close();
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  productionOwnerConfig,
  productionOwnerResponse,
  verifyProductionOwner,
} from "../src/lib/production-owner-preview";
import { createOwnerPreviewSelection } from "../src/lib/production-owner-client";

const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const env = {
  VERCEL_ENV: "production",
  HOME2_PRODUCTION: "owners",
  HOME2_OWNER_IDS: owner,
  NEXT_PUBLIC_SUPABASE_URL: "https://uowearboulykfcwnuirn.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
};
const now = Date.now();
const token = (extra: Record<string, unknown> = {}) =>
  [
    Buffer.from("{}").toString("base64url"),
    Buffer.from(
      JSON.stringify({
        sub: owner,
        session_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "authenticated",
        aal: "aal2",
        exp: Math.floor(now / 1000) + 3600,
        ...extra,
      }),
    ).toString("base64url"),
    "signature",
  ].join(".");
const user = {
  id: owner,
  email_confirmed_at: "2026-01-01T00:00:00Z",
  is_anonymous: false,
};
const verified = (body: unknown = user) =>
  (async () => Response.json(body)) as typeof fetch;
const request = (
  auth = token(),
  origin = "https://vegasquant.app",
  path = "/api/consumer/owner-preview",
) =>
  new Request("https://vegasquant.app" + path, {
    method: "POST",
    headers: { Origin: origin, Authorization: "Bearer " + auth },
  });

test("production preview is dark by default and rejects all unreviewed targets/modes", () => {
  assert.equal(productionOwnerConfig({}), null);
  for (const patch of [
    { HOME2_PRODUCTION: undefined },
    { HOME2_PRODUCTION: "off" },
    { HOME2_PRODUCTION: "true" },
    { HOME2_PRODUCTION: "optin" },
    { HOME2_PRODUCTION: "default" },
    { VERCEL_ENV: "preview" },
    { VERCEL_ENV: undefined },
    { HOME2_OWNER_IDS: "" },
    { HOME2_OWNER_IDS: owner + "," + owner },
    {
      HOME2_OWNER_IDS:
        owner + "," + other + ",33333333-3333-4333-8333-333333333333",
    },
    { HOME2_OWNER_IDS: "00000000-0000-0000-0000-000000000000" },
    { HOME2_OWNER_IDS: "anyone@example.com" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://caynldluziwrzmvuslzg.supabase.co" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://uowearboulykfcwnuirn.supabase.co/" },
    { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_never_accepted" },
    { STAGING_DISCOVERY_ENABLED: "true" },
    { VQ_COMBINED_STAGE_BUILD: "1" },
    { VQ_STAGE_BUILD_PROFILE: "combined" },
  ])
    assert.equal(
      productionOwnerConfig({ ...env, ...patch }),
      null,
      JSON.stringify(patch),
    );
  assert.equal(
    productionOwnerConfig({ ...env, HOME2_OWNER_IDS: owner + "," + other })
      ?.owners.length,
    2,
  );
});
test("public flags, query/body and cookies cannot turn on a dark deployment", async () => {
  const req = new Request(
    "https://vegasquant.app/api/consumer/owner-preview?HOME2_PRODUCTION=owners&owner=" +
      owner,
    {
      method: "POST",
      headers: {
        Origin: "https://vegasquant.app",
        Cookie: "home2=true; owner=" + owner,
        Authorization: "Bearer " + token(),
      },
      body: JSON.stringify({
        enabled: true,
        owner,
        HOME2_PRODUCTION: "owners",
      }),
    },
  );
  const res = await productionOwnerResponse(
    req,
    {
      ...env,
      HOME2_PRODUCTION: undefined,
      NEXT_PUBLIC_HOME2_PRODUCTION: "owners",
    },
    async () => {
      throw Error("Dark deployment must not call Auth");
    },
  );
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { enabled: false });
});
test("only the authenticated server-verified allowlisted owner selects the preview", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (input, init) => {
    calls++;
    assert.equal(input, env.NEXT_PUBLIC_SUPABASE_URL + "/auth/v1/user");
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.redirect, "error");
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer " + token(),
    );
    return Response.json(user);
  };
  assert.equal(await verifyProductionOwner(env, token(), fetcher, now), true);
  assert.equal(calls, 1);
});
test("forged owner claims require Auth validation and a revoked session fails closed", async () => {
  let calls = 0;
  const deny: typeof fetch = async () => {
    calls++;
    return Response.json({ code: "session_not_found" }, { status: 403 });
  };
  assert.equal(await verifyProductionOwner(env, token(), deny, now), false);
  assert.equal(calls, 1);
  assert.equal(
    await verifyProductionOwner(
      env,
      token(),
      async () => {
        throw Error("Unavailable");
      },
      now,
    ),
    false,
  );
});
test("anonymous, expired, AAL1, missing-session and nonowner callers cannot select 2.0", async () => {
  let calls = 0;
  const never: typeof fetch = async () => {
    calls++;
    throw Error("Rejected claims must not trigger network calls");
  };
  for (const t of [
    null,
    "invalid",
    token({ sub: other }),
    token({ aal: "aal1" }),
    token({ exp: Math.floor(now / 1000) }),
    token({ session_id: undefined }),
    token({ session_id: "00000000-0000-0000-0000-000000000000" }),
    token({ is_anonymous: true }),
    token({ role: "service_role" }),
  ])
    assert.equal(await verifyProductionOwner(env, t, never, now), false);
  assert.equal(calls, 0);
});
test("user metadata and email cannot substitute for the verified UUID; malformed Auth replies deny", async () => {
  for (const response of [
    { ...user, id: other, user_metadata: { owner: true } },
    { ...user, email_confirmed_at: null },
    { ...user, is_anonymous: true },
    { ...user, deleted_at: "2026-01-01" },
    { ...user, banned_until: "2099-01-01" },
    { ...user, banned_until: "invalid" },
    null,
    {},
  ])
    assert.equal(
      await verifyProductionOwner(env, token(), verified(response), now),
      false,
    );
});
test("cross-origin/GET/noncanonical-host requests reject; cookies alone are ignored", async () => {
  for (const req of [
    request(token(), "https://attacker.invalid"),
    new Request("https://vegasquant.app/api/consumer/owner-preview"),
    new Request("https://vegasquant.app:8443/api/consumer/owner-preview", {
      method: "POST",
      headers: { Origin: "https://vegasquant.app:8443" },
    }),
    new Request("https://preview.vercel.app/api/consumer/owner-preview", {
      method: "POST",
      headers: { Origin: "https://preview.vercel.app" },
    }),
  ])
    assert.equal(
      (await productionOwnerResponse(req, env, verified())).status,
      403,
    );
  const r = await productionOwnerResponse(
    new Request("https://vegasquant.app/api/consumer/owner-preview", {
      method: "POST",
      headers: {
        Origin: "https://vegasquant.app",
        Cookie: "access_token=" + token(),
      },
    }),
    env,
    verified(),
  );
  assert.deepEqual(await r.json(), { enabled: false });
});
test("selection response is private, contains only a boolean, and sets no cookie", async () => {
  const r = await productionOwnerResponse(request(), env, verified());
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { enabled: true });
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  assert.match(r.headers.get("vary")!, /Authorization/);
  assert.equal(r.headers.has("set-cookie"), false);
});
test("account switch and sign-out discard a late successful owner response", async () => {
  const rendered: boolean[] = [];
  let resolve!: (r: Response) => void;
  const controller = createOwnerPreviewSelection(
    (v) => rendered.push(v),
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const pending = controller.check("owner-token");
  await controller.check(null);
  resolve(Response.json({ enabled: true }));
  await pending;
  assert.deepEqual(rendered, [false, false]);
  controller.dispose();
  await controller.check("later");
  assert.deepEqual(rendered, [false, false]);
});
test("only the server's answer for the current token is marked settled", async () => {
  const calls: [boolean, boolean][] = [];
  const c = createOwnerPreviewSelection(
    (v, settled) => calls.push([v, settled]),
    async () => Response.json({ enabled: true }),
  );
  await c.check(null);
  await c.check("owner-token");
  assert.deepEqual(calls, [
    [false, false],
    [false, false],
    [true, true],
  ]);
  c.dispose();
});
test("client fails closed on rejection/malformed replies and does not send cookies", async () => {
  for (const response of [
    Response.json({ enabled: false }),
    Response.json({ enabled: "true" }),
    new Response("unavailable", { status: 503 }),
  ]) {
    const rendered: boolean[] = [];
    const c = createOwnerPreviewSelection(
      (v) => rendered.push(v),
      async (_input, init) => {
        assert.equal(init?.credentials, "omit");
        assert.equal(init?.method, "POST");
        return response;
      },
    );
    await c.check("token");
    assert.deepEqual(rendered, [false, false]);
    c.dispose();
  }
});
test("current owner approval mounts 2.0 and a later failed recheck restores classic", async () => {
  const rendered: boolean[] = [];
  let allowed = true;
  const c = createOwnerPreviewSelection(
    (v) => rendered.push(v),
    async () =>
      allowed
        ? Response.json({ enabled: true })
        : new Response(null, { status: 404 }),
  );
  await c.check("current-owner");
  assert.deepEqual(rendered, [false, true]);
  allowed = false;
  await c.check("current-owner", false);
  assert.deepEqual(rendered, [false, true, false]);
  c.dispose();
});

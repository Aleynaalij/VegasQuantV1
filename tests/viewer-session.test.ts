import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { stageViewerSession } from "../src/lib/stage-viewer-session";
import {
  stageDataGateway,
  stageDataQuery,
} from "../src/lib/stage-data-gateway";
import { stageDataFetch } from "../src/lib/stage-data-client";
import { viewerPresentation } from "../src/lib/viewer-presentation";
import { emptyViewer, type ViewerIdentity } from "../src/lib/viewer-contract";
import { createViewerSessionClient } from "../src/lib/viewer-session-client";
import { projectViewerUser } from "../src/lib/viewer-contract";
const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "fixture@example.invalid",
  user_metadata: { name: "Fixture", secret: "must never escape" },
  app_metadata: { provider: "email", admin: true },
  access_token: "never-client",
};
const ready = {
  state: "ready",
  session: { user: projectViewerUser(user), transport: "httpOnly-stage" },
  age: "verified",
};
const env = {
  VERCEL: "1",
  VERCEL_ENV: "preview",
  VERCEL_TARGET_ENV: "atlas-private-access",
  VERCEL_URL: "atlas-review.vercel.app",
  VQ_PRIVATE_ACCESS_PROJECT_REF: "caynldluziwrzmvuslzg",
  VQ_STAGE_BUILD_PROFILE: "combined",
  NEXT_PUBLIC_SUPABASE_URL: "https://caynldluziwrzmvuslzg.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
  BILLING_ENABLED: "false",
  LIVE_SCORES_DISABLED: "1",
  AGE_VERIFICATION_ENABLED: "false",
  VQ_PUBLICATION_PREVIEW_LIVE_ENABLED: "false",
  STAGING_DISCOVERY_PROJECT: "caynldluziwrzmvuslzg",
  STAGING_DISCOVERY_ENABLED: "true",
  STAGING_DISCOVERY_FIXTURES: "false",
  VQ_STAGE_RESEARCH_CONTRACT: "vq-stage-session-v1",
  STAGING_DISCOVERY_LINKED_PUBLICATIONS: "false",
  CONSUMER_UI_ENABLED: "true",
};
const req = (
  path = "session",
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  new NextRequest("https://atlas-review.vercel.app/staging/discovery/" + path, {
    method,
    headers: {
      cookie: "__Host-vq-private-access=owner.fixture.token",
      origin: "https://atlas-review.vercel.app",
      "content-type": "application/json",
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
test("viewer and data boundary: owner, denial, original age/entitlement, race revocation, fail-closed transport and real logout", async (t) => {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  t.after(() => {
    for (const k of Object.keys(process.env))
      if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  });
  let gate = true,
    age = true,
    member = true,
    outage = false,
    malformed = false,
    race = false,
    dataRace: "age" | "member" | "outage" | null = null,
    logout = 204,
    revokeOnLogout = true;
  const calls: string[] = [];
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    assert.equal(url.origin, env.NEXT_PUBLIC_SUPABASE_URL);
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      "Bearer owner.fixture.token",
    );
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    if (outage) throw Error("offline");
    if (url.pathname.endsWith("authorized")) return Response.json(gate);
    if (url.pathname.endsWith("age_verification_status"))
      return Response.json({ synthetic: true, verified: age });
    if (url.pathname.endsWith("membership_status"))
      return Response.json({ allowed: member });
    if (url.pathname.endsWith("/user")) {
      if (race) gate = false;
      return Response.json(malformed ? {} : user);
    }
    if (url.pathname.endsWith("/logout")) {
      if (logout === 204 && revokeOnLogout) gate = false;
      return new Response(null, { status: logout });
    }
    if (url.pathname.endsWith("game_zone_posts")) {
      if (dataRace === "age") age = false;
      if (dataRace === "member") member = false;
      if (dataRace === "outage") outage = true;
      return Response.json([
        {
          id: "original-id",
          created_at: "2026-11-17T12:00:00Z",
          body: "Original source",
        },
      ]);
    }
    throw Error(url.pathname);
  };
  let response: Response = await stageViewerSession(req(), transport);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.session.user, projectViewerUser(user));
  assert.equal(data.age, "verified");
  assert.deepEqual(data.capabilities, {
    profile: false,
    notifications: false,
    social: false,
    desk: false,
    research: false,
  });
  assert(!JSON.stringify(data).includes("must never"));
  assert(!JSON.stringify(data).includes("access_token"));
  assert.equal(
    (
      await stageViewerSession(
        req("session", "GET", undefined, { cookie: "" }),
        transport,
      )
    ).status,
    401,
  );
  assert.equal(
    (await stageViewerSession(req("session?user=other"), transport)).status,
    400,
  );
  assert.equal(
    (
      await stageViewerSession(
        req("session", "GET", undefined, {
          authorization: "Bearer other.fixture.token",
        }),
        transport,
      )
    ).status,
    400,
  );
  gate = false;
  assert.equal((await stageViewerSession(req(), transport)).status, 403);
  gate = true;
  age = false;
  assert.equal((await stageViewerSession(req(), transport)).status, 403);
  age = true;
  member = false;
  assert.equal((await stageViewerSession(req(), transport)).status, 403);
  member = true;
  malformed = true;
  assert.equal((await stageViewerSession(req(), transport)).status, 503);
  malformed = false;
  race = true;
  assert.equal((await stageViewerSession(req(), transport)).status, 403);
  race = false;
  gate = true;
  outage = true;
  assert.equal((await stageViewerSession(req(), transport)).status, 503);
  outage = false;
  const before = calls.length;
  assert.equal(
    (
      await stageViewerSession(
        req("session", "POST", {}, { origin: "https://evil.invalid" }),
        transport,
      )
    ).status,
    403,
  );
  assert.equal(calls.length, before);
  logout = 503;
  response = await stageViewerSession(req("session", "POST", {}), transport);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("set-cookie"), null);
  logout = 204;
  revokeOnLogout = false;
  assert.equal(
    (await stageViewerSession(req("session", "POST", {}), transport)).status,
    503,
  );
  revokeOnLogout = true;
  response = await stageViewerSession(req("session", "POST", {}), transport);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie")!, /HttpOnly/);
  assert.match(response.headers.get("set-cookie")!, /Max-Age=0/);
  gate = true;
  const query = {
    path: "rpc/game_zone_posts",
    method: "POST",
    query: "",
    accept: null,
    body: JSON.stringify({ p_sport: "nba", p_game: user.id }),
  };
  response = await stageDataGateway(req("data", "POST", query), transport);
  assert.equal(response.status, 200);
  assert.equal((await response.json())[0].id, "original-id");
  for (const mutation of ["age", "member", "outage"] as const) {
    dataRace = mutation;
    response = await stageDataGateway(req("data", "POST", query), transport);
    assert.equal(response.status, mutation === "outage" ? 503 : 403);
    assert(!JSON.stringify(await response.json()).includes("original-id"));
    age = member = true;
    outage = false;
  }
  dataRace = null;
  for (const endpoint of ["age_verification_status", "membership_status"]) {
    let reads = 0;
    const changing: typeof fetch = async (input, init) => {
      if (String(input).endsWith(endpoint) && ++reads === 2)
        return Response.json(
          endpoint === "membership_status"
            ? { allowed: false }
            : { synthetic: true, verified: false },
        );
      return transport(input, init);
    };
    response = await stageViewerSession(req(), changing);
    assert.equal(
      response.status,
      403,
      `identity eligibility changed during ${endpoint}`,
    );
    assert(!JSON.stringify(await response.json()).includes(user.email));
  }
  for (const path of [
    "community_posts",
    "rpc/create_community_post",
    "rpc/community_activity",
    "rpc/community_comments",
    "rpc/notification_inbox",
    "rpc/notification_action",
    "rpc/create_member_parlay",
    "rpc/share_member_parlay",
    "rpc/community_profile",
    "saved_legs",
    "member_parlays",
    "notification_preferences",
    "member_follows",
    "rpc/notification_sync_updates",
    "rpc/checkout",
    "../auth/v1/admin",
    "storage/v1/object",
  ]) {
    const n = calls.length;
    response = await stageDataGateway(
      req("data", "POST", { ...query, path }),
      transport,
    );
    assert.equal(response.status, 503, path);
    assert(!calls.slice(n).some((p) => p.includes(path)));
  }
  gate = false;
  assert.equal(
    (await stageDataGateway(req("data", "POST", query), transport)).status,
    403,
  );
  gate = true;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  assert.equal((await stageViewerSession(req(), transport)).status, 404);
  assert.equal(
    (await stageDataGateway(req("data", "POST", query), transport)).status,
    404,
  );
});
test("gateway allowlist cannot select another schema/user or forward arbitrary RPC and browser credentials", async () => {
  const good = {
    path: "rpc/sports_slate",
    query: "",
    method: "POST",
    accept: null,
    body: '{"p_sport":"nba"}',
  };
  assert(stageDataQuery(good));
  for (const bad of [
    { ...good, query: "?select=*" },
    { ...good, path: "rpc/is_admin" },
    { ...good, body: '{"p_sport":"nba","user_id":"other"}' },
    { ...good, method: "PATCH" },
    { ...good, path: "rpc/sports_slate%2fadmin" },
    { ...good, apikey: "secret" },
  ])
    assert.equal(stageDataQuery(bad), null);
  const calls: unknown[] = [];
  const transport: typeof fetch = async (url, init) => {
    calls.push({ url, init });
    assert.equal(url, "/staging/discovery/data");
    assert(!String(init?.body).includes("browser-secret"));
    assert.equal(new Headers(init?.headers).get("authorization"), null);
    return Response.json(true);
  };
  const bridge = stageDataFetch(env.NEXT_PUBLIC_SUPABASE_URL, transport);
  assert.equal(
    (
      await bridge(
        env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/rpc/membership_status",
        {
          method: "POST",
          headers: {
            apikey: "browser-secret",
            authorization: "Bearer browser-secret",
          },
          body: "{}",
        },
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await bridge(
        "https://uowearboulykfcwnuirn.supabase.co/rest/v1/rpc/membership_status",
      )
    ).status,
    503,
  );
  assert.equal(
    (await bridge(env.NEXT_PUBLIC_SUPABASE_URL + "/storage/v1/object")).status,
    503,
  );
  assert.equal(calls.length, 1);
});
test("viewer client drops delayed identities, clears before revalidation, deduplicates, and distinguishes denial/error/logout failure", async () => {
  const pending: ((r: Response) => void)[] = [];
  const c = createViewerSessionClient(
    async () => new Promise((resolve) => pending.push(resolve)),
  );
  const old = c.read();
  await Promise.resolve();
  assert.equal(pending.length, 1);
  c.invalidate();
  const next = c.read();
  await Promise.resolve();
  pending[1](Response.json({ state: "denied" }, { status: 403 }));
  await next;
  pending[0](Response.json(ready));
  assert.equal((await old).state, "denied");
  assert.equal(c.getSnapshot().session, null);
  const good = c.read();
  await Promise.resolve();
  pending[2](Response.json(ready));
  await good;
  assert.equal(c.getSnapshot().session?.user.id, user.id);
  const cached = c.read();
  assert.equal((await cached).state, "ready");
  assert.equal(pending.length, 3);
  const check = c.read(true);
  assert.equal(c.getSnapshot().session, null);
  await Promise.resolve();
  pending[3](new Response("<html>login</html>"));
  await check;
  assert.equal(c.getSnapshot().state, "error");
  const logout = c.signOut();
  assert.equal(c.getSnapshot().session, null);
  pending[4](new Response(null, { status: 503 }));
  assert((await logout).error);
  assert.equal(c.getSnapshot().state, "error");
  const retry = c.signOut();
  pending[5](Response.json({ state: "anonymous" }));
  assert.equal((await retry).error, null);
  assert.equal(c.getSnapshot().state, "anonymous");
});

test("forced foreground refresh aborts A and cannot reinstate it after B denial, including signout invalidation", async () => {
  const waiting: ((r: Response) => void)[] = [];
  const signals: AbortSignal[] = [];
  const c = createViewerSessionClient(async (_url, init) => {
    if (init?.signal) signals.push(init.signal);
    return new Promise((resolve) => waiting.push(resolve));
  });
  const a = c.read();
  await Promise.resolve();
  const b = c.read(true);
  await Promise.resolve();
  assert.notEqual(a, b);
  assert.equal(waiting.length, 2);
  assert(signals[0].aborted);
  waiting[1](Response.json({ state: "denied" }, { status: 403 }));
  await b;
  waiting[0](Response.json(ready));
  await a;
  assert.equal(c.getSnapshot().state, "denied");
  const logout = c.signOut();
  assert.equal(c.signOut(), logout);
  c.invalidate();
  assert.equal((await c.read(true)).session, null);
  assert.equal(waiting.length, 3);
  waiting[2](Response.json({ state: "anonymous" }));
  await logout;
  assert.equal(c.getSnapshot().state, "anonymous");
});
test("consumer states never turn verifier error, missing age or denied access into Login/authorized profile", () => {
  for (const state of ["checking", "anonymous", "denied", "error"] as const) {
    const v = { ...emptyViewer, state };
    const p = viewerPresentation(v);
    assert.equal(p.allowed, false);
    assert.notEqual(p.accountLabel, "Login");
    if (state === "error") assert.match(p.accountLabel, /unavailable/);
  }
  const v = {
    ...ready,
    capabilities: emptyViewer.capabilities,
  } as ViewerIdentity;
  assert.equal(viewerPresentation(v).accountLabel, "Account");
  assert.equal(viewerPresentation({ ...v, age: "unknown" }).allowed, false);
  assert.equal(viewerPresentation({ ...v, session: null }).allowed, false);
});

test("unverified full-sheet download fails before a second SDK session or network access", async (t) => {
  const keys = [
    "VQ_COMBINED_STAGE_BUILD",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ] as const;
  const before = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  Object.assign(process.env, {
    VQ_COMBINED_STAGE_BUILD: "1",
    NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  t.after(() => {
    for (const k of keys) {
      if (before[k] === undefined) delete process.env[k];
      else process.env[k] = before[k];
    }
  });
  const { fetchNbaMatchupSheet } = await import(
    "../src/lib/nba-matchup-sheet-client"
  );
  await assert.rejects(
    fetchNbaMatchupSheet(user.id, new AbortController().signal),
    /unavailable until their isolated publication and source contracts are verified/,
  );
});

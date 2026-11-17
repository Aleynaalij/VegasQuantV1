import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { readStageConsumer } from "../src/lib/stage-consumer-reader";
import {
  stageConsumerRoute,
  STAGE_CONSUMER_ROUTES,
} from "../src/lib/stage-route-policy";
import { privateAccessConfig } from "../src/lib/private-access-stage-config";

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
const originalPost = {
  id: "11111111-1111-4111-8111-111111111111",
  sport: "nba",
  title: "Synthetic research",
  body: "Original sources https://example.com/research",
  created_at: "2026-11-01T15:00:00Z",
};
const req = (suffix = "dealer?sport=nba", token = "owner.fixture.token") =>
  new NextRequest(
    "https://atlas-review.vercel.app/staging/discovery/read/" + suffix,
    { headers: token ? { cookie: `__Host-vq-private-access=${token}` } : {} },
  );

test("explicit consumer route inventory restores actual destinations without admitting nested APIs", () => {
  for (const path of STAGE_CONSUMER_ROUTES)
    assert.equal(
      stageConsumerRoute(path.replace(/\[[^\]]+\]/g, "example")),
      true,
      path,
    );
  for (const path of [
    "/membership",
    "/notifications",
    "/slots",
    "/vegas-fear",
    "/privacy",
    "/support/report",
    "/account/recovery",
  ])
    assert.ok(stageConsumerRoute(path));
  for (const path of [
    "/api/checkout",
    "/picks/id/image",
    "/nba/unreviewed",
    "/account/delete",
    "/admin",
    "/sw.js",
  ])
    assert.equal(stageConsumerRoute(path), false, path);
});

test("request-scoped reader checks live authorization, age and original entitlement and discards revoked in-flight data", async (t) => {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  t.after(() => {
    for (const name of Object.keys(process.env))
      if (!(name in saved)) delete process.env[name];
    Object.assign(process.env, saved);
  });
  assert.ok(privateAccessConfig(env));
  assert.equal(
    privateAccessConfig({ ...env, VQ_STAGE_RESEARCH_CONTRACT: "wrong" }),
    null,
  );
  let gate = true,
    age = true,
    member = true,
    unavailable = false,
    malformed = false,
    revokeDuringRead = false;
  let requests = 0;
  const transport: typeof fetch = async (input, init) => {
    requests++;
    const url = new URL(String(input));
    assert.equal(url.origin, env.NEXT_PUBLIC_SUPABASE_URL);
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      "Bearer owner.fixture.token",
    );
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.redirect, "error");
    if (unavailable) throw Error("outage");
    if (url.pathname.endsWith("vq_private_access_stage_authorized"))
      return Response.json(gate);
    if (url.pathname.endsWith("age_verification_status"))
      return Response.json({ synthetic: true, verified: age });
    if (url.pathname.endsWith("membership_status"))
      return Response.json({ allowed: member });
    if (url.pathname.endsWith("vq_private_access_stage_dealer_feed")) {
      assert.deepEqual(JSON.parse(String(init?.body)), {
        p_sport: "nba",
        p_limit: 3,
      });
      if (revokeDuringRead) gate = false;
      return Response.json(
        malformed
          ? { contract: "untrusted", posts: [] }
          : { contract: "vq-stage-dealer-v1", posts: [originalPost] },
      );
    }
    // Existing research reader reaches only the isolated REST stores, retaining its provenance adapters.
    if (url.pathname.endsWith("sports_slate")) {
      const sport = JSON.parse(String(init?.body)).p_sport;
      return Response.json({
        version: 1,
        sport,
        access: true,
        games: [],
        facts: [],
        markets: [],
        selections: [],
      });
    }
    if (url.pathname.endsWith("games") || url.pathname.endsWith("nba_games"))
      return Response.json([]);
    throw Error("Unexpected downstream path: " + url.pathname);
  };
  assert.equal(
    (await readStageConsumer(req("dealer", ""), "dealer", transport)).status,
    401,
  );
  assert.equal(requests, 0);
  assert.equal(
    (
      await readStageConsumer(
        req("dealer?url=https://vegasquant.app"),
        "dealer",
        transport,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await readStageConsumer(
        req("dealer?sport=nba&sport=nhl"),
        "dealer",
        transport,
      )
    ).status,
    400,
  );
  gate = false;
  assert.equal(
    (await readStageConsumer(req(), "dealer", transport)).status,
    403,
  );
  gate = true;
  age = false;
  assert.equal(
    (await readStageConsumer(req(), "dealer", transport)).status,
    403,
  );
  age = true;
  member = false;
  assert.equal(
    (await readStageConsumer(req(), "dealer", transport)).status,
    403,
  );
  member = true;
  const ready = await readStageConsumer(req(), "dealer", transport);
  assert.equal(ready.status, 200);
  assert.match(ready.headers.get("cache-control")!, /no-store/);
  const post = (await ready.json()).posts[0];
  for (const key of Object.keys(originalPost))
    assert.equal(post[key], originalPost[key as keyof typeof originalPost]);
  malformed = true;
  assert.equal(
    (await readStageConsumer(req(), "dealer", transport)).status,
    503,
  );
  malformed = false;
  revokeDuringRead = true;
  assert.equal(
    (await readStageConsumer(req(), "dealer", transport)).status,
    403,
  );
  gate = true;
  revokeDuringRead = false;
  const research = await readStageConsumer(
    req("research"),
    "research",
    transport,
  );
  assert.equal(research.status, 200);
  assert.deepEqual((await research.json()).events, []);
  unavailable = true;
  assert.equal(
    (await readStageConsumer(req(), "dealer", transport)).status,
    503,
  );
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  assert.equal(
    (await readStageConsumer(req(), "dealer", transport)).status,
    404,
  );
});

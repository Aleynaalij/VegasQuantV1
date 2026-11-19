import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { discoveryStagingEnabled } from "../src/lib/discovery/access";
import {
  coverage,
  discoveryHref,
  eventResearchHref,
  findingHref,
  fullMatchupHref,
  compactText,
  chronologicalFindings,
} from "../src/lib/discovery/model";
import {
  fixtureScenario,
  stagingDiscoveryFixture,
} from "../src/lib/discovery/fixtures";
const permitted = {
  VERCEL_ENV: "preview",
  STAGING_DISCOVERY_ENABLED: "true",
  STAGING_DISCOVERY_PROJECT: "example-staging",
  NEXT_PUBLIC_SUPABASE_URL: "https://example-staging.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-test-only",
};
test("Phase 1 is default off and cannot be enabled on production or the production database", () => {
  assert.equal(discoveryStagingEnabled({}), false);
  assert.equal(discoveryStagingEnabled(permitted), true);
  for (const patch of [
    { VERCEL_ENV: "production" },
    { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" },
    { STAGING_DISCOVERY_ENABLED: "false" },
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://uowearboulykfcwnuirn.supabase.co",
      STAGING_DISCOVERY_PROJECT: "uowearboulykfcwnuirn",
    },
    {
      NEXT_PUBLIC_SUPABASE_URL:
        "https://example-staging.supabase.co.attacker.test",
    },
    { NEXT_PUBLIC_SUPABASE_URL: "http://example-staging.supabase.co" },
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://user:pass@example-staging.supabase.co",
    },
    { STAGING_DISCOVERY_PROJECT: "other" },
  ])
    assert.equal(discoveryStagingEnabled({ ...permitted, ...patch }), false);
});
test("discovery and original research retain exact canonical identity without inventing games", () => {
  const event = stagingDiscoveryFixture.events.find((e) => e.sport === "nba")!;
  const href = discoveryHref(event.key, "nba", "starter & weather");
  const url = new URL(href, "https://example.test");
  assert.equal(url.searchParams.get("event"), event.key);
  assert.equal(url.searchParams.get("q"), "starter & weather");
  assert.equal(
    new URL(eventResearchHref(event), "https://example.test").searchParams.get(
      "event",
    ),
    event.key,
  );
  assert.equal(fullMatchupHref(event), "/nba/games/fixture-nba");
  const finding = stagingDiscoveryFixture.findings[0];
  assert.equal(
    new URL(
      findingHref(event, finding),
      "https://example.test",
    ).searchParams.get("topic"),
    finding.topic,
  );
});
test("coverage distinguishes denied, signed out, empty and unavailable", () => {
  const event = stagingDiscoveryFixture.events.find((e) => e.sport === "nba")!;
  assert.equal(
    coverage(fixtureScenario("denied"), event),
    "Research access required",
  );
  assert.equal(
    coverage(fixtureScenario("signed-out"), event),
    "Sign in for research",
  );
  assert.equal(
    coverage(fixtureScenario("unavailable"), event),
    "Research availability unverified",
  );
  assert.equal(
    coverage({ ...stagingDiscoveryFixture, findings: [] }, event),
    "No research returned",
  );
  assert.match(coverage(stagingDiscoveryFixture, event), /^2 research items$/);
  assert.match(
    coverage({ ...stagingDiscoveryFixture, truncated: true }, event),
    /partial coverage/,
  );
});
test("compact previews never mutate or discard original research fields", () => {
  const original = stagingDiscoveryFixture.findings[1],
    copy = structuredClone(original);
  assert.ok(compactText(original.text).length <= 181);
  assert.deepEqual(original, copy);
  const items = chronologicalFindings(stagingDiscoveryFixture.findings);
  assert.equal(items[0].id, "fixture-correction");
  assert.equal(stagingDiscoveryFixture.findings[0].id, "fixture-availability");
});
test("all four sports and explicit edge states are covered by synthetic fixtures", () => {
  assert.deepEqual(
    stagingDiscoveryFixture.events.map((e) => e.sport),
    ["nfl", "nba", "nhl", "ncaab"],
  );
  assert.equal(fixtureScenario("empty").events.length, 0);
  assert.equal(fixtureScenario("signed-out").findings.length, 0);
  assert.equal(fixtureScenario("denied").findings.length, 0);
});
test("candidate retains existing destinations, read-only adapters and critical accessibility controls", () => {
  const component = readFileSync(
      "src/components/discovery/discovery.tsx",
      "utf8",
    ),
    css = readFileSync("src/components/discovery/discovery.css", "utf8"),
    route = readFileSync("src/app/staging/discovery/page.tsx", "utf8");
  for (const route of [
    "/research",
    "/community?view=dealer",
    "/parlays?build=1",
    "/parlays",
    "/membership",
    "/vegas-fear",
    "/history",
  ])
    assert.ok(component.includes(route), route);
  assert.ok(component.includes('supabase.rpc("game_zone_posts"'));
  assert.ok(component.includes("readResearchHub()"));
  assert.ok(!/\.insert\(|\.update\(|\.delete\(|\.upsert\(/.test(component));
  assert.ok(component.includes('aria-live="polite"'));
  assert.ok(component.includes('<label htmlFor="d1-sport">Sport</label>'));
  assert.ok(component.includes('id="d1-sport"'));
  assert.ok(component.includes('id="d1-title"'));
  assert.ok(component.includes("tabIndex={-1}"));
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /min-height: 44px/);
  assert.ok(route.includes("discoveryStagingEnabled(process.env)"));
  assert.ok(route.includes("notFound()"));
});

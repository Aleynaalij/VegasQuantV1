import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  consumerExperienceEnabled,
  legacyGameDestination,
  legacyLayDestination,
} from "../src/lib/consumer-experience";
const safe = {
  CONSUMER_UI_ENABLED: "true",
  VERCEL_ENV: "preview",
  STAGING_DISCOVERY_ENABLED: "true",
  STAGING_DISCOVERY_PROJECT: "synthetic",
  NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public",
};
test("replacement selection defaults off and remains isolated from production", () => {
  assert.equal(consumerExperienceEnabled(safe), true);
  for (const patch of [
    { CONSUMER_UI_ENABLED: "false" },
    { CONSUMER_UI_ENABLED: undefined },
    { VERCEL_ENV: "production" },
    { STAGING_DISCOVERY_ENABLED: "false" },
    { STAGING_DISCOVERY_PROJECT: "other" },
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://uowearboulykfcwnuirn.supabase.co",
      STAGING_DISCOVERY_PROJECT: "uowearboulykfcwnuirn",
    },
  ])
    assert.equal(consumerExperienceEnabled({ ...safe, ...patch }), false);
  assert.equal(consumerExperienceEnabled({}), false);
});
test("legacy game routes retain all query values and exact hash", () => {
  assert.equal(
    legacyGameDestination({
      game: "a b",
      x: ["1", "2"],
      empty: "",
      absent: undefined,
    }),
    "/nfl?game=a+b&x=1&x=2&empty=#home-games",
  );
  assert.equal(legacyGameDestination({ sport: "nba" }), null);
});
test("legacy saved/build links retain their existing destination contract", () => {
  assert.equal(
    legacyLayDestination({ saved: "a b" }),
    "/parlays?saved=a%20b#my-parlay-a%20b",
  );
  assert.equal(legacyLayDestination({ build: "" }), "/parlays");
  assert.equal(
    legacyLayDestination({ post: "id", comment: "c", view: "vip" }),
    null,
  );
});
test("same candidate components replace root routes while preserving legacy fallback", () => {
  const home = readFileSync("src/app/page.tsx", "utf8");
  const zone = readFileSync("src/app/community/page.tsx", "utf8");
  assert.match(home, /consumerExperienceEnabled\(process.env\)/);
  assert.match(home, /<HomeExperience/);
  assert.match(home, /<VqLobby/);
  assert.match(zone, /<Zone2Experience basePath="\/community"/);
  assert.match(zone, /<CommunityFeed/);
  assert.ok(
    home.indexOf('Object.hasOwn(query, "game")') <
      home.indexOf("if (consumerExperienceEnabled"),
  );
  assert.ok(
    zone.indexOf('Object.hasOwn(query, "build")') <
      zone.indexOf("{consumerExperienceEnabled"),
  );
});

import { execFileSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";
import {
  currentRubyFeature,
  rubyBrands,
  rubyLegs,
  rubyOdds,
  rubyLink,
} from "../src/lib/ruby.ts";
import { notificationLink } from "../src/lib/notifications.ts";
test("permanent Ruby identities have five different template signatures", () => {
  assert.equal(new Set(rubyBrands.map((x) => x.brand)).size, 5);
  assert.equal(new Set(rubyBrands.map((x) => x.theme)).size, 5);
});
test("typed slips preserve exact selections; missing odds stay unknown", () => {
  assert.deepEqual(rubyLegs("  A over 15.5\n\n B 2+ receptions "), [
    "A over 15.5",
    "B 2+ receptions",
  ]);
  assert.equal(rubyOdds(""), null);
  assert.equal(rubyOdds("+450"), 450);
  assert.equal(rubyOdds("-150"), -150);
  for (const value of ["2.5", "NaN", "+99", "1000000", "+100 boost"])
    assert.throws(() => rubyOdds(value));
});
test("contributor notifications open the exact Zone card and reject foreign links", () => {
  assert.equal(
    notificationLink(rubyLink("test-card")),
    "/feed?view=contributors&ruby=test-card#ruby-test-card",
  );
  assert.equal(notificationLink("//evil.test/feed"), "/notifications");
  assert.equal(notificationLink("/feed-evil"), "/notifications");
});

test("Ruby server permissions and transactional publication", () => {
  execFileSync(process.execPath, ["tests/sql/ruby-contributors.mjs"], {
    stdio: "pipe",
    timeout: 60000,
  });
});

test("empty feature responses never match missing account dates", () => {
  assert.equal(currentRubyFeature(undefined, []), null);
  assert.equal(currentRubyFeature("2026-10-23", []), null);
  const feature = {
    day: "2026-10-22",
    submission_id: "old",
    verified_odds: 100,
    sportsbook: "Sample",
    source_url: "https://example.invalid",
    observed_at: "2026-10-22T12:00:00Z",
  };
  assert.equal(currentRubyFeature("2026-10-23", [feature]), null);
  assert.equal(currentRubyFeature("2026-10-22", [feature]), feature);
});

import test from "node:test";
import assert from "node:assert/strict";
import { reusableSelections, selectionError, type PublishedLeg } from "../src/lib/parlay-builder";
const now = Date.parse("2026-11-03T17:00:00Z");
const row = (key: string, overrides: Partial<PublishedLeg> = {}): PublishedLeg => ({
  leg_key: key, name: "Sample Player", market: "Full game · 20+ rushing yards",
  matchup: "Sample Away @ Sample Home", game_id: "exact-game-a", kind: "RESEARCH",
  quote: null, quote_observed_at: null, published_at: new Date(now).toISOString(),
  expires_at: new Date(now + 3600000).toISOString(), result: null, why: "Sample", risk: "Sample", copy_text: null,
  ...overrides,
});
test("journey restore uses current exact-key observations without mutating a saved snapshot", () => {
  const saved = [row("a"), row("b", { name: "Sample Other" })];
  const before = JSON.stringify(saved);
  const current = saved.map(r => ({ ...r, quote: "Sample new quote", odds: -115 }));
  const restored = reusableSelections(saved.map(r => r.leg_key), current, now);
  assert.deepEqual(restored.legs, current);
  assert.equal(restored.skipped, 0);
  assert.equal(JSON.stringify(saved), before);
  assert.notEqual(restored.legs[0], saved[0]);
});
test("journey restoration drops unavailable, settled, expired and identity-mismatched selections", () => {
  const valid = row("valid");
  const catalog = [valid, row("expired", { expires_at: new Date(now).toISOString() }), row("settled", { result: "WIN" }), row("invalid-clock", { expires_at: "unknown" }), row("no-game", { game_id: null }), row("renamed-key", { name: "Same display label" })];
  const restored = reusableSelections(["valid", "valid", "expired", "settled", "invalid-clock", "no-game", "missing", "old-key"], catalog, now);
  assert.deepEqual(restored.legs, [valid]);
  assert.equal(restored.skipped, 6);
});
test("same player/stat conflicts remain game-scoped through a round trip", () => {
  const first = row("first");
  const sameGame = row("different-source", { market: "Full game · Over 30.5 rushing yards" });
  const otherGame = row("next-game", { game_id: "exact-game-b" });
  assert.match(selectionError([first], sameGame, now)!, /one target/);
  assert.equal(selectionError([first], otherGame, now), null);
  assert.deepEqual(reusableSelections(["first", "different-source", "next-game"], [first, sameGame, otherGame], now), { legs: [first, otherGame], skipped: 1 });
});

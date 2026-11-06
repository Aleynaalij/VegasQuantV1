import test from "node:test";
import assert from "node:assert/strict";
import { legacyNflHashTarget } from "../src/lib/lobby-route-compat";
test("legacy NFL hashes preserve repeated query values, game/saved identity and encoding", () => {
  const input = "https://vegasquant.app/?tag=a&tag=b&game=sample-game&saved=sample-id&name=A%26B%2B%20C#home-games";
  const target = legacyNflHashTarget(input)!;
  assert.equal(target, "/nfl?tag=a&tag=b&game=sample-game&saved=sample-id&name=A%26B%2B%20C#home-games");
  const u = new URL(target, "https://vegasquant.app");
  assert.deepEqual(u.searchParams.getAll("tag"), ["a", "b"]);
  assert.equal(u.searchParams.get("name"), "A&B+ C");
  assert.equal(legacyNflHashTarget(target), null, "forwarded route cannot loop");
  assert.equal(legacyNflHashTarget("/#home-games"), "/nfl#home-games");
});
test("neutral lobby and unrelated sport/saved anchors are not redirected", () => {
  for (const path of ["/", "/?tag=a", "/#other", "/#my-parlay-example", "/nba#home-games", "/nfl#home-games", "/parlays?saved=a#my-parlay-a"])
    assert.equal(legacyNflHashTarget(path), null);
});

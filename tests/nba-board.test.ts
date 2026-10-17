import test from "node:test";
import assert from "node:assert/strict";
import {
  nbaStatus,
  nbaHasScore,
  nbaPhase,
  latestNbaObservations,
  nbaFreshness,
  nbaOdds,
  nbaOutcomes,
  nbaSource,
  type NbaGame,
  type NbaObservation,
} from "../src/lib/nba-board";
const now = Date.parse("2026-10-17T15:00:00Z");
const game = {
  status: "STATUS_SCHEDULED",
  tipoff: "2026-10-17T16:00:00Z",
  tipoff_tbd: false,
  away_score: 0,
  home_score: 0,
} as NbaGame;
test("scheduled zeroes never become scores and past scheduled games never become invented live games", () => {
  assert.equal(nbaHasScore(game), false);
  assert.equal(nbaStatus(game, now), "Scheduled");
  assert.equal(nbaStatus(game, now + 7200000), "Awaiting game update");
  assert.equal(nbaStatus({ ...game, status: "STATUS_FINAL" }, now), "Final");
  assert.equal(nbaHasScore({ ...game, status: "STATUS_FINAL" }), true);
  assert.equal(
    nbaHasScore({ ...game, status: "STATUS_FINAL", home_score: null }),
    false,
  );
  assert.equal(nbaStatus({ ...game, tipoff_tbd: true }, now), "Tip time TBD");
  assert.equal(
    nbaStatus({ ...game, status: "STATUS_POSTPONED" }, now),
    "postponed",
  );
});
test("preseason remains distinct from regular season and unknown phase", () => {
  assert.equal(nbaPhase(1), "Preseason");
  assert.equal(nbaPhase(2), "Regular season");
  assert.equal(nbaPhase(null), "Season phase unknown");
});
test("unknown, future and old provider timestamps never appear as recent", () => {
  assert.equal(nbaFreshness(null, now, 180), "Time unknown");
  assert.equal(nbaFreshness("nonsense", now, 180), "Time unknown");
  assert.equal(
    nbaFreshness(new Date(now + 1).toISOString(), now, 180),
    "Time unknown",
  );
  assert.equal(
    nbaFreshness(new Date(now - 4 * 3600000).toISOString(), now, 180),
    "Older snapshot",
  );
  assert.equal(
    nbaFreshness(new Date(now - 3600000).toISOString(), now, 180),
    "Recent snapshot",
  );
});
test("latest receipt per book and market preserves withdrawn outcomes rather than resurrecting prices", () => {
  const row = (
    id: string,
    book: string,
    at: string,
    outcomes: unknown[],
  ): NbaObservation => ({
    id,
    game_id: "g",
    kind: "odds",
    provider: "The Odds API NBA",
    source: "https://example.com",
    observed_at: null,
    recorded_at: at,
    payload: { book, market: "h2h", outcomes },
  });
  const old = row("a", "FanDuel", "2026-10-17T12:00:00Z", [
    { name: "Team", price: -150 },
  ]);
  const withdrawn = row("b", "FanDuel", "2026-10-17T13:00:00Z", []);
  const comparison = row("c", "DraftKings", "2026-10-17T12:00:00Z", [
    { name: "Team", price: -155 },
  ]);
  const result = latestNbaObservations([old, comparison, withdrawn]);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, "b");
  assert.deepEqual(nbaOutcomes(result[0].payload), []);
});
test("injury revisions are per team/player and do not imply clearance", () => {
  const row = (id: string, player: string, at: string): NbaObservation => ({
    id,
    game_id: "g",
    kind: "injury",
    provider: "ESPN",
    source: "https://example.com",
    observed_at: null,
    recorded_at: at,
    payload: { team: "Team", player, status: "Questionable" },
  });
  assert.equal(
    latestNbaObservations([
      row("a", "One", "2026-10-17"),
      row("b", "One", "2026-10-18"),
      row("c", "Two", "2026-10-17"),
    ]).length,
    2,
  );
});
test("market display retains negative and zero lines and rejects fabricated or malformed prices and unsafe URLs", () => {
  assert.equal(nbaOdds(-110), "-110");
  assert.equal(nbaOdds(130), "+130");
  assert.equal(nbaOdds(null), "Price unknown");
  assert.equal(nbaOdds(0), "Price unknown");
  assert.deepEqual(
    nbaOutcomes({
      outcomes: [{ name: "Team", point: 0, price: -110 }, null, { price: 200 }],
    }),
    [{ name: "Team", point: 0, price: "-110" }],
  );
  assert.equal(nbaSource("javascript:alert(1)"), null);
  assert.equal(nbaSource("https://user:pass@example.com"), null);
  assert.equal(
    nbaSource("https://www.espn.com/nba/"),
    "https://www.espn.com/nba/",
  );
});

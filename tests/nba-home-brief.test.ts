import { test } from "node:test";
import assert from "node:assert/strict";
import { nbaHomeSlate, nbaIsLive, nbaLogoCode, nbaNickname, type NbaHomeGame } from "../src/lib/nba-home";

const H = 3600000;
const now = Date.parse("2026-10-20T20:00:00Z");
const game = (id: string, hours: number, over: Partial<NbaHomeGame> = {}): NbaHomeGame => ({
  id, away_team: "New York Knicks", home_team: "Boston Celtics", away_abbreviation: "NY", home_abbreviation: "BOS",
  tipoff: new Date(now + hours * H).toISOString(), tipoff_tbd: false, venue: "TD Garden", season_type: 2,
  status: "STATUS_SCHEDULED", away_score: null, home_score: null, ...over,
});

test("ESPN logo codes and nicknames", () => {
  assert.deepEqual(["NY", "UTAH", "GS", "", null, "LA Clippers"].map(nbaLogoCode), ["ny", "utah", "gs", null, null, null]);
  assert.equal(nbaNickname("Portland Trail Blazers"), "Trail Blazers");
  assert.equal(nbaNickname("Philadelphia 76ers"), "76ers");
});

test("opening night: the first regular-season game leads; preseason and far-off games are ignored", () => {
  const slate = nbaHomeSlate([game("c", 26), game("a", 3), game("pre", -20, { season_type: 1, status: "STATUS_FINAL" }),
    game("b", 5.5), game("far", 24 * 9), game("d", 30), game("e", 48)], now);
  assert.equal(slate.opening, true);
  assert.equal(slate.next?.id, "a");
  assert.deepEqual(slate.rest.map((g) => g.id), ["b", "c", "d"]);
  assert.equal(slate.week, 5);
});

test("a live game leads the hero; finals and stale statuses drop out", () => {
  const live = game("live", -1, { status: "STATUS_IN_PROGRESS", away_score: 54, home_score: 50 });
  const final = game("final", -3, { status: "STATUS_FINAL", away_score: 101, home_score: 99 });
  const stale = game("stale", -6, { status: "STATUS_IN_PROGRESS" });
  const slate = nbaHomeSlate([game("next", 2), final, live, stale], now);
  assert.equal(slate.next?.id, "live");
  assert.equal(slate.opening, true); // still Oct 20 in New York; the hero says "Live now" first
  assert.deepEqual([nbaIsLive(live, now), nbaIsLive(final, now), nbaIsLive(stale, now), nbaIsLive(game("tip", -0.1), now)], [true, false, false, true]);
  assert.deepEqual(slate.rest.map((g) => g.id), ["next"]);
});

test("empty or failed schedule gives no lead game", () => {
  assert.deepEqual(nbaHomeSlate([], now), { next: null, rest: [], live: 0, week: 0, opening: false });
});

test("opening night follows the calendar, not how much history was loaded", () => {
  // 20:00Z Oct 20 is opening night in New York; a game on Oct 22 is not, even with no past games loaded.
  assert.equal(nbaHomeSlate([game("a", 3)], now).opening, true);
  assert.equal(nbaHomeSlate([game("later", 48)], now).opening, false);
  assert.equal(nbaHomeSlate([game("late-et", 7)], now).opening, true); // 03:00Z Oct 21 is still Oct 20 in ET
});

test("a TBD tip-off time is a placeholder: never live until ESPN says so", () => {
  const tbd = game("tbd", -1, { tipoff_tbd: true });
  assert.equal(nbaIsLive(tbd, now), false);
  const started = game("tbd-live", 1, { tipoff_tbd: true, status: "STATUS_IN_PROGRESS" });
  assert.equal(nbaIsLive(started, now), true);
  const slate = nbaHomeSlate([started, game("next", 3)], now);
  assert.deepEqual([slate.next?.id, slate.rest.map((g) => g.id)], ["tbd-live", ["next"]]);
});

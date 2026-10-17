import { test } from "node:test";
import assert from "node:assert/strict";
import { nbaAwaiting, nbaCanonicalTeam, nbaHomeSlate, nbaIsLive, nbaLogoCode, nbaNickname, type NbaHomeGame } from "../src/lib/nba-home";

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
  const half = game("half", -1.5, { status: "STATUS_HALFTIME" });
  const final = game("final", -3, { status: "STATUS_FINAL", away_score: 101, home_score: 99 });
  const stale = game("stale", -6, { status: "STATUS_IN_PROGRESS" });
  const slate = nbaHomeSlate([game("next", 2), final, live, stale, half], now);
  assert.deepEqual([slate.next?.id, slate.rest.map((g) => g.id), slate.live], ["half", ["live", "next"], 2]);
  assert.equal(slate.opening, true); // still Oct 20 in New York; the hero says "Live now" first
  assert.deepEqual([nbaIsLive(live, now), nbaIsLive(final, now), nbaIsLive(stale, now)], [true, false, false]);
});

test("only ESPN's in-play status is live: a delayed tip or unknown status is awaiting an update", () => {
  const delayed = game("delayed", -0.5); // STATUS_SCHEDULED past tip-off
  const unknown = game("unknown", -0.5, { status: "STATUS_DELAYED", away_score: 0, home_score: 0 });
  for (const g of [delayed, unknown]) assert.deepEqual([nbaIsLive(g, now), nbaAwaiting(g, now)], [false, true]);
  assert.equal(nbaAwaiting(game("old", -5), now), false);
  const slate = nbaHomeSlate([game("next", 2), delayed, game("live", -1, { status: "STATUS_END_PERIOD" })], now);
  assert.deepEqual([slate.next?.id, slate.rest.map((g) => g.id), slate.live], ["live", ["delayed", "next"], 1]);
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

test("a TBD tip-off time is a placeholder: never live or awaiting until ESPN says so", () => {
  const tbd = game("tbd", -1, { tipoff_tbd: true });
  assert.deepEqual([nbaIsLive(tbd, now), nbaAwaiting(tbd, now)], [false, false]);
  const started = game("tbd-live", 1, { tipoff_tbd: true, status: "STATUS_IN_PROGRESS" });
  assert.equal(nbaIsLive(started, now), true);
  const slate = nbaHomeSlate([started, game("next", 3)], now);
  assert.deepEqual([slate.next?.id, slate.rest.map((g) => g.id)], ["tbd-live", ["next"]]);
});

test("a book's team spelling grades against the schedule's name", () => {
  assert.equal(nbaCanonicalTeam("LA Clippers"), "Los Angeles Clippers");
  assert.equal(nbaCanonicalTeam(" Boston Celtics "), "Boston Celtics");
  assert.equal(nbaCanonicalTeam("Over"), "Over");
});

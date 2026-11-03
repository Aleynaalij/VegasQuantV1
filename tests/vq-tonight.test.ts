import test from "node:test";
import assert from "node:assert/strict";
import {
  fromDeskGames,
  fromNbaGames,
  fromSportsHome,
  startLabel,
  statusLabel,
  tonightGames,
  tonightWindow,
  type TonightGame,
} from "../src/lib/vq-tonight.ts";

const g = (id: string, start: string, extra: Partial<TonightGame> = {}): TonightGame => ({
  sport: "nhl", id, away: "A", home: "B", start, tbd: false, status: null, href: `/nhl/games/${id}`, ...extra,
});

test("the product day is ET midnight to ET midnight", () => {
  const w = tonightWindow(Date.parse("2026-11-03T17:00:00Z")); // Nov 3, EST
  assert.equal(new Date(w.start).toISOString(), "2026-11-03T05:00:00.000Z");
  assert.equal(new Date(w.end).toISOString(), "2026-11-04T05:00:00.000Z");
  assert.match(w.label, /Tue, Nov 3/);
});

test("DST days are 23 and 25 hours long", () => {
  const spring = tonightWindow(Date.parse("2026-03-08T15:00:00Z"));
  assert.equal((spring.end - spring.start) / 3600000, 23);
  const fall = tonightWindow(Date.parse("2026-11-01T15:00:00Z"));
  assert.equal((fall.end - fall.start) / 3600000, 25);
  assert.equal(new Date(fall.start).toISOString(), "2026-11-01T04:00:00.000Z");
});

test("late evening ET still belongs to today, not the UTC date", () => {
  const now = Date.parse("2026-11-04T03:30:00Z"); // 10:30 PM ET Nov 3
  assert.match(tonightWindow(now).label, /Nov 3/);
  const rows = [g("late", "2026-11-04T04:30:00Z"), g("tomorrow", "2026-11-04T05:00:00Z"), g("early", "2026-11-03T05:00:00Z")];
  assert.deepEqual(tonightGames(rows, now).map((x) => x.id), ["early", "late"]);
});

test("sorted by start, then sport, then id; duplicates and bad times dropped", () => {
  const now = Date.parse("2026-11-03T17:00:00Z");
  const rows = [
    g("b", "2026-11-04T00:00:00Z"), g("a", "2026-11-04T00:00:00Z"), g("a", "2026-11-04T00:00:00Z"),
    g("x", "2026-11-03T23:00:00Z", { sport: "nba" }), g("bad", "not a time"),
  ];
  assert.deepEqual(tonightGames(rows, now).map((x) => x.id), ["x", "a", "b"]);
});

test("status labels only say what the provider reported", () => {
  assert.equal(statusLabel("STATUS_SCHEDULED"), null);
  assert.equal(statusLabel(null), null);
  assert.equal(statusLabel("STATUS_POSTPONED"), "Postponed");
  assert.equal(statusLabel("STATUS_FINAL"), "Final");
  assert.equal(statusLabel("STATUS_IN_PROGRESS"), "In progress");
  assert.equal(statusLabel("STATUS_CANCELED"), "Cancelled");
});

test("an unconfirmed time is labelled, never given a clock time", () => {
  assert.equal(startLabel(g("t", "2026-11-04T00:00:00Z", { tbd: true })), "Time not confirmed");
  assert.equal(startLabel(g("t", "2026-11-04T00:00:00Z")), "7:00 PM ET");
});

test("readers map to existing game pages and drop rows without identity", () => {
  const home = { version: 1, sport: "nhl", games: [
    { id: "n1", slug: "vgk-pit-1", start_time: "2026-11-04T00:00:00Z", status: "STATUS_SCHEDULED", away: { name: "Vegas Golden Knights", short_name: "Golden Knights" }, home: { name: "Pittsburgh Penguins" } },
    { id: "n2", slug: "../bad", start_time: "2026-11-04T00:00:00Z", away: { name: "X" }, home: { name: "Y" } },
  ] };
  const nhl = fromSportsHome("nhl", home)!;
  assert.equal(nhl.length, 1);
  assert.equal(nhl[0].href, "/nhl/games/vgk-pit-1");
  assert.equal(nhl[0].away, "Golden Knights");
  assert.equal(fromSportsHome("ncaab", null), null);
  const nba = fromNbaGames([{ id: "b1", slug: "bos-nyk-1", away_team: "Celtics", home_team: "Knicks", tipoff: "2026-11-04T00:30:00Z" }, { id: "b2", tipoff: "x" }]);
  assert.deepEqual(nba.map((x) => x.href), ["/nba/games/bos-nyk-1"]);
  const nfl = fromDeskGames([{ id: "f1", slug: "sea-den-1", away_team: "Seahawks", home_team: "Broncos", kickoff: "2026-11-04T01:15:00Z" }, { id: "f2", slug: "x-y", away_team: "A", home_team: "B", kickoff: "2026-11-04T01:15:00Z", sport: "nba" }]);
  assert.deepEqual(nfl.map((x) => x.href), ["/matchups/sea-den-1"]);
});

test("a schedule for another sport or version is an error, never a slate with wrong links", () => {
  const games = [{ id: "c1", slug: "duke-unc-1", start_time: "2026-11-04T00:00:00Z", away: { name: "Duke" }, home: { name: "UNC" } }];
  assert.equal(fromSportsHome("nhl", { version: 1, sport: "ncaab", games }), null);
  assert.equal(fromSportsHome("ncaab", { version: 2, sport: "ncaab", games }), null);
  assert.equal(fromSportsHome("ncaab", { version: 1, sport: "ncaab" }), null);
  assert.equal(fromSportsHome("ncaab", { version: 1, sport: "ncaab", games })![0].href, "/ncaab/games/duke-unc-1");
});

test("an NFL kickoff marked unconfirmed is labelled, not given a clock time", () => {
  const [g] = fromDeskGames([{ id: "f1", slug: "sea-den-1", away_team: "Seahawks", home_team: "Broncos", kickoff: "2026-11-04T01:15:00Z", kickoff_tbd: true }]);
  assert.equal(g.tbd, true);
  assert.equal(startLabel(g), "Time not confirmed");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalTeam,
  gamesFromScoreboard,
  observationsFromScoreboard,
  injuryObservations,
  priceObservations,
  scoreboardRange,
} from "../supabase/functions/nba-sync/normalize";
import { linesDue, propEventDue, eventFetchCache } from "../supabase/functions/nba-sync/cadence";

const HOUR = 3600000;
const now = Date.parse("2026-10-20T16:00:00Z");
const team = (homeAway: string, displayName: string, abbreviation: string, score?: string) => ({ homeAway, team: { displayName, abbreviation }, score });
const event = (id: string, date: string, state: string, away: ReturnType<typeof team>, home: ReturnType<typeof team>) => ({
  id, date, season: { year: 2027, type: 2 },
  competitions: [{ timeValid: true, venue: { fullName: "Sample Arena" }, competitors: [home, away],
    status: { type: { name: state === "pre" ? "STATUS_SCHEDULED" : "STATUS_FINAL", state, completed: state === "post" } } }],
});
const board = {
  events: [
    event("401810001", "2026-10-20T23:30:00Z", "pre", team("away", "LA Clippers", "LAC", "0"), team("home", "Boston Celtics", "BOS", "0")),
    event("401810002", "2026-10-19T23:30:00Z", "post", team("away", "Denver Nuggets", "DEN", "112"), team("home", "Utah Jazz", "UTAH", "104")),
    { id: "bad id", date: "2026-10-20T23:30:00Z", competitions: [] },
  ],
};

test("ESPN NBA scoreboard becomes games with Odds API team names, slugs and final scores only", () => {
  const games = gamesFromScoreboard(board as never);
  assert.equal(games.length, 2);
  const [clippers, final] = games;
  assert.equal(clippers.away_team, "Los Angeles Clippers");
  assert.equal(clippers.slug, "lac-bos-20261020");
  assert.deepEqual([clippers.away_score, clippers.home_score, clippers.status], [null, null, "STATUS_SCHEDULED"]);
  assert.deepEqual([final.away_score, final.home_score, final.status], [112, 104, "STATUS_FINAL"]);
  assert.equal(final.source, "https://www.espn.com/nba/game/_/gameId/401810002");
  assert.equal(canonicalTeam("Boston Celtics"), "Boston Celtics");
  const obs = observationsFromScoreboard(board as never);
  assert.deepEqual(obs.map((o) => o.kind), ["schedule", "score", "schedule", "score"]);
});

test("injuries attach to teams playing within 48 hours", () => {
  const games = gamesFromScoreboard(board as never);
  const report = { injuries: [
    { displayName: "LA Clippers", injuries: [
      { status: "Out", date: "2026-10-20T12:00:00Z", athlete: { displayName: "Sample Guard", position: { abbreviation: "G" } }, details: { type: "Knee" } },
      { status: "Active", athlete: { displayName: "Healthy Player" } },
    ] },
    { displayName: "Utah Jazz", injuries: [{ status: "Out", athlete: { displayName: "Past Game" } }] },
  ] };
  const rows = injuryObservations(report, games, now);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].provider_id, rows[0].payload.team, rows[0].payload.player, rows[0].payload.status], ["401810001", "Los Angeles Clippers", "Sample Guard", "Out"]);
});

test("prices match games by canonical name and keep only valid props from the six books", () => {
  const games = gamesFromScoreboard(board as never);
  const outcome = (name: string, point: number, price: number, description = "Sample Guard") => ({ name, point, price, description });
  const odds = [{
    id: "evt_1", home_team: "Boston Celtics", away_team: "Los Angeles Clippers", commence_time: "2026-10-20T23:30:00Z",
    bookmakers: [
      { key: "fanduel", title: "FanDuel", last_update: "2026-10-20T15:55:00Z", markets: [
        { key: "player_points", outcomes: [outcome("Over", 20.5, -115), outcome("Under", 20.5, -105)] },
        { key: "player_rebounds", outcomes: [outcome("Over", 5.5, -50)] },          // invalid price
        { key: "player_blocks", outcomes: [outcome("Over", 0.5, 150)] },            // market not requested
      ] },
      { key: "pinnacle", title: "Pinnacle", last_update: "2026-10-20T15:55:00Z", markets: [
        { key: "player_points", outcomes: [outcome("Over", 20.5, -110)] },
      ] },
      { key: "draftkings", title: "DraftKings", last_update: "2026-10-20T17:00:00Z", markets: [ // future timestamp
        { key: "player_points", outcomes: [outcome("Over", 21.5, -110)] },
      ] },
    ],
  }, { id: "evt_2", home_team: "Miami Heat", away_team: "Orlando Magic", commence_time: "2026-10-20T23:30:00Z", bookmakers: [] }];
  const rows = priceObservations(odds, games, "prop", ["player_points", "player_rebounds"], now);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].provider_id, rows[0].kind, rows[0].payload.book, rows[0].payload.market, rows[0].payload.away_team],
    ["401810001", "prop", "FanDuel", "player_points", "Los Angeles Clippers"]);
  assert.match(rows[0].source, /basketball_nba\/events\/evt_1\/odds$/);
  const lines = priceObservations([{ ...odds[0], bookmakers: [{ key: "betmgm", title: "BetMGM", last_update: "2026-10-20T15:00:00Z",
    markets: [{ key: "h2h", outcomes: [{ name: "Boston Celtics", price: -200 }, { name: "Los Angeles Clippers", price: 170 }] }] }] }], games, "odds", ["h2h"], now);
  assert.deepEqual(lines.map((l) => [l.kind, l.payload.book]), [["odds", "BetMGM"]]);
});

test("credit cadence: lines every 3h, every 30m near tip; props by distance to tip", () => {
  const tip = now + 20 * HOUR;
  assert.equal(linesDue([tip], null, now), true);
  assert.equal(linesDue([tip], now - 2 * HOUR, now), false);
  assert.equal(linesDue([tip], now - 3 * HOUR, now), true);
  assert.equal(linesDue([now + HOUR], now - 31 * 60000, now), true);
  assert.equal(linesDue([now + 40 * HOUR], null, now), false);        // beyond 36h
  assert.equal(linesDue([now - HOUR], null, now), false);             // already tipped
  assert.equal(propEventDue(now + 20 * HOUR, now - 5 * HOUR, now), false);
  assert.equal(propEventDue(now + 20 * HOUR, now - 6 * HOUR, now), true);
  assert.equal(propEventDue(now + 6 * HOUR, now - 2 * HOUR, now), true);
  assert.equal(propEventDue(now + HOUR, now - 20 * 60000, now), false);
  assert.equal(propEventDue(now + HOUR, now - 30 * 60000, now), true);
  assert.equal(propEventDue(now + 40 * HOUR, null, now), false);
});

test("per-event fetch cache resets when the market set changes and drops bad entries", () => {
  const details = { market_key: "player_points", event_fetched_at: { evt_1: "2026-10-20T10:00:00Z", "bad key": "2026-10-20T10:00:00Z", evt_2: "2026-10-21T10:00:00Z", evt_3: "x" } };
  assert.deepEqual(eventFetchCache(details, "player_points", now), { evt_1: "2026-10-20T10:00:00Z" });
  assert.deepEqual(eventFetchCache(details, "player_points,player_rebounds", now), {});
});

test("scoreboard range spans yesterday to a week ahead in Eastern dates", () => {
  assert.equal(scoreboardRange(Date.parse("2026-10-20T03:00:00Z")), "20261018-20261026");
});

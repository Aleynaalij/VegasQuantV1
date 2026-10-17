import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resultPayload, dueGames, boxscoreUrl } from "../supabase/functions/nba-results/parse";

// Same columns and order as ESPN's NBA summary (checked against event 401898407, October 2026).
const KEYS = ["minutes", "points", "fieldGoalsMade-fieldGoalsAttempted", "threePointFieldGoalsMade-threePointFieldGoalsAttempted",
  "freeThrowsMade-freeThrowsAttempted", "rebounds", "assists", "turnovers", "steals", "blocks", "offensiveRebounds",
  "defensiveRebounds", "fouls", "plusMinus"];
const stat = (min: number, pts: number, threes: number, reb: number, ast: number) =>
  [String(min), String(pts), "5-10", `${threes}-6`, "0-0", String(reb), String(ast), "2", "1", "0", "1", String(reb - 1), "2", "+3"];
const athlete = (id: string, name: string, stats: string[], didNotPlay = false) => ({ athlete: { id, displayName: name }, stats, didNotPlay });
const summary = (detail = "Final/OT", completed = true) => ({
  header: { competitions: [{ status: { type: { name: completed ? "STATUS_FINAL" : "STATUS_IN_PROGRESS", detail, completed } },
    competitors: [
      { homeAway: "home", score: "120", team: { displayName: "Boston Celtics" }, linescores: [1, 2, 3, 4, 5] },
      { homeAway: "away", score: "125", team: { displayName: "LA Clippers" }, linescores: [1, 2, 3, 4, 5] },
    ] }] },
  boxscore: { players: [
    { team: { displayName: "LA Clippers" }, statistics: [{ keys: KEYS, totals: ["", "125", "", "17-54", "", "63", "31"],
      athletes: [athlete("10", "James Harden", stat(36, 30, 4, 6, 9)), athlete("11", "Kawhi Leonard", stat(34, 95, 13, 57, 22)),
        athlete("12", "Bench Player", [], true)] }] },
    { team: { displayName: "Boston Celtics" }, statistics: [{ keys: KEYS, totals: ["", "120", "", "7-38", "", "46", "29"],
      athletes: [athlete("20", "Jayson Tatum", stat(38, 120, 7, 46, 29))] }] },
  ] },
});
const game = { provider_id: "401898407", away_team: "Los Angeles Clippers", home_team: "Boston Celtics" };

test("ESPN summary becomes a record_nba_result payload: canonical teams, sides, team totals, DNP rows", () => {
  const p = resultPayload(summary() as never, game, "f".repeat(64));
  assert.ok(typeof p !== "string" && p.completed);
  if (typeof p === "string" || !p.completed) return;
  assert.equal(p.overtime, true);
  assert.equal(p.source_url, boxscoreUrl("401898407"));
  assert.deepEqual(p.away, { team: "Los Angeles Clippers", score: 125, rebounds: 63, assists: 31, threes: 17 });
  assert.deepEqual(p.home, { team: "Boston Celtics", score: 120, rebounds: 46, assists: 29, threes: 7 });
  assert.equal(p.players.length, 4);
  assert.deepEqual(p.players[0], { athlete_id: "10", player: "James Harden", side: "away", played: true, minutes: 36, threes: 4,
    points: 30, rebounds: 6, assists: 9, steals: 1, blocks: 0, turnovers: 2 });
  assert.deepEqual(p.players[2], { athlete_id: "12", player: "Bench Player", side: "away", played: false, minutes: null, threes: 0,
    points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0 });
});

test("unfinished games, foreign teams and unreadable stats are not recorded", () => {
  assert.deepEqual(resultPayload(summary("Q4", false) as never, game, "f".repeat(64)), { provider_id: "401898407", status: "STATUS_IN_PROGRESS", completed: false });
  const regulation = resultPayload({ ...summary("Final"), header: { competitions: [{ ...summary().header.competitions[0],
    status: { type: { name: "STATUS_FINAL", detail: "Final", completed: true } },
    competitors: summary().header.competitions[0].competitors.map((c) => ({ ...c, linescores: [1, 2, 3, 4] })) }] } } as never, game, "f".repeat(64));
  assert.ok(typeof regulation !== "string" && regulation.completed && regulation.overtime === false);
  assert.match(String(resultPayload(summary() as never, { ...game, away_team: "Utah Jazz" }, "f")), /not in this game/);
  const bad = summary(); bad.boxscore.players[1].statistics[0].athletes[0].stats[1] = "--";
  assert.match(String(resultPayload(bad as never, game, "f")), /Unreadable stat line for Jayson Tatum/);
  const noCol = summary(); noCol.boxscore.players[0].statistics[0].keys = KEYS.filter((k) => k !== "assists");
  assert.match(String(resultPayload(noCol as never, game, "f")), /missing a stat column/);
});

test("due games: 2h after tip, within 4 days; recorded games re-read every 6h for 3 days", () => {
  const now = Date.parse("2026-10-20T12:00:00Z"), h = 3600000;
  const g = (id: string, hoursAgo: number) => ({ id, tipoff: new Date(now - hoursAgo * h).toISOString() });
  const games = [g("early", 1), g("new", 3), g("old", 100), g("final-recent", 30), g("final-checked", 30), g("final-old", 80), g("confirming", 5)];
  const at = (hoursAgo: number) => new Date(now - hoursAgo * h).toISOString();
  const progress = new Map([
    ["final-recent", { status: "FINAL", checked_at: at(1) }],
    ["final-checked", { status: "FINAL", checked_at: at(7) }],
    ["final-old", { status: "FINAL", checked_at: at(10) }],
    ["confirming", { status: "CONFIRMING", checked_at: at(0.5) }],
  ]);
  assert.deepEqual(dueGames(games, progress, now).map((x) => x.id), ["new", "final-checked", "confirming"]);
  assert.equal(dueGames(games, progress, now, 1).length, 1);
});

test("results tables: consistency gate, 3-hour confirmation, immutable records, corrections and grading", () => {
  execFileSync(process.execPath, ["tests/sql/nba-results.mjs"], { stdio: "pipe" });
});

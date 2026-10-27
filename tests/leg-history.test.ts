import { test } from "node:test";
import assert from "node:assert/strict";
import { legHistory } from "../supabase/functions/result-sync/history";
import type { Contract, Game } from "../supabase/functions/result-sync/grade";

const g: Game = { id: "g", provider_id: "1", away_team: "Seattle Seahawks", home_team: "Denver Broncos", away_abbreviation: "SEA", home_abbreviation: "DEN", kickoff: "2026-10-16T00:15:00Z", season: 2026, week: 6 };
const c: Contract = { leg_key: "k", game_id: "g", player: "Evan Engram", team: "Denver Broncos", metric: "receiving_yards", threshold: 15, operator: "gte", period: "full_game", market: "Full game · 15+ receiving yards" };
const row = (season: number, week: number, yards: number, extra: Record<string, string> = {}) => ({
  player_id: "00-1", player_display_name: "Evan Engram", position: "TE", season: String(season), week: String(week),
  season_type: "REG", team: "DEN", opponent_team: "KC", receiving_yards: String(yards), ...extra,
});

test("last five games before the pick's week, newest first, with cleared count and median", () => {
  const rows = [row(2026, 1, 0), row(2026, 2, 6), row(2026, 3, 22), row(2026, 4, 40), row(2026, 5, 55), row(2026, 6, 13)];
  const h = legHistory(rows, c, g);
  assert.ok(typeof h !== "string");
  assert.deepEqual(h.games.map((x) => x.week), [5, 4, 3, 2, 1]); // week 6 itself is excluded
  assert.equal(h.cleared, 3);
  assert.equal(h.sample, 5);
  assert.equal(h.median, 22);
  assert.equal(h.position, "TE");
});

test("reaches into last season, ignores playoffs, and resolves a shared name by team", () => {
  const rows = [
    row(2026, 1, 30), row(2026, 2, 30),
    row(2025, 17, 10), row(2025, 18, 10), row(2025, 16, 20), row(2025, 19, 99, { season_type: "POST" }),
    { ...row(2026, 3, 80), player_id: "00-2", team: "NYJ" },
  ];
  const h = legHistory(rows, c, g);
  assert.ok(typeof h !== "string");
  assert.deepEqual(h.games.map((x) => `${x.season}-${x.week}`), ["2026-2", "2026-1", "2025-18", "2025-17", "2025-16"]);
  assert.equal(h.cleared, 3);
  assert.equal(legHistory(rows, { ...c, team: "" }, g), "Player history ambiguous");
  assert.equal(legHistory([], c, g), "No prior games");
});

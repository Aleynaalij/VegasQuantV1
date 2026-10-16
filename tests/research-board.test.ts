import test from "node:test";
import assert from "node:assert/strict";
import { candidate, gameLegs, pickBoard, quotedLines, selectionKey, type BoardGame } from "../scripts/research-board/select";

const game: BoardGame = {
  id: "g1", provider_id: "401", home_team: "Los Angeles Rams", away_team: "Buffalo Bills",
  home_abbreviation: "LAR", away_abbreviation: "BUF", kickoff: "2026-10-18T20:25:00Z", season: 2026, week: 7, sport: "NFL",
};
const at = Date.parse("2026-10-17T12:00:00Z");
const snap = (book: string, market: string, outcomes: object[], observed_at = "2026-10-17T10:00:00Z") =>
  ({ game_id: "g1", observed_at, payload: { book, market, outcomes } }) as never;
// Five prior games per player (weeks 1-5) for the weekly-row history.
const rows = (player: string, stat: string, values: number[], position = "RB") =>
  values.map((v, i) => ({
    player_id: player, player_display_name: player, season: "2026", week: String(i + 1), season_type: "REG",
    position, position_group: position, team: "BUF", opponent_team: "MIA", [stat]: String(v),
  }));

const observations = [
  snap("FanDuel", "player_rush_yds_alternate", [
    { name: "Over", description: "James Cook", point: 59.5, price: -200 }, // 5/5 cleared: 100% vs 67%
    { name: "Over", description: "James Cook", point: 79.5, price: -110 }, // too long a price
    { name: "Over", description: "Ray Davis", point: 29.5, price: -180 }, // 2/5: fails R1
    { name: "Under", description: "James Cook", point: 59.5, price: -120 },
  ]),
  snap("DraftKings", "player_rush_yds_alternate", [{ name: "Over", description: "James Cook", point: 59.5, price: -175 }]),
  snap("FanDuel", "player_reception_yds_alternate", [
    { name: "Over", description: "Dalton Kincaid", point: 14.5, price: -250 }, // TE low yardage: R5
    { name: "Over", description: "James Cook", point: 19.5, price: -190 },
  ]),
  // An older FanDuel snapshot is superseded by the latest one above.
  snap("FanDuel", "player_rush_yds_alternate", [{ name: "Over", description: "Old Line", point: 9.5, price: -200 }], "2026-10-17T08:00:00Z"),
];
const history = [
  ...rows("James Cook", "rushing_yards", [70, 88, 64, 95, 61]),
  ...rows("James Cook", "receiving_yards", [25, 30, 22, 40, 21]).map((r, i) => ({ ...r, ...{ rushing_yards: String([70, 88, 64, 95, 61][i]) } })),
  ...rows("Ray Davis", "rushing_yards", [10, 35, 20, 31, 12]),
  ...rows("Dalton Kincaid", "receiving_yards", [30, 25, 18, 40, 22], "TE"),
];
// James Cook's weekly rows carry both stats.
const merged = history.filter((r) => r.player_display_name !== "James Cook");
for (let i = 0; i < 5; i++)
  merged.push({ ...rows("James Cook", "rushing_yards", [70, 88, 64, 95, 61])[i], receiving_yards: String([25, 30, 22, 40, 21][i]) } as never);

test("only the latest snapshot's over lines become N+ targets", () => {
  const lines = quotedLines(game, observations);
  assert.ok(lines.some((l) => l.market === "Full game · 60+ rushing yards" && l.player === "James Cook"));
  assert.ok(!lines.some((l) => l.player === "Old Line"));
  assert.ok(lines.every((l) => l.operator === "gte"));
});

test("research legs pass every rule, keep each player's best edge and name the best book", () => {
  const legs = gameLegs(game, observations, merged, at);
  const keys = legs.map((l) => `${l.player}|${l.market}`).sort();
  assert.deepEqual(keys, ["James Cook|Full game · 20+ receiving yards", "James Cook|Full game · 60+ rushing yards"]);
  const rush = legs.find((l) => l.metric === "rushing_yards")!;
  assert.equal(rush.price, -200);
  assert.deepEqual(rush.best, { book: "DraftKings", price: -175 });
  assert.equal(rush.cleared, 5);
  assert.ok(Math.abs(rush.edge - (100 - 200 / 3)) < 1e-9);
});

test("the board keeps one leg per player, skips published selections and caps each game", () => {
  const legs = gameLegs(game, observations, merged, at);
  const board = pickBoard(legs, new Set());
  assert.equal(board.length, 1);
  assert.equal(pickBoard(legs, new Set([selectionKey("g1", "James Cook", board[0].market)])).length, 1);
  assert.equal(pickBoard(legs, new Set(legs.map((l) => selectionKey("g1", l.player, l.market)))).length, 0);
});

test("a published research leg is structured, gradable and labeled", () => {
  const [leg] = pickBoard(gameLegs(game, observations, merged, at), new Set());
  const c = candidate(leg);
  assert.equal(c.research, true);
  assert.equal(c.analysis_kind, "RESEARCH_BOARD");
  assert.equal(c.book, "FanDuel");
  assert.equal(c.quote_observed_at, "2026-10-17T10:00:00Z");
  assert.match(c.market, /^Full game · \d+\+ (rushing yards|receiving yards)$/);
  assert.match(c.why, /of the last 5 games/);
  assert.match(c.risk, /no validated model edge/);
  assert.ok(Array.isArray(c.sources) && c.sources.length === 2);
  assert.equal(c.research_evidence.sample, 5);
});

import assert from "node:assert/strict";
import test from "node:test";
import { teammateSplits, rate, MIN_WITHOUT } from "../src/lib/nba-teammate";
import type { GameStat, Injury, PlayerLine } from "../src/lib/nba-research-tab";

const TEAM = "Philadelphia 76ers";
const g = (game: string, pts: number, team = TEAM, reb = 5): GameStat => ({
  pts,
  reb,
  ast: 3,
  min: 34,
  game,
  team,
});
const line = (
  id: string,
  player: string,
  games: GameStat[],
  team = TEAM,
): PlayerLine =>
  ({ athlete_id: id, player, team, position: "G", games }) as PlayerLine;
const hurt = (player: string, status = "Out", team = TEAM): Injury => ({
  player,
  team,
  status,
  injury: "Knee",
});

// Maxey played g1..g8; Embiid played g1..g4 (missed g5..g8).
const maxey = line("1", "Tyrese Maxey", [
  g("g8", 34),
  g("g7", 31),
  g("g6", 29),
  g("g5", 33),
  g("g4", 22),
  g("g3", 25),
  g("g2", 20),
  g("g1", 27),
]);
const embiid = line("2", "Joel Embiid", [
  g("g4", 30),
  g("g3", 28),
  g("g2", 33),
  g("g1", 31),
]);

test("splits his games by whether an out teammate played, against tonight's line", () => {
  const [s] = teammateSplits(
    maxey,
    [maxey, embiid],
    [hurt("Joel Embiid")],
    "player_points",
    26.5,
  );
  assert.equal(s.teammate, "Joel Embiid");
  assert.equal(s.status, "Out");
  assert.deepEqual(s.without, { n: 4, hits: 4, avg: 31.8 });
  assert.deepEqual(s.with, { n: 4, hits: 1, avg: 23.5 });
  assert.equal(rate(s.without), 100);
  assert.equal(rate(s.with), 25);
});

test("questionable or healthy teammates, other teams and the player himself are ignored", () => {
  const lines = [maxey, embiid];
  assert.deepEqual(
    teammateSplits(
      maxey,
      lines,
      [hurt("Joel Embiid", "Questionable")],
      "player_points",
      26.5,
    ),
    [],
  );
  assert.deepEqual(
    teammateSplits(
      maxey,
      lines,
      [hurt("Joel Embiid", "Out", "Boston Celtics")],
      "player_points",
      26.5,
    ),
    [],
  );
  assert.deepEqual(
    teammateSplits(maxey, lines, [hurt("Tyrese Maxey")], "player_points", 26.5),
    [],
  );
});

test("names match through accents and suffixes; doubtful counts", () => {
  const nurk = line("3", "Jusuf Nurkić", [g("g1", 10), g("g2", 12)]);
  const [s] = teammateSplits(
    maxey,
    [maxey, nurk],
    [hurt("Jusuf Nurkic", "Doubtful")],
    "player_points",
    26.5,
  );
  assert.equal(s.teammate, "Jusuf Nurkić");
  assert.equal(s.with.n, 2);
  assert.equal(s.without.n, 6);
});

test("too few games apart shows nothing", () => {
  const regular = line(
    "4",
    "Kelly Oubre Jr.",
    ["g1", "g2", "g3", "g4", "g5", "g6"].map((id) => g(id, 15)),
  );
  assert.equal(MIN_WITHOUT, 3);
  assert.deepEqual(
    teammateSplits(
      maxey,
      [maxey, regular],
      [hurt("Kelly Oubre Jr.")],
      "player_points",
      26.5,
    ),
    [],
    "only 2 games without him",
  );
});

test("a teammate's games for another team never count as together", () => {
  const traded = line("5", "Caleb Martin", [
    g("g4", 9),
    g("g3", 8),
    g("g2", 7, "Miami Heat"),
    g("g1", 6, "Miami Heat"),
  ]);
  const [s] = teammateSplits(
    maxey,
    [maxey, traded],
    [hurt("Caleb Martin")],
    "player_points",
    26.5,
  );
  assert.equal(s.with.n, 2, "only g3, g4 for the 76ers");
  assert.equal(s.without.n, 6);
});

test("rebounds use rebounds", () => {
  const big = line("6", "Andre Drummond", [
    g("g1", 4, TEAM, 12),
    g("g2", 4, TEAM, 11),
  ]);
  const [s] = teammateSplits(
    maxey,
    [maxey, big],
    [hurt("Andre Drummond")],
    "player_rebounds",
    4.5,
  );
  assert.equal(s.with.avg, 5);
  assert.equal(s.with.hits, 2);
});

test("no shared game means no baseline: the split is skipped, never shown as zero", () => {
  // Oubre played only g9, a game Maxey missed.
  const oubre = line("3", "Kelly Oubre Jr.", [g("g9", 15)]);
  assert.deepEqual(
    teammateSplits(
      maxey,
      [maxey, oubre],
      [hurt("Kelly Oubre Jr.")],
      "player_points",
      26.5,
    ),
    [],
  );
});

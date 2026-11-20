import assert from "node:assert/strict";
import test from "node:test";
import { buildTeaser, liveTeaserRows } from "../src/lib/nba-teaser";
import type { PropRow } from "../src/lib/nba-props";

const NOW = Date.parse("2026-11-20T00:30:00Z"); // 7:30 PM ET
const tip = (h: number) => new Date(NOW + h * 3600000).toISOString();

function row(p: {
  id: string;
  name?: string;
  market?: "player_points" | "player_rebounds";
  edge: number | null;
  chance?: number;
  fair?: number | null;
  streak?: number;
  stale?: boolean;
  tipIn?: number;
  hits?: number;
}): PropRow {
  return {
    key: `${p.id}|${p.market || "player_points"}`,
    stale: !!p.stale,
    edge: p.edge,
    fair: p.fair === undefined ? 50 : p.fair,
    streak: p.streak ?? 0,
    estimate: p.chance == null ? null : ({ chance: p.chance } as never),
    trend: {
      player: p.name || `Player ${p.id}`,
      line: 20.5,
      market: p.market || "player_points",
      over: -110,
      under: -110,
    } as never,
    player: { athlete_id: p.id, team: "Team" } as never,
    home: true,
    opponent: "OPP",
    defense: "",
    minutes: 30,
    matchup: null,
    move: null,
    splits: [],
    game: {
      id: "g",
      tipoff: tip(p.tipIn ?? 1),
      home_abbreviation: "HOM",
      away_abbreviation: "OPP",
      away_team: "",
      home_team: "",
    },
    games: [],
    l5: null,
    l10: p.hits == null ? null : { hits: p.hits, n: 10, pct: p.hits * 10 },
    season: null,
    bestOver: null,
    bestUnder: null,
    books: [],
  } as PropRow;
}

test("teaser: the strongest two fresh upcoming edges, slim and public-safe, plus the board count", () => {
  const rows = [
    row({
      id: "1",
      name: "Jalen Brunson",
      edge: 8,
      chance: 61,
      fair: 53,
      hits: 8,
    }),
    row({
      id: "2",
      name: "Rudy Gobert",
      edge: 3,
      chance: 55,
      fair: 52,
      hits: 6,
    }),
    row({
      id: "3",
      name: "Old Line",
      edge: 12,
      chance: 70,
      fair: 58,
      stale: true,
    }),
    row({ id: "4", name: "Tipped Off", edge: 10, chance: 66, tipIn: -1 }),
    row({ id: "5", name: "Josh Hart", edge: 5, chance: 58, fair: 53, hits: 7 }),
  ];
  const t = buildTeaser(rows, NOW);
  assert.deepEqual(
    t.rows.map((r) => [r.player, r.edge, r.side]),
    [
      ["Jalen Brunson", 8, "over"],
      ["Josh Hart", 5, "over"],
    ],
  );
  assert.equal(
    t.total,
    4,
    "every prop not yet tipped off, stale lines included",
  );
  const [b] = t.rows;
  assert.equal(b.chance, 61);
  assert.equal(b.fair, 53);
  assert.equal(b.hits, 8);
  assert.equal(b.team, "HOM");
  assert.deepEqual(
    Object.keys(b).sort(),
    [
      "athleteId",
      "best",
      "chance",
      "edge",
      "fair",
      "gameId",
      "hits",
      "home",
      "line",
      "market",
      "n",
      "opponent",
      "player",
      "price",
      "side",
      "team",
      "tipoff",
    ],
    "only the fields the teaser card shows",
  );
});

test("teaser for visitors: nothing from a snapshot over 90 minutes old, never a tipped-off game", () => {
  const t = buildTeaser(
    [
      row({ id: "1", edge: 8, chance: 61, tipIn: 0.5 }),
      row({ id: "2", edge: 6, chance: 60, tipIn: 3 }),
    ],
    NOW,
  );
  assert.equal(liveTeaserRows(t, NOW).length, 2);
  assert.equal(
    liveTeaserRows(t, NOW + 45 * 60000).length,
    1,
    "the 30-minute game has tipped",
  );
  assert.deepEqual(liveTeaserRows(t, NOW + 91 * 60000), []);
  assert.deepEqual(liveTeaserRows(null, NOW), []);
});

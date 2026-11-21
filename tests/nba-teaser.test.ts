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
  /** Projection minus the line (projGap). */
  gap: number | null;
  fair?: number | null;
  streak?: number;
  stale?: boolean;
  tipIn?: number;
  hits?: number;
}): PropRow {
  return {
    key: `${p.id}|${p.market || "player_points"}`,
    stale: !!p.stale,
    projGap: p.gap,
    fair: p.fair === undefined ? 50 : p.fair,
    streak: p.streak ?? 0,
    estimate: p.gap == null ? null : ({ projection: 20.5 + p.gap } as never),
    trend: {
      player: p.name || `Player ${p.id}`,
      line: 20.5,
      market: p.market || "player_points",
      over: -110,
      under: -110,
      observedAt: new Date(NOW - 5 * 60000).toISOString(),
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

test("teaser: the two biggest fresh upcoming projection gaps, slim and public-safe, plus the board count", () => {
  const rows = [
    row({ id: "1", name: "Jalen Brunson", gap: 4.5, fair: 53, hits: 8 }),
    row({ id: "2", name: "Rudy Gobert", gap: 1.5, fair: 52, hits: 6 }),
    row({ id: "3", name: "Old Line", gap: 9, fair: 58, stale: true }),
    row({ id: "4", name: "Tipped Off", gap: 8, tipIn: -1 }),
    row({ id: "5", name: "Josh Hart", gap: -3, fair: 53, hits: 7 }),
  ];
  const t = buildTeaser(rows, NOW);
  assert.deepEqual(
    t.rows.map((r) => [r.player, r.gap, r.side]),
    [
      ["Jalen Brunson", 4.5, "over"],
      ["Josh Hart", 3, "under"],
    ],
  );
  assert.equal(
    t.total,
    4,
    "every prop not yet tipped off, stale lines included",
  );
  const [b, h] = t.rows;
  assert.equal(b.projection, 25);
  assert.equal(b.fair, 53);
  assert.equal(h.projection, 17.5);
  assert.equal(h.fair, 47, "the book's no-vig chance for the under");
  assert.equal(h.hits, 3, "under hits are the misses of the over");
  assert.equal(b.hits, 8);
  assert.equal(b.team, "HOM");
  assert.deepEqual(
    Object.keys(b).sort(),
    [
      "athleteId",
      "best",
      "fair",
      "gameId",
      "gap",
      "hits",
      "home",
      "line",
      "market",
      "n",
      "observedAt",
      "opponent",
      "player",
      "price",
      "projection",
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
      row({ id: "1", gap: 4.5, tipIn: 0.5 }),
      row({ id: "2", gap: 3, tipIn: 3 }),
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

test("teaser rows expire with their quote, by the member board's one-hour rule", () => {
  const quoted = (minsAgo: number) =>
    new Date(NOW - minsAgo * 60000).toISOString();
  const r1 = row({ id: "1", gap: 4.5, tipIn: 3 });
  const r2 = row({ id: "2", gap: 3, tipIn: 3 });
  (r1.trend as { observedAt?: string }).observedAt = quoted(55);
  (r2.trend as { observedAt?: string }).observedAt = quoted(5);
  const t = buildTeaser([r1, r2], NOW);
  assert.equal(liveTeaserRows(t, NOW).length, 2);
  assert.deepEqual(
    liveTeaserRows(t, NOW + 10 * 60000).map((r) => r.athleteId),
    ["2"],
    "the 55-minute-old quote is past an hour 10 minutes later",
  );
});

test("rows stored before the switch to projections (an edge, no projection) are not shown", () => {
  const t = buildTeaser([row({ id: "1", gap: 4.5, tipIn: 3 })], NOW);
  const old = {
    ...t,
    rows: t.rows.map((r) => {
      const { projection: _p, gap: _g, ...rest } = r;
      return { ...rest, chance: 76, edge: 26 } as never;
    }),
  };
  assert.equal(liveTeaserRows(t, NOW).length, 1);
  assert.deepEqual(liveTeaserRows(old, NOW), []);
});

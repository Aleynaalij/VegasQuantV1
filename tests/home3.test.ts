import assert from "node:assert/strict";
import test from "node:test";
import {
  board,
  boardPreview,
  leanSide,
  greeting,
  headline,
  heat,
  hotStreaks,
  tally,
  tickerItems,
  topGaps,
} from "../src/lib/home3";
import type { PropRow } from "../src/lib/nba-props";
import type { LiveGame } from "../src/lib/live-scores";
import type { TonightGame } from "../src/lib/vq-tonight";

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

test("greeting follows Eastern time", () => {
  assert.equal(greeting(Date.parse("2026-11-20T14:00:00Z")), "Good morning");
  assert.equal(greeting(Date.parse("2026-11-20T19:00:00Z")), "Good afternoon");
  assert.equal(greeting(NOW), "Good evening");
  assert.equal(greeting(Date.parse("2026-11-20T07:00:00Z")), "Late night");
});

test("lean side flips the numbers for an under lean, gap never negative", () => {
  const over = leanSide(row({ id: "a", gap: 4.2, hits: 7 }));
  assert.equal(over.over, true);
  assert.equal(over.gap, 4.2);
  assert.equal(over.projection, 24.7);
  assert.equal(over.hits, 7);
  const under = leanSide(row({ id: "b", gap: -3.5, hits: 3 }));
  assert.equal(under.over, false);
  assert.equal(under.gap, 3.5);
  assert.equal(under.projection, 17);
  assert.equal(under.hits, 7, "under hits are the misses of the over");
  const none = leanSide(row({ id: "c", gap: null }));
  assert.equal(none.gap, null);
  assert.equal(none.projection, null);
});

test("heat bands are relative to the line", () => {
  assert.deepEqual(
    [null, 0, 1, 2.5, 2.6, 5, 5.2, 9].map((g) => heat(g, 20.5)),
    [0, 0, 1, 1, 2, 2, 3, 3],
  );
  assert.equal(heat(2, 0), 0);
});

test("top gaps: fresh, upcoming, any side, one per player, biggest first", () => {
  const rows = [
    row({ id: "a", gap: 2 }),
    row({ id: "a", market: "player_rebounds", gap: 4 }),
    row({ id: "b", gap: -6 }),
    row({ id: "c", gap: 9, stale: true }),
    row({ id: "d", gap: 8, tipIn: -1 }),
    row({ id: "e", gap: null }),
    row({ id: "f", gap: 0 }),
  ];
  const top = topGaps(rows, NOW);
  assert.deepEqual(
    top.map((r) => r.key),
    ["b|player_points", "a|player_rebounds"],
  );
  assert.equal(topGaps(rows, NOW, 1).length, 1);
});

test("hot streaks: 3+ active, one per player, longest first", () => {
  const rows = [
    row({ id: "a", gap: 1, streak: 4 }),
    row({ id: "a", market: "player_rebounds", gap: 1, streak: -6 }),
    row({ id: "b", gap: 1, streak: 2 }),
    row({ id: "c", gap: 1, streak: 5, tipIn: -2 }),
    row({ id: "d", gap: 1, streak: 3 }),
  ];
  assert.deepEqual(
    hotStreaks(rows, NOW).map((r) => [r.player.athlete_id, r.streak]),
    [
      ["a", -6],
      ["d", 3],
    ],
  );
});

test("headline states form and the projection against the line, never a win chance", () => {
  const h = headline(
    row({
      id: "a",
      name: "Jalen Brunson",
      gap: 4.5,
      hits: 8,
    }),
  );
  assert.ok(h);
  assert.match(
    h.form,
    /Jalen Brunson has gone over 20\.5 points in 8 of his last 10\./,
  );
  assert.equal(h.case, "We project 25 points, 4.5 over the line.");
  assert.doesNotMatch(h.case, /%|edge/);
  const u = headline(row({ id: "b", gap: -3, hits: 3 }));
  assert.ok(u);
  assert.equal(u.case, "We project 17.5 points, 3 under the line.");
  assert.equal(headline(row({ id: "c", gap: null })), null);
});

const game = (
  sport: TonightGame["sport"],
  away: string,
  home: string,
  h: number,
  status: string | null = null,
): TonightGame => ({
  sport,
  id: `${away}-${home}`,
  away,
  home,
  start: tip(h),
  tbd: false,
  status,
  href: "#",
});
const live = (
  away: string,
  home: string,
  h: number,
  state: LiveGame["state"],
): LiveGame => ({
  id: away,
  start: tip(h),
  state,
  detail: state === "in" ? "Q2 5:00" : "Final",
  away: { name: away, abbreviation: away.slice(0, 3), score: 50 },
  home: { name: home, abbreviation: home.slice(0, 3), score: 48 },
});

test("board: live first, upcoming by start, finals last; live scores match by team and time", () => {
  const rows = board(
    [
      game("nba", "Golden State Warriors", "Memphis Grizzlies", 1),
      game("nba", "Boston Celtics", "Denver Nuggets", -1),
      game("ncaab", "Florida", "West Virginia", -4),
      game("nhl", "Dallas Stars", "Vegas Golden Knights", 0.5),
      game("nfl", "Pittsburgh Steelers", "Cleveland Browns", -5, "FINAL"),
    ],
    {
      nba: [live("Boston Celtics", "Denver Nuggets", -1, "in")],
      ncaab: [live("Florida", "West Virginia", -4, "post")],
      nhl: [live("Dallas Stars", "Vegas Golden Knights", 30, "in")],
    },
  );
  assert.deepEqual(
    rows.map((r) => [r.home, r.phase]),
    [
      ["Denver Nuggets", "live"],
      ["Vegas Golden Knights", "upcoming"],
      ["Memphis Grizzlies", "upcoming"],
      ["Cleveland Browns", "final"],
      ["West Virginia", "final"],
    ],
  );
  assert.equal(rows[1].live, null, "a different day's game never matches");
  const t = tally(rows);
  assert.equal(t.games, 5);
  assert.equal(t.live, 1);
  assert.equal(t.bySport.nba, 2);
  assert.deepEqual(
    tickerItems(rows).map((r) => r.phase),
    ["live", "upcoming", "upcoming"],
  );
});

test("board: NHL/college short names match ESPN's full names; postponed games are flagged, not upcoming", () => {
  const rows = board(
    [
      game("nhl", "Stars", "Golden Knights", -1),
      game("ncaab", "Gators", "Mountaineers", 2, "STATUS_POSTPONED"),
      game("nhl", "Kings", "Ducks", 1, "STATUS_CANCELED"),
      game("nba", "Boston Celtics", "Denver Nuggets", 3),
    ],
    {
      nhl: [live("Dallas Stars", "Vegas Golden Knights", -1, "in")],
      ncaab: [],
    },
  );
  assert.deepEqual(
    rows.map((r) => [r.home, r.phase]),
    [
      ["Golden Knights", "live"],
      ["Denver Nuggets", "upcoming"],
      ["Ducks", "off"],
      ["Mountaineers", "off"],
    ],
  );
  assert.equal(rows[0].live?.away.score, 50);
  assert.deepEqual(
    tickerItems(rows).map((r) => r.home),
    ["Golden Knights", "Denver Nuggets"],
    "postponed and cancelled games stay off the next-up ticker",
  );
});

test("board preview: first five games, widened so every live game shows; expanded shows all", () => {
  const rows = (live: number, total: number) =>
    Array.from({ length: total }, (_, i) => ({
      phase: (i < live ? "live" : "upcoming") as "live" | "upcoming",
    }));
  assert.equal(boardPreview(rows(2, 30), false).length, 5);
  assert.equal(boardPreview(rows(7, 30), false).length, 7);
  assert.equal(boardPreview(rows(0, 3), false).length, 3);
  assert.equal(boardPreview(rows(2, 30), true).length, 30);
});

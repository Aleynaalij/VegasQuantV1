import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPropRows,
  filterRows,
  lean,
  noVig,
  sortRows,
  streakOf,
} from "../src/lib/nba-props";
import { seasonLines, type BoxRow } from "../src/lib/nba-research-tab";

const box = (
  id: string,
  player: string,
  team: string,
  pts: number[],
  reb = 5,
): BoxRow[] =>
  pts.map((p, i) => ({
    athlete_id: id,
    player,
    team,
    played: true,
    minutes: 32,
    points: p,
    rebounds: reb,
    assists: 3,
    position: "G",
    tipoff: new Date(Date.UTC(2026, 10, 16 - i * 2, 0)).toISOString(),
    opponent_abbr: "BOS",
    home: i % 2 === 0,
  }));
const NOW = Date.parse("2026-11-18T16:00:00Z");
const FRESH = "2026-11-18T15:50:00Z";
const game = {
  id: "g1",
  away_team: "Orlando Magic",
  home_team: "Philadelphia 76ers",
  away_abbreviation: "ORL",
  home_abbreviation: "PHI",
  tipoff: "2026-11-19T00:00:00Z",
};

test("Prop Finder rows: edge, streak, best price across books, lean and ranking", () => {
  const lines = seasonLines([
    // Newest first: 30, 31, 28, 29, 27, 26, 30, 25, 33, 31 -> all over 24.5, so a 10-game over streak.
    ...box(
      "1",
      "Tyrese Maxey",
      "Philadelphia 76ers",
      [30, 31, 28, 29, 27, 26, 30, 25, 33, 31],
    ),
    // Under 18.5 the last three, over before that.
    ...box(
      "2",
      "Franz Wagner",
      "Orlando Magic",
      [14, 15, 12, 22, 25, 24, 20, 23, 21, 26],
    ),
  ]);
  const trend = (
    athlete_id: string,
    player: string,
    team: string,
    line: number,
    over: number,
    under: number,
  ) => ({
    athlete_id,
    player,
    team,
    market: "player_points" as const,
    line,
    over,
    under,
    observedAt: FRESH,
    gp: 10,
    seasonAvg: 0,
    lastN: 5,
    lastHits: 0,
    seasonHits: 0,
    gap: 0,
  });
  const rows = buildPropRows(
    {
      games: [game],
      lines,
      defense: [],
      trends: new Map([
        [
          "g1",
          [
            {
              ...trend(
                "1",
                "Tyrese Maxey",
                "Philadelphia 76ers",
                24.5,
                -110,
                -110,
              ),
              gap: 4.5,
            },
            {
              ...trend("2", "Franz Wagner", "Orlando Magic", 18.5, -120, 100),
              gap: 1.7,
            },
          ],
        ],
      ]),
      quotes: new Map([
        [
          "g1",
          [
            {
              book: "FanDuel",
              player: "Tyrese Maxey",
              market: "player_points" as const,
              observedAt: FRESH,
              line: 24.5,
              over: -110,
              under: -110,
            },
            {
              book: "DraftKings",
              player: "Tyrese Maxey",
              market: "player_points" as const,
              observedAt: FRESH,
              line: 24.5,
              over: -102,
              under: -118,
            },
            {
              book: "Caesars",
              player: "Tyrese Maxey",
              market: "player_points" as const,
              observedAt: FRESH,
              line: 25.5,
              over: 120,
              under: -150,
            }, // other line
          ],
        ],
      ]),
    },
    NOW,
  );
  const maxey = rows.find((r) => r.trend.player === "Tyrese Maxey")!;
  const wagner = rows.find((r) => r.trend.player === "Franz Wagner")!;
  assert.equal(maxey.streak, 10);
  assert.equal(wagner.streak, -3);
  assert.deepEqual([maxey.l10?.hits, maxey.l10?.n], [10, 10]);
  assert.equal(maxey.fair, 50);
  assert.ok(maxey.estimate && maxey.edge === maxey.estimate.chance - 50);
  assert.equal(lean(maxey), "over");
  // Best price at the same line only; the Caesars 25.5 quote is a different line.
  assert.deepEqual(maxey.bestOver, { book: "DraftKings", price: -102 });
  assert.deepEqual(maxey.bestUnder, { book: "FanDuel", price: -110 });
  assert.equal(maxey.books.length, 2);
  assert.equal(maxey.home, true);
  assert.equal(wagner.opponent, "PHI");

  // Ranking: strongest lean first; filters by text and stat.
  assert.equal(sortRows(rows, "streak")[0].trend.player, "Tyrese Maxey");
  assert.equal(sortRows(rows, "line")[0].trend.player, "Tyrese Maxey");
  assert.deepEqual(
    filterRows(rows, { market: "all", game: "all", query: "magic" }).map(
      (r) => r.trend.player,
    ),
    ["Franz Wagner"],
  );
  assert.deepEqual(
    filterRows(rows, { market: "all", game: "all", query: "phi" }).map(
      (r) => r.trend.player,
    ),
    ["Tyrese Maxey"],
  );
  assert.equal(
    filterRows(rows, { market: "player_rebounds", game: "all", query: "" })
      .length,
    0,
  );
  assert.equal(
    filterRows(rows, { market: "all", game: "other", query: "" }).length,
    0,
  );
});

test("No-vig chance and streaks", () => {
  assert.equal(noVig(-110, -110), 50);
  assert.equal(noVig(-150, 130), 58);
  assert.equal(noVig(null, -110), null);
  const g = (over: boolean) => ({
    at: null,
    opp: null,
    home: null,
    value: 0,
    min: 30,
    usage: null,
    rest: null,
    over,
  });
  assert.equal(streakOf([g(false), g(false), g(true)]), -2);
  assert.equal(streakOf([]), 0);
});

test("Line shopping ignores books that stopped refreshing; lean follows the edge", async () => {
  const { allBookQuotes } = await import("../src/lib/nba-research-tab");
  const now = Date.parse("2026-11-18T16:00:00Z");
  const snap = (book: string, at: string, over: number) => ({
    recorded_at: at,
    observed_at: at,
    payload: {
      book,
      market: "player_points",
      outcomes: [
        { name: "Over", description: "Tyrese Maxey", point: 25.5, price: over },
        {
          name: "Under",
          description: "Tyrese Maxey",
          point: 25.5,
          price: -120,
        },
      ],
    },
  });
  const quotes = allBookQuotes(
    [
      snap("FanDuel", "2026-11-18T15:50:00Z", -110),
      snap("DraftKings", "2026-11-18T12:00:00Z", 150), // four hours old: dropped
      snap("BetMGM", "2026-11-18T15:30:00Z", -105),
    ],
    now,
  );
  assert.deepEqual(quotes.map((q) => [q.book, q.over]).sort(), [
    ["BetMGM", -105],
    ["FanDuel", -110],
  ]);

  // Our 55% over against the book's 58%: the under is the side with the edge.
  const row = {
    edge: -3,
    estimate: { chance: 55, projection: 0, sd: 1 },
    l10: null,
  } as unknown as Parameters<typeof lean>[0];
  assert.equal(lean(row), "under");
  assert.equal(lean({ ...row, edge: null } as typeof row), "over");
});

test("Freshness is judged per quote against the clock: stale lines are labelled and lose their edge", async () => {
  const { propQuotes } = await import("../src/lib/nba-research-tab");
  // A snapshot recorded just now that carries an old provider observation time is still old.
  const [late] = propQuotes([
    {
      recorded_at: "2026-11-18T15:59:00Z",
      observed_at: "2026-11-18T13:00:00Z",
      payload: {
        book: "FanDuel",
        market: "player_points",
        outcomes: [
          {
            name: "Over",
            description: "Joel Embiid",
            point: 23.5,
            price: -115,
          },
          {
            name: "Under",
            description: "Joel Embiid",
            point: 23.5,
            price: -105,
          },
        ],
      },
    },
  ]);
  assert.equal(late.observedAt, "2026-11-18T13:00:00Z");

  const lines = seasonLines([
    ...box(
      "1",
      "Tyrese Maxey",
      "Philadelphia 76ers",
      [30, 31, 28, 29, 27, 26, 30, 25, 33, 31],
    ),
    ...box(
      "3",
      "Joel Embiid",
      "Philadelphia 76ers",
      [28, 19, 31, 24, 26, 22, 29, 30, 18, 27],
    ),
  ]);
  const t = (
    id: string,
    player: string,
    line: number,
    observedAt: string | null,
  ) => ({
    athlete_id: id,
    player,
    team: "Philadelphia 76ers",
    market: "player_points" as const,
    line,
    over: -110,
    under: -110,
    observedAt,
    gp: 10,
    seasonAvg: 0,
    lastN: 5,
    lastHits: 0,
    seasonHits: 0,
    gap: 0,
  });
  const q = (
    book: string,
    player: string,
    line: number,
    observedAt: string,
    over: number,
  ) => ({
    book,
    player,
    market: "player_points" as const,
    line,
    over,
    under: -110,
    observedAt,
  });
  const slate = {
    games: [game],
    lines,
    defense: [],
    trends: new Map([
      [
        "g1",
        [
          t("1", "Tyrese Maxey", 24.5, FRESH),
          { ...t("3", "Joel Embiid", 23.5, late.observedAt ?? null) },
        ],
      ],
    ]),
    quotes: new Map([
      [
        "g1",
        [
          q("FanDuel", "Tyrese Maxey", 24.5, FRESH, -110),
          q("DraftKings", "Tyrese Maxey", 24.5, "2026-11-18T15:20:00Z", 120),
        ],
      ],
    ]),
  };
  // Mixed: the fresh game keeps its edge; the old FanDuel line is stale, with no edge.
  const at4 = buildPropRows(slate, NOW);
  const maxey = at4.find((r) => r.trend.player === "Tyrese Maxey")!;
  const embiid = at4.find((r) => r.trend.player === "Joel Embiid")!;
  assert.equal(maxey.stale, false);
  assert.ok(maxey.edge != null);
  assert.deepEqual(maxey.bestOver, { book: "DraftKings", price: 120 });
  assert.equal(embiid.stale, true);
  assert.equal(embiid.edge, null);
  assert.equal(sortRows(at4, "edge").at(-1)!.trend.player, "Joel Embiid");
  // Unknown provider time counts as stale.
  assert.equal(
    buildPropRows(
      {
        ...slate,
        trends: new Map([["g1", [t("1", "Tyrese Maxey", 24.5, null)]]]),
      },
      NOW,
    )[0].stale,
    true,
  );

  // A failed refresh keeps the same slate, but the clock moves on: 25 minutes later the 15:20
  // DraftKings price has expired and no longer wins best; 70 minutes later FanDuel's line is stale.
  const later = buildPropRows(slate, NOW + 25 * 60000).find(
    (r) => r.trend.player === "Tyrese Maxey",
  )!;
  assert.deepEqual(later.bestOver, { book: "FanDuel", price: -110 });
  const muchLater = buildPropRows(slate, NOW + 70 * 60000).find(
    (r) => r.trend.player === "Tyrese Maxey",
  )!;
  assert.equal(muchLater.stale, true);
  assert.equal(muchLater.bestOver, null);

  // Movement shows only when its "now" is the row's line; a book that has moved past it hides it.
  const pt = (at: string, line: number) => ({
    at,
    line,
    over: -110,
    under: -110,
  });
  const move = (now: number) => ({
    book: "FanDuel",
    open: pt("2026-11-18T12:00:00Z", 23.5),
    now: pt("2026-11-18T15:00:00Z", now),
    delta: now - 23.5,
    steps: [pt("2026-11-18T12:00:00Z", 23.5), pt("2026-11-18T15:00:00Z", now)],
  });
  const withMove = (now: number) =>
    buildPropRows(
      {
        ...slate,
        moves: new Map([
          ["g1", new Map([["player_points|Tyrese Maxey", move(now)]])],
        ]),
      },
      NOW,
    ).find((r) => r.trend.player === "Tyrese Maxey")!.move;
  assert.equal(withMove(24.5)?.delta, 1);
  assert.equal(withMove(25.5), null);
});

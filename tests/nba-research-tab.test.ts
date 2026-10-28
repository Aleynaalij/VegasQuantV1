import test from "node:test";
import assert from "node:assert/strict";
import {
  doubleDoubleWatch,
  latestInjuries,
  nameKey,
  propQuotes,
  propTrends,
  seasonLines,
  type BoxRow,
} from "../src/lib/nba-research-tab";

const row = (
  day: number,
  pts: number,
  reb: number,
  ast: number,
  over: Partial<BoxRow> = {},
): BoxRow => ({
  athlete_id: "1",
  player: "Karl-Anthony Towns",
  team: "New York Knicks",
  played: true,
  minutes: 32,
  points: pts,
  rebounds: reb,
  assists: ast,
  tipoff: `2026-10-${String(20 + day).padStart(2, "0")}T23:30:00Z`,
  ...over,
});

test("Season lines count double-doubles from played games, newest first", () => {
  const [kat] = seasonLines([
    row(1, 19, 12, 1),
    row(4, 27, 20, 3),
    row(2, 22, 10, 3),
    row(3, 8, 14, 10), // rebounds + assists also count
    row(5, 0, 0, 0, { played: false }),
  ]);
  assert.equal(kat.gp, 4);
  assert.equal(kat.dd, 4);
  assert.deepEqual(
    kat.games.map((g) => g.pts),
    [27, 8, 22, 19],
  );
  assert.equal(kat.reb, 14);
  const trae = seasonLines([
    row(1, 22, 6, 9, {
      athlete_id: "2",
      player: "Trae Young",
      team: "Washington Wizards",
    }),
  ])[0];
  assert.equal(trae.dd, 0);
});

test("Double-double watch keeps tonight's teams and enough games", () => {
  const lines = seasonLines([
    row(1, 20, 12, 1),
    row(2, 20, 12, 1),
    row(3, 20, 12, 1),
    ...[1, 2, 3, 4].map((d) =>
      row(d, 20, 10, 2, {
        athlete_id: "3",
        player: "Victor Wembanyama",
        team: "San Antonio Spurs",
      }),
    ),
    row(1, 20, 12, 1, {
      athlete_id: "4",
      player: "Two Games",
      team: "New York Knicks",
    }),
    row(2, 20, 12, 1, {
      athlete_id: "4",
      player: "Two Games",
      team: "New York Knicks",
    }),
    ...[1, 2, 3].map((d) =>
      row(d, 30, 15, 10, {
        athlete_id: "5",
        player: "Off Tonight",
        team: "Boston Celtics",
      }),
    ),
  ]);
  const watch = doubleDoubleWatch(
    lines,
    new Set(["New York Knicks", "San Antonio Spurs"]),
  );
  assert.deepEqual(
    watch.map((w) => [w.player, w.rate]),
    [
      ["Victor Wembanyama", 1],
      ["Karl-Anthony Towns", 1],
    ],
  );
});

test("Prop quotes read the newest FanDuel half-point lines", () => {
  const q = propQuotes([
    {
      recorded_at: "2026-10-28T10:00:00Z",
      payload: {
        book: "FanDuel",
        market: "player_points",
        outcomes: [
          {
            name: "Over",
            description: "Karl-Anthony Towns",
            point: 23.5,
            price: -110,
          },
        ],
      },
    },
    {
      recorded_at: "2026-10-28T22:30:00Z",
      payload: {
        book: "FanDuel",
        market: "player_points",
        outcomes: [
          {
            name: "Over",
            description: "Karl-Anthony Towns",
            point: 22.5,
            price: -115,
          },
          {
            name: "Under",
            description: "Karl-Anthony Towns",
            point: 22.5,
            price: -105,
          },
          { name: "Over", description: "Whole Line", point: 20, price: -110 },
        ],
      },
    },
    {
      recorded_at: "2026-10-28T22:30:00Z",
      payload: {
        book: "DraftKings",
        market: "player_points",
        outcomes: [
          {
            name: "Over",
            description: "Karl-Anthony Towns",
            point: 21.5,
            price: -110,
          },
        ],
      },
    },
  ]);
  assert.deepEqual(q, [
    {
      player: "Karl-Anthony Towns",
      market: "player_points",
      line: 22.5,
      over: -115,
      under: -105,
    },
  ]);
});

test("Prop trends compare the line with the last 5 and the season", () => {
  const lines = seasonLines([
    row(1, 19, 12, 1),
    row(2, 22, 10, 3),
    row(3, 22, 14, 3),
    row(4, 27, 20, 3),
  ]);
  const [t] = propTrends(
    [
      {
        player: "Karl Anthony Towns Jr.",
        market: "player_rebounds",
        line: 11.5,
        over: -120,
        under: -110,
      },
    ],
    lines,
  );
  assert.deepEqual(
    [t.team, t.gp, t.seasonAvg, t.lastN, t.lastHits, t.seasonHits, t.gap],
    ["New York Knicks", 4, 14, 4, 3, 3, 2.5],
  );
  assert.equal(
    propTrends(
      [
        {
          player: "Nobody",
          market: "player_points",
          line: 9.5,
          over: -110,
          under: -110,
        },
      ],
      lines,
    ).length,
    0,
  );
  assert.equal(nameKey("Nikola Jokić"), "nikola jokic");
});

test("Injuries keep each player's latest report, most serious first", () => {
  const list = latestInjuries([
    {
      observed_at: "2026-10-27T20:00:00Z",
      recorded_at: "",
      payload: {
        player: "Alperen Sengun",
        team: "Houston Rockets",
        status: "Questionable",
        injury: "Back",
      },
    },
    {
      observed_at: "2026-10-28T10:00:00Z",
      recorded_at: "",
      payload: {
        player: "Alperen Sengun",
        team: "Houston Rockets",
        status: "Out",
        injury: "Back",
      },
    },
    {
      observed_at: "2026-10-28T10:00:00Z",
      recorded_at: "",
      payload: {
        player: "Joel Embiid",
        team: "Philadelphia 76ers",
        status: "Day-To-Day",
        injury: "Heel",
      },
    },
    {
      observed_at: "2026-10-28T10:00:00Z",
      recorded_at: "",
      payload: { player: "Nobody", team: "X", status: "Active" },
    },
  ]);
  assert.deepEqual(
    list.map((i) => [i.player, i.status]),
    [
      ["Alperen Sengun", "Out"],
      ["Joel Embiid", "Day-To-Day"],
    ],
  );
});

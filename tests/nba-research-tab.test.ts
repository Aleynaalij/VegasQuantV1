import test from "node:test";
import assert from "node:assert/strict";
import {
  doubleDoubleWatch,
  latestInjuries,
  nameKey,
  propQuotes,
  propTrends,
  seasonLines,
  threePointLeaders,
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

test("3-point leaders average only games with recorded attempts", () => {
  const shooter = (
    id: string,
    player: string,
    team: string,
    games: [number, number | null][],
  ) =>
    games.map(([made, att], i) =>
      row(i + 1, 20, 4, 4, {
        athlete_id: id,
        player,
        team,
        threes: made,
        three_attempts: att,
      }),
    );
  const lines = seasonLines([
    ...shooter("1", "Volume Guard", "New York Knicks", [
      [3, 11],
      [4, 10],
      [2, 9],
      [9, null], // attempts not recorded yet: left out of both averages
    ]),
    ...shooter("2", "Efficient Wing", "New York Knicks", [
      [4, 7],
      [5, 8],
      [4, 6],
    ]),
    ...shooter("3", "Two Games", "New York Knicks", [
      [8, 15],
      [8, 15],
    ]),
    ...shooter("4", "Off Tonight", "Boston Celtics", [
      [6, 14],
      [6, 14],
      [6, 14],
    ]),
  ]);
  const teams = new Set(["New York Knicks"]);
  const attempted = threePointLeaders(lines, teams, "tpa");
  assert.deepEqual(
    attempted.map((l) => [l.player, l.tpa, l.tpm, l.tpaGames, l.gp]),
    [
      ["Volume Guard", 10, 3, 3, 4],
      ["Efficient Wing", 7, 13 / 3, 3, 3],
    ],
  );
  assert.deepEqual(
    threePointLeaders(lines, teams, "tpm").map((l) => l.player),
    ["Efficient Wing", "Volume Guard"],
  );
});

test("Prop card: per-game rows carry opponent, venue and rest; filters and hit rates follow them", async () => {
  const { propGames, filterPropGames, hitRate, restDays } = await import(
    "../src/lib/nba-research-tab"
  );
  const [kat] = seasonLines([
    row(1, 19, 12, 1, { home: true, opponent_abbr: "BOS" }),
    row(2, 30, 9, 3, { home: false, opponent_abbr: "MIA" }), // back-to-back
    row(5, 10, 11, 2, { home: true, opponent_abbr: "ORL" }), // two days off
    row(6, 25, 7, 4, { home: false, opponent_abbr: "CHI" }),
  ]);
  const games = propGames(kat, "player_points", 18.5);
  assert.deepEqual(
    games.map((g) => [g.opp, g.home, g.value, g.rest, g.over]),
    [
      ["CHI", false, 25, 0, true],
      ["ORL", true, 10, 2, false],
      ["MIA", false, 30, 0, true],
      ["BOS", true, 19, null, true],
    ],
  );
  assert.deepEqual(hitRate(games, 2), { hits: 1, n: 2, pct: 50 });
  assert.deepEqual(hitRate(games), { hits: 3, n: 4, pct: 75 });
  assert.equal(hitRate([], 5), null);
  assert.deepEqual(
    filterPropGames(games, "home", "any").map((g) => g.opp),
    ["ORL", "BOS"],
  );
  assert.deepEqual(
    filterPropGames(games, "all", 0).map((g) => g.opp),
    ["CHI", "MIA"],
  );
  assert.deepEqual(
    filterPropGames(games, "all", 2).map((g) => g.opp),
    ["ORL"],
  );
  // Rebounds use the rebound column; rest is counted in Eastern days, so a late tip is the same day.
  assert.deepEqual(
    propGames(kat, "player_rebounds", 9.5).map((g) => g.over),
    [false, true, false, true],
  );
  assert.equal(restDays("2026-11-16T03:30:00Z", "2026-11-17T00:00:00Z"), 0);
  assert.equal(restDays(undefined, "2026-11-17T00:00:00Z"), null);
});

test("Prop card model: projected minutes, matchup rank and our estimate", async () => {
  const { projectedMinutes, matchupFor, propEstimate } = await import(
    "../src/lib/nba-research-tab"
  );
  const g = (min: number, pts: number, reb = 5) => ({
    pts,
    reb,
    ast: 0,
    min,
  });
  // Newest first. Weighted last five: (34*5+30*4+30*3+30*2+30*1)/15 = 31.33; season 30.5.
  const games = [
    g(34, 20),
    g(30, 15),
    g(30, 15),
    g(30, 15),
    g(30, 15),
    g(29, 15),
  ];
  assert.equal(projectedMinutes(games, 1), 31.1);
  assert.equal(projectedMinutes(games, 0), 30.2); // back-to-back trims 3%
  assert.equal(projectedMinutes(games.slice(0, 2), 1), null);

  const rows = [
    {
      team: "A",
      pos: "G",
      games: 10,
      points: 40,
      rebounds: 8,
      points_rank: 1,
      rebounds_rank: 3,
    },
    {
      team: "B",
      pos: "G",
      games: 10,
      points: 50,
      rebounds: 9,
      points_rank: 2,
      rebounds_rank: 2,
    },
    {
      team: "C",
      pos: "G",
      games: 10,
      points: 60,
      rebounds: 7,
      points_rank: 3,
      rebounds_rank: 1,
    },
    {
      team: "C",
      pos: "F",
      games: 10,
      points: 30,
      rebounds: 20,
      points_rank: 1,
      rebounds_rank: 1,
    },
  ];
  const soft = matchupFor(rows, "C", "G", "player_points")!;
  // Allows 60 vs a league 50: 1.2 halved toward 1 = 1.1.
  assert.deepEqual(
    [soft.rank, soft.of, soft.label, Math.round(soft.factor * 100)],
    [3, 3, "Soft", 110],
  );
  assert.equal(matchupFor(rows, "A", "G", "player_points")!.label, "Tough");
  assert.equal(matchupFor(rows, "C", "G", "player_rebounds")!.label, "Tough");
  assert.equal(matchupFor(rows, "C", "F", "player_points"), null); // one team is no ranking
  assert.equal(matchupFor(rows, "C", null, "player_points"), null);

  // 0.5 points a minute over 31 minutes projects 15.5, right on the line: 50%.
  const flat = [
    g(30, 15),
    g(30, 15),
    g(30, 15),
    g(30, 15),
    g(30, 15),
    g(30, 15),
  ];
  const even = propEstimate(flat, "player_points", 15.5, 31, 1)!;
  assert.equal(even.projection, 15.5);
  assert.equal(even.chance, 50);
  // No spread in his games: the spread floor (square root of the projection) still applies.
  assert.equal(even.sd, 3.9);
  // A soft matchup pushes the projection and the chance up; a much higher line pulls it down.
  assert.ok(propEstimate(flat, "player_points", 15.5, 31, 1.1)!.chance > 60);
  assert.ok(propEstimate(flat, "player_points", 24.5, 31, 1)!.chance < 5);
  assert.equal(propEstimate(flat, "player_points", 24.5, 31, 1)!.chance, 3); // floor
  assert.equal(propEstimate(flat.slice(0, 4), "player_points", 15.5, 31), null);
  assert.equal(propEstimate(flat, "player_points", 15.5, null), null);
});

test("Game research rows: opponent, venue and usage come from each row's own game", async () => {
  const { boxRowsFromGames } = await import("../src/lib/nba-research-tab");
  const base = {
    athlete_id: 7,
    player: "Jalen Brunson",
    team: "New York Knicks",
    played: true,
    minutes: 35,
    points: 30,
    rebounds: 3,
    assists: 7,
    threes: 4,
    position: "G",
  };
  const rows = boxRowsFromGames(
    [
      {
        ...base,
        game_id: "g1",
        tipoff: "2026-11-10T00:00:00Z",
        away_team: "Boston Celtics",
        home_team: "New York Knicks",
        away_abbreviation: "BOS",
        home_abbreviation: "NY",
      },
      {
        ...base,
        game_id: "g2",
        tipoff: "2026-11-12T00:00:00Z",
        away_team: "New York Knicks",
        home_team: "Miami Heat",
        away_abbreviation: "NY",
        home_abbreviation: "MIA",
      },
    ],
    new Map([["g2:7", 31.4]]),
  );
  assert.deepEqual(
    rows.map((r) => [r.athlete_id, r.home, r.opponent_abbr, r.usage]),
    [
      ["7", true, "BOS", null],
      ["7", false, "MIA", 31.4],
    ],
  );
});

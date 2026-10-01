import test from "node:test";
import assert from "node:assert/strict";
import { matchupUpdateSchema, searchMatchup } from "../src/lib/matchups";
import {
  fixturesFromScoreboard,
  gameWindow,
  oddsObservations,
} from "../supabase/functions/source-sync/normalize";
test("search supports abbreviation pairs, week and game window", () => {
  const game = {
    away_team: "Pittsburgh Steelers",
    home_team: "Cleveland Browns",
    away_abbreviation: "PIT",
    home_abbreviation: "CLE",
    week: 4,
    slot: "Sunday 1 PM",
  };
  for (const q of ["PIT CLE", "Steelers Browns", "Week 4", "Sunday 1 PM"])
    assert.equal(searchMatchup(game, q), true);
  assert.equal(searchMatchup(game, "Week 5"), false);
});
test("official target must reference an existing publication; unknown fields fail", () => {
  const base = {
    summary: "Supplied",
    status: "MONITORING",
    update_type: "INITIAL ANALYSIS",
    raw_handoff: "Supplied",
  };
  assert.equal(
    matchupUpdateSchema.safeParse({
      ...base,
      targets: [
        { market_type: "Total", selection: "Over 40", status: "OFFICIAL" },
      ],
    }).success,
    false,
  );
  assert.equal(
    matchupUpdateSchema.safeParse({ ...base, invented: "x" }).success,
    false,
  );
});
test("missing teams never create a fixture and windows use Eastern time", () => {
  assert.deepEqual(fixturesFromScoreboard({ events: [] }), []);
  assert.equal(gameWindow("2026-10-02T00:15:00Z"), "Thursday Night Football");
  assert.equal(gameWindow("2026-10-04T20:25:00Z"), "Sunday 4 PM");
});
test("odds only match same teams and kickoff, without changing recommendations", () => {
  const events = [
    {
      id: "e",
      home_team: "B",
      away_team: "A",
      commence_time: "2026-10-04T17:00:00Z",
      bookmakers: [
        {
          key: "fanduel",
          title: "FanDuel",
          last_update: "2026-10-01T12:00:00Z",
          markets: [
            {
              key: "spreads",
              outcomes: [{ name: "A", price: -110, point: 3 }],
            },
          ],
        },
      ],
    },
  ];
  assert.equal(
    oddsObservations(events, [
      {
        id: "g",
        home_team: "B",
        away_team: "A",
        kickoff: "2026-10-04T17:00:00Z",
      },
    ]).length,
    1,
  );
  assert.equal(
    oddsObservations(events, [
      {
        id: "g",
        home_team: "B",
        away_team: "A",
        kickoff: "2026-11-04T17:00:00Z",
      },
    ]).length,
    0,
  );
});

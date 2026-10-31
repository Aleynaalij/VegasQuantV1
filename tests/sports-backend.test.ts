import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  scoreboardGames,
  normalizeMarkets,
  scoreboardUrl,
} from "../supabase/functions/sports-sync/normalize";
import { parseResult } from "../supabase/functions/sports-results/parse";
import { gradeSportMarket } from "../src/lib/sport-grading";
import { sportSlotPool, marketSlotPool } from "../src/lib/slot-markets";
import { spinSportTicket } from "../src/lib/vq-slots";
import type {
  SportPage,
  SportGame,
  SportMarket,
} from "../src/lib/sport-contract";
const page = JSON.parse(
  readFileSync("tests/fixtures/sports/nhl/page.json", "utf8"),
) as SportPage;
const game = page.games[0],
  now = Date.parse("2026-10-31T12:00:00Z"),
  source = game.source;
const e = {
  sport_key: "icehockey_nhl",
  id: "event1",
  home_team: game.home.name,
  away_team: game.away.name,
  commence_time: game.start_time,
  bookmakers: [
    {
      key: "fanduel",
      last_update: source.retrieved_at,
      markets: [
        {
          key: "h2h",
          outcomes: [
            { name: game.home.name, price: -110 },
            { name: game.away.name, price: 100 },
          ],
        },
      ],
    },
  ],
};
test("NHL and college schedule queries preserve sport-specific coverage", () => {
  assert.ok(!scoreboardUrl("nhl", "20261031").includes("groups"));
  assert.ok(scoreboardUrl("ncaab", "20261102").includes("groups=50"));
  const body = {
    events: [
      {
        id: "12",
        season: { type: 2, year: 2027 },
        competitions: [
          {
            date: game.start_time,
            competitors: [
              { homeAway: "home", team: { id: "1", displayName: "A" } },
              { homeAway: "away", team: { id: "2", displayName: "B" } },
            ],
            status: { type: { state: "pre", name: "STATUS_SCHEDULED" } },
          },
        ],
      },
    ],
  };
  const rows = scoreboardGames(body, "nhl", source);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].home_score, null);
  assert.equal(rows[0].neutral_site, null);
  assert.equal(rows[0].home.id, "nhl:espn:1");
});
test("Exact sport/game/FanDuel binding, freshness and two-way moneyline", () => {
  const a = normalizeMarkets([e], "nhl", [game], source, now);
  assert.equal(a.length, 2);
  assert.equal(a[0].settlement, "including_overtime_shootout");
  assert.equal(normalizeMarkets([e], "ncaab", [game], source, now).length, 0);
  assert.equal(
    normalizeMarkets([{ ...e, home_team: "Wrong" }], "nhl", [game], source, now)
      .length,
    0,
  );
  const three = structuredClone(e);
  three.bookmakers[0].markets[0].outcomes.push({ name: "Draw", price: 300 });
  assert.equal(normalizeMarkets([three], "nhl", [game], source, now).length, 0);
  assert.equal(
    normalizeMarkets([e], "nhl", [game], source, now + 31 * 60000).length,
    0,
  );
});
test("College whitelist rejects totals and props and preserves negative spreads", () => {
  const g = { ...game, sport: "ncaab" } as SportGame;
  const event = {
    ...e,
    sport_key: "basketball_ncaab",
    bookmakers: [
      {
        key: "fanduel",
        last_update: source.retrieved_at,
        markets: [
          {
            key: "totals",
            outcomes: [{ name: "Over", point: 140, price: -110 }],
          },
          {
            key: "spreads",
            outcomes: [{ name: game.home.name, point: -3.5, price: -110 }],
          },
        ],
      },
    ],
  };
  const rows = normalizeMarkets([event], "ncaab", [g], source, now);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].line, -3.5);
});
test("Hockey player points/goals exact directions and shootout exclusion", () => {
  const event = {
    ...e,
    bookmakers: [
      {
        key: "fanduel",
        last_update: source.retrieved_at,
        markets: [
          {
            key: "player_points",
            outcomes: [
              {
                name: "Over",
                description: "Sample Player",
                point: 0.5,
                price: -110,
              },
            ],
          },
          {
            key: "player_goal_scorer_anytime",
            outcomes: [
              { name: "Yes", description: "Sample Player", price: 200 },
            ],
          },
        ],
      },
    ],
  };
  const rows = normalizeMarkets([event], "nhl", [game], source, now);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].settlement, "skater_stats_excluding_shootout");
  assert.equal(rows[1].line, null);
});
test("Final grading handles pushes, DNP, missing identity and conflict", () => {
  const m = page.markets[0];
  const final = { status: "FINAL", away_score: 3, home_score: 2 };
  assert.equal(gradeSportMarket(m, final), "WIN");
  assert.equal(
    gradeSportMarket({ ...m, market: "spreads", line: -1 }, final),
    "PUSH",
  );
  assert.equal(
    gradeSportMarket(
      { ...m, market: "totals", line: 5, direction: "Under" },
      final,
    ),
    "PUSH",
  );
  assert.equal(
    gradeSportMarket(m, { ...final, status: "CONFLICT" }),
    "PENDING",
  );
  const prop = {
    ...m,
    market: "player_points",
    athlete_id: "9",
    line: 0.5,
    direction: "Over",
  } as SportMarket;
  assert.equal(gradeSportMarket(prop, { ...final, players: [] }), "PENDING");
  assert.equal(
    gradeSportMarket(prop, {
      ...final,
      players: [{ athlete_id: "9", played: false, points: null, goals: null }],
    }),
    "VOID",
  );
});
test("Slots keeps different skaters at the same threshold when selection is a direction", () => {
  const prop: SportMarket = {
    ...page.markets[0],
    market: "player_points",
    selection: "Over",
    side: null,
    direction: "Over",
    line: 0.5,
    player: "First skater",
    athlete_id: "1",
  };
  const rows = sportSlotPool(
    {
      ...page,
      markets: [
        prop,
        {
          ...prop,
          id: "another-quote",
          player: "Second skater",
          athlete_id: "2",
        },
      ],
    },
    "nhl",
    now,
  );
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].selection_group, rows[1].selection_group);
});
test("Sport-filtered Slots never mixes sports or adds college props", () => {
  const rows = sportSlotPool(page, "nhl", now);
  assert.equal(rows.length, 1);
  assert.equal(sportSlotPool(page, "ncaab", now).length, 0);
  assert.equal(sportSlotPool({ ...page, access: false }, "nhl", now).length, 0);
  assert.throws(
    () => spinSportTicket("ncaab", rows, null, Math.random, now),
    /Eight/,
  );
  assert.equal(rows[0].sport, "nhl");
});
test("Final parser rejects foreign teams and missing rows rather than inventing zero", () => {
  assert.throws(
    () => parseResult({ header: { id: "x" } }, game, source),
    /identity/,
  );
  const data = {
    header: {
      id: game.provider_id,
      competitions: [
        {
          status: { type: { completed: true, name: "STATUS_FINAL" } },
          competitors: [
            {
              team: { id: game.away.provider_id },
              homeAway: "away",
              score: "2",
            },
            {
              team: { id: game.home.provider_id },
              homeAway: "home",
              score: "1",
            },
          ],
        },
      ],
    },
    boxscore: { players: [] },
  };
  assert.throws(
    () => parseResult(data, game, source),
    /Missing player|conservation/,
  );
});
test("Public contract excludes archived raw provider response body", () => {
  const withBody = { ...source, body: "RAW_ARCHIVE_ONLY" };
  const rows = normalizeMarkets([e], "nhl", [game], withBody, now);
  assert.ok(!("body" in rows[0].source));
});
test("Neutral-site reversed provider orientation binds the exact team, never the other side", () => {
  const g = { ...game, neutral_site: true };
  const swapped = { ...e, home_team: e.away_team, away_team: e.home_team };
  const rows = normalizeMarkets([swapped], "nhl", [g], source, now);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((m) => m.selection === g.home.name)?.side, "home");
  assert.equal(
    normalizeMarkets([swapped], "nhl", [game], source, now).length,
    0,
  );
});

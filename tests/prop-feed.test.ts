import { test } from "node:test";
import assert from "node:assert/strict";
import {
  upcomingPropEvents,
  propObservations,
} from "../supabase/functions/source-sync/props";
import { oddsObservations } from "../supabase/functions/source-sync/normalize";
const now = Date.parse("2026-10-05T12:00:00Z");
const game = {
  id: "fixture",
  home_team: "Buffalo Bills",
  away_team: "New England Patriots",
  kickoff: "2026-10-06T17:00:00Z",
};
const event = {
  id: "test_event",
  home_team: game.home_team,
  away_team: game.away_team,
  commence_time: game.kickoff,
};
test("props use matched future games only and report truncated coverage", () => {
  assert.equal(
    upcomingPropEvents([event, event], [game], now).events.length,
    1,
  );
  assert.equal(upcomingPropEvents([event], [game], now, 0).skipped, 1);
  assert.equal(
    upcomingPropEvents(
      [{ ...event, commence_time: "2026-10-04T17:00:00Z" }],
      [game],
      now,
    ).events.length,
    0,
  );
  assert.equal(
    upcomingPropEvents([{ ...event, home_team: "wrong" }], [game], now).events
      .length,
    0,
  );
});
test("prop ingestion retains observed time and rejects missing player or invalid prices", () => {
  const e = {
    ...event,
    bookmakers: [
      {
        key: "fanduel",
        title: "FanDuel",
        last_update: "2026-10-05T11:59:00Z",
        markets: [
          {
            key: "player_rush_yds",
            outcomes: [
              {
                name: "Over",
                description: "Test player",
                point: 60.5,
                price: -110,
              },
              {
                name: "Under",
                description: "Test player",
                point: 60.5,
                price: -110,
              },
            ],
          },
        ],
      },
    ],
  };
  const rows = propObservations(e, [game], now);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].observed_at, "2026-10-05T11:59:00Z");
  assert.ok(!rows[0].source.includes("apiKey"));
  e.bookmakers[0].markets[0].outcomes[0].price = 0;
  assert.equal(propObservations(e, [game], now).length, 0);
});
test("odds keep every line-shopping book separately attributed; other books are ignored", () => {
  const market = {
    key: "player_rush_yds",
    last_update: "2026-10-05T11:59:00Z",
    outcomes: [
      { name: "Over", description: "Test player", point: 60.5, price: -115 },
      { name: "Under", description: "Test player", point: 60.5, price: -105 },
    ],
  };
  const fd = {
    key: "fanduel",
    title: "FanDuel",
    last_update: "2026-10-05T11:58:00Z",
    markets: [market],
  };
  const dk = {
    ...fd,
    key: "draftkings",
    title: "DraftKings",
    markets: [
      {
        ...market,
        outcomes: market.outcomes.map((o) => ({ ...o, price: -110 })),
      },
    ],
  };
  const offshore = { ...dk, key: "bovada", title: "Bovada" };
  const fixture = { ...event, bookmakers: [dk, fd, offshore] };
  const original = JSON.stringify(fixture);
  const rows = oddsObservations([fixture], [game]);
  assert.deepEqual(
    rows.map((r) => [r.payload.book, r.payload.outcomes[0].price]),
    [
      ["DraftKings", -110],
      ["FanDuel", -115],
    ],
  );
  assert.equal(rows[1].observed_at, market.last_update);
  assert.deepEqual(
    propObservations(fixture, [game], now).map((r) => r.payload.book),
    ["DraftKings", "FanDuel"],
  );
  assert.deepEqual(
    oddsObservations([{ ...event, bookmakers: [offshore] }], [game]),
    [],
  );
  assert.equal(JSON.stringify(fixture), original);
});
test("research games request alternate lines before publication; pick games add extra markets", async () => {
  const { PICK_PROP_MARKETS, BASE_PROP_MARKETS, gameForEvent } = await import(
    "../supabase/functions/source-sync/props"
  );
  assert.ok(PICK_PROP_MARKETS.includes("player_receptions_alternate"));
  assert.deepEqual(BASE_PROP_MARKETS, [
    "player_rush_yds",
    "player_reception_yds",
    "player_pass_yds",
    "player_rush_yds_alternate",
    "player_reception_yds_alternate",
    "player_pass_yds_alternate",
    "player_sacks",
    "player_sacks_alternate",
  ]);
  assert.equal(new Set(PICK_PROP_MARKETS).size, PICK_PROP_MARKETS.length);
  assert.equal(gameForEvent(event, [game])?.id, "fixture");
  const e = {
    ...event,
    bookmakers: [
      {
        key: "fanduel",
        title: "FanDuel",
        last_update: "2026-10-05T11:59:00Z",
        markets: [
          {
            key: "player_pass_yds_alternate",
            outcomes: [
              {
                name: "Over",
                description: "Test QB",
                point: 199.5,
                price: -150,
              },
            ],
          },
        ],
      },
    ],
  };
  assert.equal(
    propObservations(e, [game], now)[0].payload.market,
    "player_pass_yds_alternate",
  );
});

test("passing and defensive sack quotes retain the exact price and fractional threshold", () => {
  const rows = propObservations(
    {
      ...event,
      bookmakers: [
        {
          key: "fanduel",
          title: "FanDuel",
          last_update: "2026-10-05T11:59:00Z",
          markets: [
            {
              key: "player_sacks",
              outcomes: [
                {
                  name: "Over",
                  description: "Test Defender",
                  point: 0.5,
                  price: -180,
                },
              ],
            },
            {
              key: "player_sacks_alternate",
              outcomes: [
                {
                  name: "Over",
                  description: "Test Defender",
                  point: 1.5,
                  price: 300,
                },
              ],
            },
            {
              key: "player_pass_yds",
              outcomes: [
                {
                  name: "Over",
                  description: "Test QB",
                  point: 225.5,
                  price: -110,
                },
              ],
            },
          ],
        },
      ],
    },
    [game],
    now,
  );
  assert.equal(rows.length, 3);
  assert.equal(
    rows.find((r) => r.payload.market === "player_sacks")?.payload.outcomes[0]
      .point,
    0.5,
  );
  assert.equal(
    rows.find((r) => r.payload.market === "player_sacks_alternate")?.payload
      .outcomes[0].price,
    300,
  );
});
test("market-set upgrades invalidate old fetch clocks without accepting future or malformed timestamps", async () => {
  const { propFetchCache, PROP_MARKET_SET_VERSION } = await import(
    "../supabase/functions/source-sync/props"
  );
  const valid = "2026-10-05T11:59:00Z";
  assert.deepEqual(
    propFetchCache({ event_fetched_at: { e1: valid } }, now),
    {},
  );
  assert.deepEqual(
    propFetchCache(
      { market_set_version: "old", event_fetched_at: { e1: valid } },
      now,
    ),
    {},
  );
  assert.deepEqual(
    propFetchCache(
      {
        market_set_version: PROP_MARKET_SET_VERSION,
        event_fetched_at: { e1: valid, e2: "bad", e3: "2026-10-06T11:59:00Z" },
      },
      now,
    ),
    { e1: valid },
  );
});

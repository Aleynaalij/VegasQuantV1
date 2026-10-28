import test from "node:test";
import assert from "node:assert/strict";
import {
  marketSlotPool,
  type SlotObservation,
  type SlotGame,
} from "../src/lib/slot-markets";
import { spinTicket, slotCopy } from "../src/lib/vq-slots";
const now = Date.parse("2026-10-28T00:30:00Z");
const games: SlotGame[] = Array.from({ length: 14 }, (_, i) => ({
  id: `game-${i}`,
  home_team: `Home ${i}`,
  away_team: `Away ${i}`,
  kickoff: "2026-11-01T18:00:00Z",
}));
const observation = (i: number): SlotObservation => ({
  id: `obs-${i}`,
  game_id: games[i].id,
  source: "https://example.com/odds",
  observed_at: "2026-10-28T00:00:00Z",
  recorded_at: "2026-10-28T00:00:01Z",
  payload: {
    book: "FanDuel",
    market: "h2h",
    outcomes: [
      { name: games[i].home_team, price: 120 },
      { name: games[i].away_team, price: -140 },
    ],
  },
});
test("sourced full slate works without any published selections", () => {
  const pool = marketSlotPool(
    games,
    games.map((_, i) => observation(i)),
    now,
  );
  assert.equal(pool.length, 28);
  assert.equal(new Set(pool.map((r) => r.game_id)).size, 14);
  for (let i = 0; i < 20; i++) {
    const ticket = spinTicket(pool, null, Math.random, now);
    assert.equal(ticket.length, 8);
    assert.equal(new Set(ticket.map((r) => r.game_id)).size, 8);
  }
  assert.match(slotCopy(pool.slice(0, 8)), /FanDuel snapshot/);
});
test("expired, future, wrong book, unknown team and unsupported markets stay excluded", () => {
  const o = observation(0);
  for (const invalid of [
    { ...o, observed_at: "2026-10-26T00:00:00Z" },
    { ...o, observed_at: "2026-10-29T00:00:00Z" },
    { ...o, payload: { ...o.payload, book: "DraftKings" } },
    {
      ...o,
      payload: { ...o.payload, outcomes: [{ name: "Other team", price: 100 }] },
    },
    { ...o, payload: { ...o.payload, market: "invented_market" } },
  ])
    assert.equal(marketSlotPool(games, [invalid], now).length, 0);
  assert.equal(
    marketSlotPool([{ ...games[0], kickoff: "2026-10-27T00:00:00Z" }], [o], now)
      .length,
    0,
  );
});
test("new snapshot replaces old line rather than reviving removed outcomes", () => {
  const old = { ...observation(0), observed_at: "2026-10-27T23:00:00Z" };
  const fresh = {
    ...observation(0),
    payload: {
      ...observation(0).payload,
      outcomes: [{ name: games[0].home_team, price: 130 }],
    },
  };
  assert.equal(marketSlotPool(games, [old, fresh], now).length, 1);
});
test("exact player thresholds retained, alternatives/opposing sides cannot share a ticket", () => {
  const o = observation(0);
  const props = {
    ...o,
    payload: {
      book: "FanDuel",
      market: "player_rush_yds_alternate",
      outcomes: [
        { description: "Runner", name: "Over", point: 59.5, price: 140 },
        { description: "Runner", name: "Over", point: 79.5, price: 300 },
        { description: "Runner", name: "Under", point: 59.5, price: -170 },
      ],
    },
  };
  const pool = marketSlotPool(
    games,
    [props, ...games.map((_, i) => observation(i))],
    now,
  );
  assert.equal(pool.filter((r) => r.name === "Runner").length, 3);
  assert.ok(pool.some((r) => r.market === "Over 79.5 rushing yards"));
  assert.ok(
    pool.every(
      (r) =>
        r.expires_at === games[0].kickoff ||
        Date.parse(r.expires_at) === Date.parse(o.observed_at!) + 86400000,
    ),
  );
  const only = pool.filter((r) => r.game_id === "game-0");
  assert.throws(
    () => spinTicket(only, null, Math.random, now),
    /Eight different/,
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  homeRecord,
  homeVisible,
  HOME_RECORD_RULE,
} from "../src/lib/track-record";
import type { PricedLeg } from "../src/lib/priced-record";

let n = 0;
const leg = (
  result: string | null,
  odds: number,
  kind = "SINGLE",
  extra: Partial<PricedLeg> = {},
): PricedLeg =>
  ({
    leg_key: `k${++n}`,
    kind,
    name: `Player ${n}`,
    market: "Over 59.5 receiving yards",
    matchup: `Game ${n} · Sun`,
    game_id: `g${n}`,
    published_at: `2026-10-${String(1 + (n % 28)).padStart(2, "0")}T12:00:00Z`,
    result,
    result_source: result ? "https://example.com/box" : null,
    odds,
    original_leg_key: null,
    ...extra,
  }) as PricedLeg;

test("Home's record matches the Records page rules: official kinds, sourced results, units at published prices", () => {
  const legs = [
    leg("WIN", -200),
    leg("WIN", 150),
    leg("LOSS", -110),
    leg("WIN", -300, "RESEARCH"),
    leg("LOSS", -110, "PARLAY"),
    leg(null, -110),
    leg("WIN", -110, "SINGLE", { result_source: null }),
  ];
  const r = homeRecord(legs, new Map());
  assert.equal(r.wins, 2);
  assert.equal(r.losses, 1);
  assert.equal(r.picks, 3);
  assert.equal(r.units, 0.5 + 1.5 - 1);
  assert.ok(r.hitRate! > 66 && r.hitRate! < 67);
  assert.equal(r.visible, false);
});

test("closing-line value counts only official picks with a tracked close", () => {
  const a = leg("WIN", -110),
    b = leg("LOSS", -110),
    research = leg("WIN", -110, "RESEARCH");
  const tracked = new Map([
    [a.leg_key, { first: -110, last: -140 }],
    [b.leg_key, { first: -110, last: +100 }],
    [research.leg_key, { first: -110, last: -200 }],
  ]);
  const r = homeRecord([a, b, research], tracked);
  assert.equal(r.clvLegs, 2);
  assert.equal(r.beatCloseRate, 50);
});

test("Home shows the record once profitable over the minimum sample, or at the larger sample either way", () => {
  const { profitableAfter, alwaysAfter } = HOME_RECORD_RULE;
  assert.equal(homeVisible({ picks: profitableAfter - 1, units: 5 }), false);
  assert.equal(homeVisible({ picks: profitableAfter, units: 0.01 }), true);
  assert.equal(homeVisible({ picks: profitableAfter + 40, units: -3 }), false);
  assert.equal(homeVisible({ picks: profitableAfter, units: 0 }), false);
  assert.equal(homeVisible({ picks: alwaysAfter, units: -10 }), true);
});

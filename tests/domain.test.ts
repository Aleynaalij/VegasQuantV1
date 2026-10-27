import test from "node:test";
import assert from "node:assert/strict";
import {
  clv,
  decimalOdds,
  implied,
  winProfit,
  metrics,
  emptyDesk,
  type Pick,
  type Entry,
  type Closing,
} from "../src/lib/domain";
const pick = {
  id: "synthetic",
  market: "Side",
  recommended_line: 6.5,
  odds: -110,
  stake_cents: 2000,
  confidence: 7,
  edge: 3.6,
} as Pick;
const entry = { pick_id: pick.id, line: 6.5, odds: -110 } as Entry;
const close = { pick_id: pick.id, line: 7, odds: -110 } as Closing;
test("$20 at -110 wins $18.18, producing $38.18", () => {
  assert.equal(winProfit(2000, -110), 1818);
  assert.equal(2000 + winProfit(2000, -110), 3818);
});
test("real odds drive subsequent rollover, not an assumed doubling", () => {
  assert.equal(winProfit(3818, 150), 5727);
  assert.equal(3818 + winProfit(3818, 150), 9545);
  assert.equal(winProfit(2000, -200), 1000);
});
test("American odds probabilities", () => {
  assert.equal(decimalOdds(100), 2);
  assert.ok(Math.abs(implied(-110) - 52.38095238) < 0.00001);
});
test("key-number miss: +6.5 vs closing +7", () => {
  const c = clv(pick, entry, close);
  assert.equal(c.points, -0.5);
  assert.equal(c.price, null);
  assert.equal(c.key, "Key 7: waiting offered a better number");
});
test("key number 3 entry beats later +2.5", () => {
  const c = clv(pick, { ...entry, line: 3 }, { ...close, line: 2.5 });
  assert.equal(c.points, 0.5);
  assert.match(c.key!, /entry beat/);
});
test("price CLV only compares same line", () => {
  assert.equal(clv(pick, entry, close).price, null);
  assert.ok(clv(pick, entry, { ...close, line: 6.5, odds: -120 }).price! > 0);
});
test("totals use correct direction", () => {
  assert.equal(
    clv(
      { ...pick, market: "Total", direction: "under" },
      { ...entry, line: 43.5 },
      { ...close, line: 42 },
    ).points,
    1.5,
  );
  assert.equal(
    clv(
      { ...pick, market: "Total", direction: "over" },
      { ...entry, line: 43.5 },
      { ...close, line: 42 },
    ).points,
    -1.5,
  );
});
test("missing actual entry never implies execution or CLV", () => {
  assert.deepEqual(clv(pick, undefined, close), {
    price: null,
    points: null,
    key: null,
  });
});
test("empty history does not invent statistics", () => {
  const m = metrics(emptyDesk);
  assert.equal(m.net, 0);
  assert.equal(m.winRate, null);
  assert.equal(m.avgClv, null);
  assert.equal(m.roi, null);
});

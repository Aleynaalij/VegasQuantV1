import test from "node:test";
import assert from "node:assert/strict";
import { pricedRecord, profitUnits, impliedProbability, type PricedLeg } from "../src/lib/priced-record";

const src = "https://www.espn.com/nfl/boxscore/_/gameId/1";
const leg = (key: string, result: string, odds: number | null, extra: Partial<PricedLeg> = {}): PricedLeg => ({
  leg_key: key, kind: "SINGLE", name: key, market: "Full game · 60+ rushing yards", matchup: "BUF @ LAR · Oct 12",
  game_id: "g", published_at: "2026-10-12T10:00:00Z", result, result_source: src, odds, ...extra,
});

test("units and implied probability follow American odds", () => {
  assert.equal(profitUnits(150), 1.5);
  assert.equal(profitUnits(-200), 0.5);
  assert.equal(impliedProbability(-300), 0.75);
  assert.equal(impliedProbability(100), 0.5);
});

test("a high hit rate on heavy favorites can still lose money", () => {
  const r = pricedRecord([
    leg("a", "WIN", -400), leg("b", "WIN", -400), leg("c", "WIN", -400), leg("d", "LOSS", -400),
  ]);
  assert.equal(r.hitRate, 75);
  assert.equal(r.breakEvenRate, 80);
  assert.equal(r.units, -0.25);
  assert.equal(r.roi, -6.25);
});

test("only graded, sourced individual picks with a price count; pushes return the stake", () => {
  const r = pricedRecord([
    leg("win", "WIN", 120),
    leg("push", "PUSH", -110),
    leg("unpriced", "WIN", null),
    leg("unsourced", "WIN", -110, { result_source: null }),
    leg("pending", "", -110, { result: null }),
    leg("hail", "WIN", 900, { kind: "HAIL_MARY" }),
    leg("official", "WIN", -110, { kind: "OFFICIAL" }),
  ]);
  assert.deepEqual([r.picks, r.unpriced, r.wins, r.pushes, r.units], [2, 1, 1, 1, 1.2]);
  assert.equal(r.hitRate, 100);
});

test("a price revision or a repeated selection counts once, at the first publication", () => {
  const r = pricedRecord([
    leg("revised", "WIN", -200, { name: "Cook", original_leg_key: "orig", published_at: "2026-10-12T12:00:00Z" }),
    leg("orig", "WIN", -150, { name: "Cook" }),
    leg("repeat", "WIN", -300, { name: "Cook", published_at: "2026-10-12T13:00:00Z" }),
  ]);
  assert.equal(r.picks, 1);
  assert.equal(r.units, profitUnits(-150));
});

test("closing line value compares the published price with FanDuel's last price before kickoff", () => {
  const r = pricedRecord(
    [leg("a", "WIN", -150), leg("b", "LOSS", -150, { name: "b2" }), leg("c", "WIN", -150, { name: "c2" })],
    new Map([["a", -200], ["b", -120]]),
  );
  assert.equal(r.clvPicks, 2);
  assert.equal(r.beatClose, 1);
  // a: 66.7 − 60 = +6.7 pts; b: 54.5 − 60 = −5.5 pts → average +0.6
  assert.ok(Math.abs(r.avgClv! - 0.606) < 0.01);
});

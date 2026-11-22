import test from "node:test";
import assert from "node:assert/strict";
import { homeRecord, homeVisible } from "../src/lib/track-record";
import type { PricedLeg } from "../src/lib/priced-record";

// Synthetic inputs only. No API, stored result or publication is changed.
test("record presentation keeps a losing 150-pick sample visible with all losses and ROI", () => {
  const legs = Array.from(
    { length: 150 },
    (_, i) =>
      ({
        leg_key: `synthetic-record-${i}`,
        kind: "SINGLE",
        name: `Synthetic player ${i}`,
        market: "Full game · over 50.5",
        matchup: "Synthetic A @ Synthetic B",
        game_id: `synthetic-game-${i}`,
        published_at: "2026-10-01T12:00:00Z",
        result: i < 60 ? "WIN" : "LOSS",
        result_source: "https://example.com/synthetic",
        odds: -200,
        original_leg_key: null,
      }) as PricedLeg,
  );
  const r = homeRecord(legs, new Map());
  assert.equal(r.picks, 150);
  assert.equal(r.wins, 60);
  assert.equal(r.losses, 90);
  assert.equal(r.units, -60);
  assert.equal(r.roi, -40);
  assert.equal(r.hitRate, 40);
  assert.ok(Math.abs(r.breakEvenRate! - 66.6666666667) < 0.0001);
  assert.equal(r.visible, true);
  assert.equal(r.beatCloseRate, null);
  assert.equal(r.clvLegs, 0);
});

test("record visibility keeps the 49/50 and 149/150 boundaries, including break-even samples", () => {
  for (const [picks, units, visible] of [
    [49, 1, false],
    [50, 0.01, true],
    [50, 0, false],
    [50, -1, false],
    [149, -1, false],
    [149, 0, false],
    [150, -100, true],
    [150, 0, true],
  ] as const)
    assert.equal(
      homeVisible({ picks, units }),
      visible,
      `${picks} picks, ${units} units`,
    );
});

test("record presentation preserves absent rates rather than inventing a zero percent result", () => {
  const r = homeRecord([], new Map());
  assert.equal(r.picks, 0);
  assert.equal(r.roi, null);
  assert.equal(r.hitRate, null);
  assert.equal(r.breakEvenRate, null);
  assert.equal(r.beatCloseRate, null);
  assert.equal(r.visible, false);
});

function luminance(hex: string) {
  const rgb = hex
    .match(/[a-f\d]{2}/gi)!
    .map((x) => parseInt(x, 16) / 255)
    .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
test("record palette keeps main, supporting, gain and loss text above normal-text contrast", () => {
  for (const foreground of ["f5eedd", "c0c9bc", "e7cb82", "95e3bd", "ffb3a6"])
    for (const background of ["102b24", "0b211c", "244334"])
      assert.ok(
        contrast(foreground, background) >= 4.5,
        `${foreground} on ${background}`,
      );
  assert.ok(contrast("e7cb82", "102b24") >= 3, "focus indicator");
  assert.ok(contrast("f1dfae", "302d1e") >= 4.5, "admin preview");
});

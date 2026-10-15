import { test } from "node:test";
import assert from "node:assert/strict";
import { swipeStep } from "../src/lib/tab-swipe";
test("deliberate horizontal swipes move one tab in either direction", () => {
  assert.equal(swipeStep(-100, 10, 200), 1);
  assert.equal(swipeStep(100, -10, 200), -1);
});
test("scrolling, diagonals, taps and long drags never switch tabs", () => {
  for (const [x, y, ms] of [[10,100,200], [80,60,200], [20,0,100], [100,0,1000]])
    assert.equal(swipeStep(x,y,ms), 0);
});

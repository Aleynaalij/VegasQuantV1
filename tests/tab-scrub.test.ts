import { test } from "node:test";
import assert from "node:assert/strict";
import { scrubIndex } from "../src/lib/tab-scrub";
const tabs = [0, 80, 160, 240, 320].map((left) => ({ left, right: left + 80 }));
test("the tab under the finger is the one whose span holds it", () => {
  assert.equal(scrubIndex(10, tabs), 0);
  assert.equal(scrubIndex(80, tabs), 1);
  assert.equal(scrubIndex(239.5, tabs), 2);
  assert.equal(scrubIndex(399, tabs), 4);
});
test("sliding past either end stays on the end tab", () => {
  assert.equal(scrubIndex(-30, tabs), 0);
  assert.equal(scrubIndex(450, tabs), 4);
  assert.equal(scrubIndex(10, []), -1);
});

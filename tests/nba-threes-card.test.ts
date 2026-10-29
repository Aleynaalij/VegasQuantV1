import test from "node:test";
import assert from "node:assert/strict";
import {
  cardDate,
  isCardDay,
  pct,
  threesCardDay,
} from "../src/lib/nba-threes-card";

test("3-point card day comes only from a well-formed card value", () => {
  assert.equal(threesCardDay("nba-threes:2026-10-29"), "2026-10-29");
  assert.equal(threesCardDay(null), null);
  assert.equal(threesCardDay("nba-threes:2026-10-29/../x"), null);
  assert.equal(threesCardDay("other:2026-10-29"), null);
  assert.equal(isCardDay("2026-10-29"), true);
  assert.equal(isCardDay("2026-02-30"), false);
  assert.equal(isCardDay("../etc"), false);
});

test("Card labels read like the post", () => {
  assert.equal(cardDate("2026-10-29"), "THU · OCT 29");
  assert.equal(pct({ tpm: 4, tpa: 9.3 }), "43%");
  assert.equal(pct({ tpm: 0, tpa: 0 }), "0%");
});

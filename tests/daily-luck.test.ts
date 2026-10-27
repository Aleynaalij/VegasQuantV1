import { test } from "node:test";
import assert from "node:assert/strict";
import { total, outcome, deck, dayKey } from "../src/lib/daily-luck";
const hand = (...ranks: string[]) =>
  ranks.map((rank) => ({ rank, suit: "♠" }));
test("aces soften without busting; face cards count ten", () => {
  assert.equal(total(hand("A", "A", "9")), 21);
  assert.equal(total(hand("A", "K", "8")), 19);
  assert.equal(total(hand("K", "Q", "2")), 22);
});
test("naturals beat drawn 21, dealer bust wins and equal hands push", () => {
  assert.equal(outcome(hand("A", "K"), hand("7", "7", "7")), "win");
  assert.equal(outcome(hand("7", "7", "7"), hand("A", "K")), "loss");
  assert.equal(outcome(hand("10", "8"), hand("K", "8", "6")), "win");
  assert.equal(outcome(hand("K", "8"), hand("9", "9")), "push");
  assert.equal(outcome(hand("K", "Q", "2"), hand("K", "Q", "3")), "loss");
});
test("shuffle contains exactly 52 distinct cards", () => {
  const cards = deck();
  assert.equal(cards.length, 52);
  assert.equal(new Set(cards.map((c) => c.rank + c.suit)).size, 52);
});
test("daily boundary follows New York, not UTC midnight", () => {
  assert.equal(dayKey(new Date("2026-10-15T03:59:00Z")), "2026-10-14");
  assert.equal(dayKey(new Date("2026-10-15T04:00:00Z")), "2026-10-15");
});

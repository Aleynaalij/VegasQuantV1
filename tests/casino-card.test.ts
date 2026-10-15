import test from "node:test";
import assert from "node:assert/strict";
import { cardRank, cleanMarket, legLayout, odds, wrapText } from "../src/lib/casino-card";

test("each card kind has its playing-card rank", () => {
  assert.equal(cardRank({ variant: "pod", market: "50+ receiving yards" }), "A");
  assert.equal(cardRank({ variant: "parlay" }), "JOKER");
  assert.equal(cardRank({ variant: "hailmary" }), "JOKER");
  assert.equal(cardRank({ variant: "win" }), "21");
  assert.equal(cardRank({ variant: "pick", market: "50+ receiving yards" }), "50+");
  assert.equal(cardRank({ variant: "pick", market: "Over 86.5 rushing yards" }), "86.5");
  assert.equal(cardRank({ variant: "pick", market: "Moneyline" }), "VQ");
});

test("market text and odds read cleanly on the card", () => {
  assert.equal(cleanMarket("FULL GAME TOTAL · 70+ total rushing yards · LEAN"), "70+ rushing yards · LEAN");
  assert.equal(cleanMarket("Full game · 4+ receptions"), "4+ receptions");
  assert.equal(odds(-150), "−150");
  assert.equal(odds(107), "+107");
  assert.equal(odds(null), null);
  assert.equal(odds(50), null);
});

test("text wraps to width and truncates past the line limit", () => {
  const measure = (s: string) => s.length * 10;
  assert.deepEqual(wrapText(measure, "one two three four", 90), ["one two", "three", "four"]);
  assert.deepEqual(wrapText(measure, "one two three four", 90, 2), ["one two", "three…"]);
});

test("leg rows shrink so ten legs fit one card", () => {
  assert.equal(legLayout(3, 900).row, 116);
  assert.ok(legLayout(10, 700).row * 10 <= 700);
});

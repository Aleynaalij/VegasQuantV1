import test from "node:test";
import assert from "node:assert/strict";
import { communityParlayCards } from "../src/lib/community-parlay";
test("large community parlays keep every leg in readable branded pages", () => {
  const lines = Array.from({length:16}, (_, i) => `Player ${i} 40+ rushing yards`);
  const cards = communityParlayCards("My parlay", lines, "Member", "2026-10-17T00:00:00Z");
  assert.deepEqual(cards.map(c => c.legs!.length), [6,6,4]);
  assert.deepEqual(cards.flatMap(c => c.legs!.map(l => `${l.name} ${l.market}`)), lines);
  assert.ok(cards.every(c => c.variant === "parlay" && /not a Vegas Quant recommendation/.test(c.footnote!)));
  assert.equal(cards[2].matchup, "@Member · 16 legs · Card 3 of 3");
});

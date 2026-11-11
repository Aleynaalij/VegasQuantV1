import test from "node:test";
import assert from "node:assert/strict";
import { communityParlayCard } from "../src/lib/community-parlay";

test("seven- and twelve-leg community parlays keep every selection on one card", () => {
  for (const count of [7, 12]) {
    const lines = Array.from({ length: count }, (_, i) => `Player ${i} 40+ rushing yards`);
    const card = communityParlayCard("My parlay", lines, "Member", "2026-10-17T00:00:00Z");
    assert.deepEqual(card.legs!.map((leg) => `${leg.name} ${leg.market}`), lines);
    assert.equal(card.variant, "parlay");
    assert.match(card.footnote!, /not a Vegas Quant recommendation/);
    assert.equal(card.matchup, `@Member · ${count} legs`);
    assert.equal(card.paletteKey, "Member:2026-10-17T00:00:00Z");
  }
});

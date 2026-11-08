import test from "node:test";
import assert from "node:assert/strict";
import { cardRank, casinoCardTheme, cleanMarket, odds, wrapText } from "../src/lib/casino-card";

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

test("card identities deal all three palettes and stay stable across renderers", () => {
  const cards = Array.from({ length: 12 }, (_, i) => ({
    variant: "parlay" as const, title: "Fixture", eyebrow: "Test", publishedAt: "", paletteKey: String(i),
  }));
  assert.deepEqual(new Set(cards.map((card) => casinoCardTheme(card).name)), new Set(["green", "gold", "black"]));
  assert.deepEqual(casinoCardTheme(cards[0]), casinoCardTheme({ ...cards[0], title: "Edited" }));
});

test("tall twelve-leg image export retains every team instead of dropping the last rows", async () => {
  const { drawCasinoCard } = await import("../src/lib/casino-card");
  const { weekendMoneylineCard: card } = await import("../src/lib/weekend-moneyline-card");
  const drawn: { text: string; y: number }[] = [];
  const canvas = { height: 1512 };
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({
    measureText: (text: string) => ({ width: text.length * 15 }),
    canvas,
    fillText: (text: string, _x: number, y: number) => drawn.push({ text, y }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
  }, { get: (target, key) => (target as Record<PropertyKey, unknown>)[key] ?? (() => {}) }) as unknown as CanvasRenderingContext2D;
  drawCasinoCard(ctx, {
    variant: "parlay", eyebrow: "12-leg moneyline · Sunday predictions",
    title: card.title, matchup: "October 18 · Every Sunday matchup", publishedAt: card.preparedAt,
    legs: card.legs.map(l => ({ name: l.name, market: "Moneyline", note: l.matchup })),
    footnote: "One-time analyst predictions · No validated edge claimed. Every leg must win.",
  }, { display: "Arial", body: "Arial" });
  for (const leg of card.legs) {
    const row = drawn.find((entry) => entry.text === leg.name);
    assert.ok(row && row.y < canvas.height - 250, `${leg.name} must fit above the footer`);
  }
  assert.ok(canvas.height > 1512);
});

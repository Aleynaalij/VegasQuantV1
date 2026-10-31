import test from "node:test";
import assert from "node:assert/strict";
import {
  beats,
  bestPrice,
  bookQuotes,
  decimalOdds,
  playerKey,
  selectionKey,
  type QuoteRow,
} from "../src/lib/best-price";

const NOW = Date.parse("2026-11-01T18:00:00Z");
const HOUR = 3600000;
const row = (
  book: string,
  market: string,
  outcomes: unknown[],
  minutesAgo = 10,
  game = "g1",
): QuoteRow => ({
  game_id: game,
  observed_at: new Date(NOW - minutesAgo * 60000).toISOString(),
  payload: { book, market, outcomes: outcomes as never },
});

test("the bigger payout wins on decimal odds, ties go to book order", () => {
  assert.ok(decimalOdds(+120) > decimalOdds(-110));
  assert.ok(decimalOdds(-105) > decimalOdds(-110));
  const q = bookQuotes(
    [
      row("FanDuel", "h2h", [{ name: "Boston Celtics", price: -150 }]),
      row("DraftKings", "h2h", [{ name: "Boston Celtics", price: -140 }]),
      row("BetMGM", "h2h", [{ name: "Boston Celtics", price: -140 }]),
    ],
    NOW,
    2 * HOUR,
  );
  const b = bestPrice(
    q,
    selectionKey("g1", "h2h", "", "Boston Celtics", null),
  )!;
  assert.equal(b.best.book, "DraftKings");
  assert.equal(b.best.price, -140);
  assert.equal(b.books, 3);
});

test("only the identical line competes: a different point is a different bet", () => {
  const q = bookQuotes(
    [
      row("FanDuel", "player_points", [
        { name: "Over", point: 23.5, price: -110, description: "Kevin Durant" },
      ]),
      row("DraftKings", "player_points", [
        { name: "Over", point: 22.5, price: +100, description: "Kevin Durant" },
      ]),
      row("Caesars", "player_points_alternate", [
        { name: "Over", point: 23.5, price: -102, description: "kevin durant" },
      ]),
    ],
    NOW,
    2 * HOUR,
  );
  const b = bestPrice(
    q,
    selectionKey("g1", "player_points", "Kevin Durant", "Over", 23.5),
  )!;
  assert.equal(b.best.book, "Caesars");
  assert.equal(b.books, 2);
});

test("stale, undated, future or unknown-book quotes never compete; one book alone is not a comparison", () => {
  const rows = [
    row("FanDuel", "h2h", [{ name: "A", price: -110 }]),
    row("DraftKings", "h2h", [{ name: "A", price: +500 }], 300),
    row("BetMGM", "h2h", [{ name: "A", price: +400 }], -30),
    row("SketchyBook", "h2h", [{ name: "A", price: +900 }]),
    {
      game_id: "g1",
      observed_at: null,
      payload: {
        book: "Caesars",
        market: "h2h",
        outcomes: [{ name: "A", price: +700 }],
      },
    },
  ];
  assert.equal(
    bestPrice(
      bookQuotes(rows, NOW, 2 * HOUR),
      selectionKey("g1", "h2h", "", "A", null),
    ),
    null,
  );
});

test("each book counts once, at its newest quote", () => {
  const q = bookQuotes(
    [
      row("FanDuel", "h2h", [{ name: "A", price: +200 }], 50),
      row("FanDuel", "h2h", [{ name: "A", price: -120 }], 5),
      row("DraftKings", "h2h", [{ name: "A", price: -125 }], 5),
    ],
    NOW,
    2 * HOUR,
  );
  const b = bestPrice(q, selectionKey("g1", "h2h", "", "A", null))!;
  assert.equal(b.best.book, "FanDuel");
  assert.equal(b.best.price, -120);
});

test("player names match across punctuation and suffixes only", () => {
  assert.equal(playerKey("Jabari Smith Jr."), playerKey("jabari smith"));
  assert.equal(playerKey("D'Andre Swift"), playerKey("DAndre Swift"));
  assert.notEqual(playerKey("Josh Allen"), playerKey("Josh Allen Smith"));
});

test("beats only names a book that pays more than the price shown", () => {
  const q = bookQuotes(
    [
      row("FanDuel", "totals", [{ name: "Over", point: 220.5, price: -110 }]),
      row("BetMGM", "totals", [{ name: "Over", point: 220.5, price: -105 }]),
    ],
    NOW,
    2 * HOUR,
  );
  const key = selectionKey("g1", "totals", "", "Over", 220.5);
  assert.equal(beats(q, key, -110)?.book, "BetMGM");
  assert.equal(beats(q, key, -105), null);
  assert.equal(beats(q, key, null), null);
});

import test from "node:test";
import assert from "node:assert/strict";
import { moneylineRead, propLine } from "../src/lib/home-props";

test("prop targets read as the line a book would show", () => {
  assert.deepEqual(propLine("Full game · 60+ receiving yards"), {
    direction: "Over",
    line: 59.5,
    stat: "REC YDS",
  });
  assert.deepEqual(propLine("Full game · 250+ passing yards"), {
    direction: "Over",
    line: 249.5,
    stat: "PASS YDS",
  });
  assert.deepEqual(propLine("Under 24.5 rushing yards"), {
    direction: "Under",
    line: 24.5,
    stat: "RUSH YDS",
  });
  assert.deepEqual(propLine("Player Prop", "Sample Player 5+ receptions"), {
    direction: "Over",
    line: 4.5,
    stat: "RECS",
  });
  assert.deepEqual(propLine("Anytime touchdown"), {
    direction: "Over",
    line: 0.5,
    stat: "ANY TD",
  });
  assert.equal(propLine("Moneyline"), null);
  assert.equal(propLine("1st quarter · spread"), null);
});

test("moneyline read removes the vig and matches teams by name", () => {
  const r = moneylineRead(
    [
      { name: "Atlanta Falcons", price: 146 },
      { name: "Cincinnati Bengals", price: -174 },
    ],
    "Cincinnati Bengals",
    "Atlanta Falcons",
  )!;
  assert.equal(r.home.price, -174);
  assert.ok(Math.abs(r.home.probability + r.away.probability - 1) < 1e-9);
  assert.equal(Math.round(r.home.probability * 100), 61);
  assert.equal(
    moneylineRead([{ name: "Atlanta Falcons", price: 146 }], "Cincinnati Bengals", "Atlanta Falcons"),
    null,
  );
  assert.equal(
    moneylineRead(
      [
        { name: "Atlanta Falcons", price: 146 },
        { name: "Someone Else", price: -174 },
      ],
      "Cincinnati Bengals",
      "Atlanta Falcons",
    ),
    null,
  );
  assert.equal(
    moneylineRead(
      [
        { name: "Atlanta Falcons", price: 50 },
        { name: "Cincinnati Bengals", price: -174 },
      ],
      "Cincinnati Bengals",
      "Atlanta Falcons",
    ),
    null,
  );
});

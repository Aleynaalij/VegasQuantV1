import assert from "node:assert/strict";
import test from "node:test";
import { lineMoves, signed } from "../src/lib/nba-line-moves";

const snap = (
  at: string,
  outcomes: [string, string, number, number][],
  book = "FanDuel",
  market = "player_points",
) => ({
  recorded_at: at,
  observed_at: at,
  payload: {
    book,
    market,
    outcomes: outcomes.map(([name, description, point, price]) => ({
      name,
      description,
      point,
      price,
    })),
  },
});

test("open, now, delta and each change for a player's main line", () => {
  const moves = lineMoves([
    snap("2026-11-20T15:00:00Z", [
      ["Over", "Jalen Brunson", 25.5, -110],
      ["Under", "Jalen Brunson", 25.5, -110],
    ]),
    snap("2026-11-20T16:00:00Z", [
      ["Over", "Jalen Brunson", 25.5, -110],
      ["Under", "Jalen Brunson", 25.5, -110],
    ]),
    snap("2026-11-20T18:00:00Z", [
      ["Over", "Jalen Brunson", 26.5, -112],
      ["Under", "Jalen Brunson", 26.5, -108],
    ]),
    snap("2026-11-20T21:00:00Z", [
      ["Over", "Jalen Brunson", 26.5, -120],
      ["Under", "Jalen Brunson", 26.5, 100],
    ]),
  ]);
  const m = moves.get("player_points|Jalen Brunson");
  assert.ok(m);
  assert.equal(m.open.line, 25.5);
  assert.equal(m.now.line, 26.5);
  assert.equal(m.now.over, -120);
  assert.equal(m.delta, 1);
  assert.equal(m.steps.length, 3, "an unchanged snapshot adds no step");
  assert.equal(m.open.at, "2026-11-20T15:00:00Z");
});

test("other books, markets and malformed outcomes are ignored; snapshots sorted by time", () => {
  const moves = lineMoves([
    snap(
      "2026-11-20T18:00:00Z",
      [
        ["Over", "Rudy Gobert", 11.5, -105],
        ["Under", "Rudy Gobert", 11.5, -115],
      ],
      "FanDuel",
      "player_rebounds",
    ),
    snap(
      "2026-11-20T15:00:00Z",
      [
        ["Over", "Rudy Gobert", 12.5, -110],
        ["Under", "Rudy Gobert", 12.5, -110],
      ],
      "FanDuel",
      "player_rebounds",
    ),
    snap(
      "2026-11-20T15:30:00Z",
      [
        ["Over", "Rudy Gobert", 9.5, -110],
        ["Under", "Rudy Gobert", 9.5, -110],
      ],
      "DraftKings",
      "player_rebounds",
    ),
    snap(
      "2026-11-20T15:30:00Z",
      [["Over", "Rudy Gobert", 1.5, -110]],
      "FanDuel",
      "player_assists",
    ),
    snap(
      "2026-11-20T16:00:00Z",
      [
        ["Over", "Rudy Gobert", 12, -110],
        ["Under", "Rudy Gobert", 12, -110],
      ],
      "FanDuel",
      "player_rebounds",
    ),
  ]);
  assert.deepEqual([...moves.keys()], ["player_rebounds|Rudy Gobert"]);
  const m = moves.get("player_rebounds|Rudy Gobert")!;
  assert.deepEqual(
    m.steps.map((p) => p.line),
    [12.5, 11.5],
  );
  assert.equal(m.delta, -1);
});

test("with alternate lines, the main line is the most balanced two-sided one", () => {
  const moves = lineMoves([
    snap("2026-11-20T15:00:00Z", [
      ["Over", "Ja Morant", 20.5, -250],
      ["Under", "Ja Morant", 20.5, 190],
      ["Over", "Ja Morant", 22.5, -112],
      ["Under", "Ja Morant", 22.5, -108],
      ["Over", "Ja Morant", 24.5, 140],
    ]),
  ]);
  assert.equal(moves.get("player_points|Ja Morant")!.now.line, 22.5);
});

test("signed", () => {
  assert.deepEqual([signed(1), signed(-0.5), signed(0)], ["+1", "-0.5", "0"]);
});

import test from "node:test";
import assert from "node:assert/strict";
import { emptyDesk, type Desk, type Pick, type Result } from "../src/lib/domain";
import { performance, sportPicks, wilson } from "../src/lib/performance";

const pick = (id: string, game_id = "g1") => ({ id, game_id, stake_cents: 1000, market: "Side" }) as unknown as Pick;
const result = (pick_id: string, r: Result["result"], at: string, profit = r === "WIN" ? 909 : r === "LOSS" ? -1000 : 0) =>
  ({ id: `r-${pick_id}`, pick_id, result: r, created_at: at, profit_cents: profit }) as Result;

test("wilson gives an honest 95% range that narrows with sample size", () => {
  assert.equal(wilson(0, 0), null);
  const small = wilson(3, 4)!, big = wilson(300, 400)!;
  assert.ok(small[0] < 35 && small[1] > 95, `small ${small}`);
  assert.ok(big[0] > 70 && big[1] < 80, `big ${big}`);
});

test("streaks skip pushes and voids; grade lag is the median hours after kickoff", () => {
  const order = ["WIN", "LOSS", "PUSH", "LOSS", "LOSS", "WIN", "WIN", "VOID", "WIN", "LOSS"] as const;
  const picks = order.map((_, i) => pick(`p${i}`));
  const d: Desk = {
    ...emptyDesk,
    games: [{ id: "g1", kickoff: "2026-10-11T17:00:00Z" } as Desk["games"][number]],
    picks,
    results: order.map((r, i) => result(`p${i}`, r, new Date(Date.parse("2026-10-11T20:00:00Z") + i * 3600000).toISOString())),
  };
  const m = performance(d);
  assert.deepEqual(m.streaks, { longestWin: 3, longestLoss: 3, current: { result: "LOSS", length: 1 } });
  assert.equal(m.gradeLagHours, 7.5); // results 3h…12h after kickoff
  assert.ok(m.winRange && m.winRange[0] < 50 && m.winRange[1] > 50);
});

test("sportPicks treats games without a sport as NFL", () => {
  const d: Desk = { ...emptyDesk, games: [{ id: "a" }, { id: "b", sport: "nba" }] as Desk["games"] };
  const picks = [pick("x", "a"), pick("y", "b")];
  assert.deepEqual(sportPicks(d, picks, "nfl").map((p) => p.id), ["x"]);
  assert.deepEqual(sportPicks(d, picks, "nba").map((p) => p.id), ["y"]);
});

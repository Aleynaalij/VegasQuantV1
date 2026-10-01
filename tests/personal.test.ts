import test from "node:test";
import assert from "node:assert/strict";
import { personalTotals, entryBalances, type PersonalEntry } from "../src/lib/personal";
const e: PersonalEntry = {
  id: "a",
  pick_id: "p",
  line: 22.5,
  odds: -114,
  stake_cents: 2000,
  payout_cents: 3754,
  book: "FanDuel",
  placed_at: "2026-09-30T22:40:00Z",
  created_at: "2026-09-30T22:40:00Z",
};
test("in-play funds are reserved, never counted as winnings", () => {
  const t = personalTotals(2000, [e], []);
  assert.equal(t.balance, 2000);
  assert.equal(t.available, 0);
  assert.equal(t.inPlay, 2000);
  assert.equal(t.ifWin, 3754);
});
test("win uses the actual recorded payout and is counted once", () => {
  const t = personalTotals(
    2000,
    [e],
    [{ entry_id: "a", result: "WIN", profit_cents: 1754 }],
  );
  assert.equal(t.balance, 3754);
  assert.equal(t.inPlay, 0);
  assert.equal(t.wins, 1);
});
test("loss, push and void preserve correct cash balances", () => {
  for (const result of ["LOSS", "PUSH", "VOID"] as const) {
    const t = personalTotals(
      2000,
      [e],
      [{ entry_id: "a", result, profit_cents: result === "LOSS" ? -2000 : 0 }],
    );
    assert.equal(t.balance, result === "LOSS" ? 0 : 2000);
    assert.equal(t.available, t.balance);
  }
});
test("one challenge never incorporates unrelated settlements", () => {
  const t = personalTotals(
    2000,
    [e],
    [{ entry_id: "other", result: "WIN", profit_cents: 9000 }],
  );
  assert.equal(t.balance, 2000);
  assert.equal(t.wins, 0);
});

test("custom bankroll carries unspent money through each actual entry",()=>{
 assert.deepEqual(entryBalances(5000,2000,3754),{win:6754,loss:3000,push:5000,profit:1754});
 assert.deepEqual(entryBalances(6754,1000,2500),{win:8254,loss:5754,push:6754,profit:1500});
 assert.equal(entryBalances(2000,5000,10000),null);
 assert.equal(entryBalances(5000,0,0),null);
 assert.equal(entryBalances(NaN,1000,2000),null);
});

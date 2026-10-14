import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeTails } from "../src/lib/tail-record";
test("personal record retains losses and separates unsettled and unavailable publications", () => {
  assert.deepEqual(
    summarizeTails([
      { publication: { result: "WIN" } },
      { publication: { result: "LOSS" } },
      { publication: { result: "PUSH" } },
      { publication: { result: "VOID" } },
      { publication: { result: null } },
      {},
    ]),
    { wins: 1, losses: 1, pushes: 1, voids: 1, pending: 2 },
  );
});
test("empty records do not inherit public wins or invent profit", () => {
  assert.deepEqual(summarizeTails([]), {
    wins: 0,
    losses: 0,
    pushes: 0,
    voids: 0,
    pending: 0,
  });
});

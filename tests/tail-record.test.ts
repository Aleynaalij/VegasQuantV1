import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeTails } from "../src/lib/tail-record";
test("personal record retains losses and separates unsettled and unavailable publications", () => {
  assert.deepEqual(
    summarizeTails([
      {
        publication: {
          result: "WIN",
          result_source: "https://example.com/result",
        },
      },
      {
        publication: {
          result: "LOSS",
          result_source: "https://example.com/result",
        },
      },
      {
        publication: {
          result: "PUSH",
          result_source: "https://example.com/result",
        },
      },
      {
        publication: {
          result: "VOID",
          result_source: "https://example.com/result",
        },
      },
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

test("unsourced, unsafe and unknown outcomes remain pending", () => {
  assert.equal(
    summarizeTails([
      { publication: { result: "WIN" } },
      { publication: { result: "LOSS", result_source: "javascript:alert(1)" } },
      {
        publication: {
          result: "unexpected",
          result_source: "https://example.com",
        },
      },
    ]).pending,
    3,
  );
});

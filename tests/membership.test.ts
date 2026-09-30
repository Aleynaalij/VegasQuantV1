import test from "node:test";
import assert from "node:assert/strict";
import { passQuote, roundEnds } from "../src/lib/membership";
test("full season includes Super Bowl and does not recur", () => {
  const q = passQuote("full", Date.parse("2026-09-30T12:00:00Z"))!;
  assert.equal(q.amount, 1000);
  assert.equal(q.expires_at, "2027-02-16T12:00:00.000Z");
});
test("half access with 16 rounds left covers the next 8", () => {
  const now = roundEnds[5];
  const q = passQuote("half", now)!;
  assert.equal(q.remaining, 16);
  assert.equal(q.covered, 8);
  assert.equal(q.amount, 700);
  assert.equal(q.expires_at, new Date(roundEnds[13]).toISOString());
});
test("odd remaining rounds round up; expired rounds do not count", () => {
  const q = passQuote("half", Date.parse("2026-09-30T12:00:00Z"))!;
  assert.equal(q.remaining, 19);
  assert.equal(q.covered, 10);
  assert.equal(q.expires_at, "2026-12-08T12:00:00.000Z");
});
test("no checkout after season expires", () =>
  assert.equal(passQuote("full", roundEnds.at(-1)), null));

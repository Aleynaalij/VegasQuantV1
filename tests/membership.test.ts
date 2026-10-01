import test from "node:test";
import assert from "node:assert/strict";
import { passQuote, seasonEnd } from "../src/lib/membership";
test("season is one-time $20 including Super Bowl", () => {
  const q = passQuote("full", Date.parse("2026-10-01"))!;
  assert.equal(q.amount, 2000);
  assert.equal(q.recurring, false);
  assert.equal(q.expires_at, "2027-02-16T12:00:00.000Z");
});
test("monthly is $5 with no invented paid-through date", () => {
  const q = passQuote("monthly")!;
  assert.equal(q.amount, 500);
  assert.equal(q.recurring, true);
  assert.equal(q.expires_at, null);
});
test("expired season unavailable but monthly remains available", () => {
  assert.equal(passQuote("full", seasonEnd), null);
  assert.equal(passQuote("monthly", seasonEnd)!.amount, 500);
});

import test from "node:test";
import assert from "node:assert/strict";
import { citeIntent, recordLine } from "../src/lib/ask-cite";

test("rule questions cite a real Bible rule", () => {
  assert.deepEqual(citeIntent("What is R-12?"), { kind: "rule", id: "R-12" });
  assert.deepEqual(citeIntent("explain rule 3"), { kind: "rule", id: "R-03" });
  assert.equal(citeIntent("what is rule 99"), null);
});

test("record and today's pick are factual intents; advice is not", () => {
  assert.deepEqual(citeIntent("What's your record?"), { kind: "record" });
  assert.deepEqual(citeIntent("what's the ROI"), { kind: "record" });
  assert.deepEqual(citeIntent("What is today's pick?"), { kind: "today-pick" });
  assert.equal(citeIntent("Should I bet today's pick?"), null);
  assert.equal(citeIntent("Will Puka hit 60 yards?"), null);
  assert.equal(citeIntent("how do I reset my password"), null);
});

test("recordLine summarizes settled results honestly", () => {
  const r = recordLine([
    { result: "WIN", profit_cents: 909, stake_cents: 1000 },
    { result: "LOSS", profit_cents: -1000, stake_cents: 1000 },
    { result: "PUSH", profit_cents: 0, stake_cents: 1000 },
    { result: "PENDING", profit_cents: null, stake_cents: 1000 },
  ]);
  assert.equal(r.text, "1–1–1 · −$0.91 net · -3.0% ROI across 3 settled decisions");
  assert.equal(r.pending, 1);
});

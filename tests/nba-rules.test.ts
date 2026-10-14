import { test } from "node:test";
import assert from "node:assert/strict";
import { bibleRules, citedRules, ruleGroups } from "../src/lib/nba-rules";

test("the rulebook has R-01 to R-40 in five groups of eight", () => {
  assert.equal(bibleRules.length, 40);
  bibleRules.forEach((rule, i) =>
    assert.equal(rule.id, `R-${String(i + 1).padStart(2, "0")}`),
  );
  for (const g of ruleGroups)
    assert.equal(bibleRules.filter((r) => r.group === g.id).length, 8);
});

test("cited rules are found in order, deduplicated, across fields", () => {
  const ids = citedRules(
    "PASS per R-20; price below R-07 threshold. See R-20 again.",
    null,
    "Graded at close (R-39).",
  ).map((r) => r.id);
  assert.deepEqual(ids, ["R-20", "R-07", "R-39"]);
});

test("unknown or malformed rule references are ignored", () => {
  assert.deepEqual(citedRules("R-41, R-00, R7, BR-12x, PR-1"), []);
});

test("stored rule ids win over text, invalid stored ids are dropped", async () => {
  const { pickRules } = await import("../src/lib/nba-rules");
  assert.deepEqual(pickRules(["R-20", "R-99"], "R-01").map((r) => r.id), ["R-20"]);
  assert.deepEqual(pickRules([], "Pass per R-20").map((r) => r.id), ["R-20"]);
  assert.deepEqual(pickRules(undefined, "nothing"), []);
});

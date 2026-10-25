import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
test("weekly sleeper exception is category-bound and keeps sourced evidence and normal gates", () => {
  const out = execFileSync(
    process.execPath,
    ["tests/sql/weekly-sleeper-category.mjs"],
    { encoding: "utf8", timeout: 60000 },
  );
  assert.match(out, /PASS weekly sleeper category/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
test("NBA records use current editorial publications and confirmed results", () => {
  const r = spawnSync(
    process.execPath,
    ["tests/sql/nba-editorial-records.mjs"],
    { encoding: "utf8", timeout: 60000 },
  );
  assert.equal(r.status, 0, r.error?.message || r.stderr || r.stdout);
});

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
test("NBA editorial journal and ONE Zone publication are one guarded transaction", () => {
  const r = spawnSync(process.execPath, ["tests/sql/nba-editorial-zone.mjs"], {
    encoding: "utf8",
    timeout: 60000,
  });
  assert.equal(r.status, 0, r.error?.message || r.stderr || r.stdout);
});

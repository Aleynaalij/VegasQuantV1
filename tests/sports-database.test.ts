import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
for (const script of ["sports-backend", "sports-nba-live"])
  test(`Multi-sport SQL contract: ${script}`, () => {
    const r = spawnSync(process.execPath, [`tests/sql/${script}.mjs`], {
      encoding: "utf8",
      timeout: 60000,
    });
    assert.equal(r.status, 0, r.error?.message || r.stderr || r.stdout);
  });

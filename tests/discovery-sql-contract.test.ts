import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test(
  "disposable SQL publication output preserves the discovery frontend contract",
  { timeout: 60000 },
  () => {
    // Existing source migration and assertions run in a new in-memory database.
    // No remote DB credentials or endpoints are used. The underlying harness stubs
    // auth/access helpers: this is NOT full deployed authorization acceptance.
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "tests/sql/zone-post-games.mjs"],
      {
        cwd: process.cwd(),
        env: { ...process.env, DISCOVERY_SQL_ADAPTER_CHECK: "true" },
        encoding: "utf8",
        timeout: 55000,
      },
    );
    assert.equal(result.error, undefined, String(result.error));
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Discovery SQL-to-adapter contract passed/);
    assert.match(result.stdout, /Zone post games SQL checks passed/);
  },
);

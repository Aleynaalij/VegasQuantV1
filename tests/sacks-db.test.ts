import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
test(
  "sack contracts and correction evidence preserve immutable results",
  { timeout: 30000 },
  async () => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [fileURLToPath(new URL("./sql/automatic-results.mjs", import.meta.url))],
      { cwd: fileURLToPath(new URL("../", import.meta.url)) },
    );
    assert.match(stdout, /Automatic result transaction/);
  },
);

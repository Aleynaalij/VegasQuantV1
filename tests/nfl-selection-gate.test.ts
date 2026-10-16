import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

test(
  "NFL database publication gate rejects missing evidence and policy bypasses",
  { timeout: 30000 },
  async () => {
    const { stdout } = await promisify(execFile)(process.execPath, [
      fileURLToPath(new URL("./sql/nfl-selection-gate.mjs", import.meta.url)),
    ]);
    assert.match(stdout, /30 NFL gate checks passed/);
  },
);

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("NBA grade input regressions execute through normal test discovery", () => {
  const env = { ...process.env };
  // Do not inherit the parent runner's IPC protocol in this independent runner.
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(
    process.execPath,
    [
      "--test",
      "--test-reporter=tap",
      fileURLToPath(
        new URL("./sql/nba-grade-input-validation.mjs", import.meta.url),
      ),
    ],
    { encoding: "utf8", timeout: 60000, env },
  );
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  assert.equal(result.status, 0, result.error?.message || output);
  // Seven SQL cases plus their parent must execute, with none skipped/cancelled.
  for (const summary of [
    "tests 8",
    "pass 8",
    "fail 0",
    "cancelled 0",
    "skipped 0",
    "todo 0",
  ])
    assert.match(output, new RegExp(`^# ${summary}$`, "m"), output);
});

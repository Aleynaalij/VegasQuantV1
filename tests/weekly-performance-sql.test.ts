import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("weekly performance SQL regressions execute through normal test discovery", () => {
  const env = { ...process.env };
  // A nested runner must start independently, not inherit the parent's IPC mode.
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(
    process.execPath,
    [
      "--test",
      "--test-reporter=tap",
      fileURLToPath(new URL("./sql/weekly-performance.mjs", import.meta.url)),
    ],
    { encoding: "utf8", timeout: 60000, env },
  );
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  assert.equal(result.status, 0, result.error?.message || output);
  // Four SQL cases plus their parent must execute, with none skipped or cancelled.
  for (const summary of [
    "tests 5",
    "pass 5",
    "fail 0",
    "cancelled 0",
    "skipped 0",
    "todo 0",
  ])
    assert.match(output, new RegExp(`^# ${summary}$`, "m"), output);
});

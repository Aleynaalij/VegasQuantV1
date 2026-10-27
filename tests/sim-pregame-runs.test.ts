import test from "node:test";
import { execFileSync } from "node:child_process";

test("simulator pregame capture journal is service-only, pre-kickoff, validated and append-only", () => {
  execFileSync(process.execPath, ["tests/sql/sim-pregame-runs.mjs"], {
    stdio: "pipe",
  });
});

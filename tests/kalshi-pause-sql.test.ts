import test from "node:test";
import { execFileSync } from "node:child_process";
test("Kalshi pause executes against composed migrations and rolls back safely", () => {
  execFileSync(process.execPath, ["tests/sql/kalshi-pause.mjs"], {
    stdio: "pipe",
    timeout: 60000,
  });
});

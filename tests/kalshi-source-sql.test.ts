import test from "node:test";
import { execFileSync } from "node:child_process";
test("incoming Kalshi source contracts execute through ordinary discovery", () => {
  execFileSync(process.execPath, ["tests/sql/ruby-kalshi-source.mjs"], {
    stdio: "pipe",
    timeout: 60000,
  });
});

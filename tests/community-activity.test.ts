import test from "node:test";
import { execFileSync } from "node:child_process";
test("Community activity respects profile visibility, blocks and exact post links", () => {
  execFileSync(process.execPath, ["tests/sql/community-activity.mjs"], { stdio: "pipe" });
});

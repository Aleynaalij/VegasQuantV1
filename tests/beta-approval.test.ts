import test from "node:test";
import { execFileSync } from "node:child_process";
test("closed beta approvals enforce database permissions and preserve onboarding", () => {
  execFileSync(process.execPath, ["tests/sql/beta-approval.mjs"], { encoding: "utf8" });
});

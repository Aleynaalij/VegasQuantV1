import test from "node:test";
import { execFileSync } from "node:child_process";
test("VIP lay comments follow the member comment rules", () => {
  execFileSync(process.execPath, ["tests/sql/ruby-card-comments.mjs"], { stdio: "pipe" });
});

import test from "node:test";
import { execFileSync } from "node:child_process";
test("VIP lay reactions follow the typed reaction contract and member gate", () => {
  execFileSync(process.execPath, ["tests/sql/ruby-card-reactions.mjs"], { stdio: "pipe" });
});

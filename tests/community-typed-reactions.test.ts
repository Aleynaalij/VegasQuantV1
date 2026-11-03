import test from "node:test";
import { execFileSync } from "node:child_process";
test("typed community reactions preserve access, atomicity and legacy heart contracts", () => {
  execFileSync(process.execPath, ["tests/sql/community-typed-reactions.mjs"], { stdio: "pipe" });
});

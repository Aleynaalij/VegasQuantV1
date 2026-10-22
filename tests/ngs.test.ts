import test from "node:test";
import { execFileSync } from "node:child_process";
test("NGS source validation and immutable member-only context", () => {
  execFileSync(
    "python3",
    ["-m", "unittest", "discover", "-s", "tests/ngs", "-v"],
    { encoding: "utf8" },
  );
  execFileSync(process.execPath, ["tests/sql/ngs-context.mjs"], {
    encoding: "utf8",
  });
});

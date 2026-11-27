import test from "node:test";
import { execFileSync } from "node:child_process";
test("Supabase starts the Prop Finder teaser every 20 minutes on NBA game days", () => {
  execFileSync(process.execPath, ["tests/sql/nba-teaser-dispatch.mjs"], {
    stdio: "pipe",
  });
});

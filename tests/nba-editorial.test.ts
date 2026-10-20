import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  nbaEditorialCopy,
  nbaEditorialOpen,
  type NbaEditorialPick,
} from "../src/lib/nba-editorial";
test("NBA editorial publication enforces evidence, exact quotes, pregame cutoff, immutability and member access", () => {
  execFileSync(process.execPath, ["tests/sql/nba-editorial.mjs"], {
    stdio: "pipe",
  });
});
test("NBA editorial copy preserves exact direction/line and closes with game state or supersession", () => {
  const p = {
    player: "Sample Player",
    market: "player_points",
    direction: "Under",
    line: 20.5,
    expires_at: "2026-10-20T19:00:00Z",
    game: {
      tipoff: "2026-10-20T19:00:00Z",
      status: "STATUS_SCHEDULED",
      tipoff_tbd: false,
    },
  } as NbaEditorialPick;
  assert.equal(nbaEditorialCopy(p), "Sample Player under 20.5 points");
  assert.equal(
    nbaEditorialOpen(p, Date.parse("2026-10-20T18:59:00Z"), false),
    true,
  );
  assert.equal(nbaEditorialOpen(p, Date.parse(p.expires_at), false), false);
  assert.equal(
    nbaEditorialOpen(p, Date.parse("2026-10-20T18:59:00Z"), true),
    false,
  );
  p.game!.status = "STATUS_IN_PROGRESS";
  assert.equal(
    nbaEditorialOpen(p, Date.parse("2026-10-20T18:59:00Z"), false),
    false,
  );
});

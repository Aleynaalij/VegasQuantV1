import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { contextBatch } from "../supabase/functions/sports-sync/context-schedule";
import type { SportPage } from "../src/lib/sport-contract";
const page: SportPage = JSON.parse(
  readFileSync("tests/fixtures/sports/nhl/page.json", "utf8"),
);
const now = Date.parse("2026-10-31T12:00:00Z");
const games = Array.from({ length: 12 }, (_, i) => ({
  ...page.games[0],
  id: String(i),
  start_time: new Date(now + (i + 1) * 3600000).toISOString(),
}));
test("unchanged successful context reads rotate independently of immutable fact timestamps", () => {
  const first = contextBatch(games, new Set(), [], now);
  assert.equal(first.length, 4);
  const attempts = first.map((g) => ({
    game_id: g.id,
    attempted_at: new Date(now).toISOString(),
    next_attempt_at: new Date(now + 6 * 3600000).toISOString(),
  }));
  const second = contextBatch(games, new Set(), attempts, now + 15 * 60000);
  assert.equal(second.length, 4);
  assert.ok(second.every((g) => !first.some((f) => f.id === g.id)));
  assert.equal(
    contextBatch(first, new Set(), attempts, now + 5 * 3600000).length,
    0,
  );
});
test("failed context reads back off and covered or closed games stay out", () => {
  const attempts = games.map((g) => ({
    game_id: g.id,
    attempted_at: new Date(now).toISOString(),
    next_attempt_at: new Date(now + 15 * 60000).toISOString(),
  }));
  assert.equal(
    contextBatch(games, new Set(), attempts, now + 14 * 60000).length,
    0,
  );
  assert.equal(
    contextBatch(games, new Set(), attempts, now + 15 * 60000).length,
    4,
  );
  // Saved team statistics must not hide a failed roster's now-due retry.
  assert.equal(
    contextBatch(
      games,
      new Set(games.map((g) => g.id)),
      attempts,
      now + 15 * 60000,
    ).length,
    4,
  );
  assert.equal(
    contextBatch(games, new Set(games.map((g) => g.id)), [], now).length,
    0,
  );
  assert.equal(
    contextBatch(
      games.map((g) => ({ ...g, status: "STATUS_POSTPONED" })),
      new Set(),
      [],
      now,
    ).length,
    0,
  );
});

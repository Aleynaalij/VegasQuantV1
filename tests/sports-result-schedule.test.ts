import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resultBatch } from "../supabase/functions/sports-results/schedule";
const now = Date.parse("2026-10-31T17:00:00Z");
const iso = (minutes: number) => new Date(now + minutes * 60000).toISOString();
test("24 unavailable summaries rotate behind untouched games without forging progress", () => {
  const games = Array.from({ length: 48 }, (_, i) => ({
    id: String(i).padStart(2, "0"),
  }));
  const first = resultBatch(games, [], [], now);
  assert.equal(first.length, 24);
  const attempts = first.map((g) => ({ game_id: g.id, attempted_at: iso(0) }));
  const second = resultBatch(games, [], attempts, now + 15 * 60000);
  assert.equal(second.length, 24);
  assert.ok(second.every((g) => !first.some((f) => f.id === g.id)));
  assert.deepEqual(resultBatch(first, [], attempts, now + 14 * 60000), []);
  assert.equal(resultBatch(first, [], attempts, now + 15 * 60000).length, 24);
});
test("successful reads and failed attempts both retain the status-specific backoff", () => {
  const games = [{ id: "confirmed" }, { id: "pending" }, { id: "retry" }];
  const progress = [
    { game_id: "confirmed", status: "FINAL", checked_at: iso(-359) },
    { game_id: "pending", status: "CONFIRMING", checked_at: iso(-14) },
  ];
  const attempts = [{ game_id: "retry", attempted_at: iso(-14) }];
  assert.deepEqual(resultBatch(games, progress, attempts, now), []);
  assert.deepEqual(
    resultBatch(games, progress, attempts, now + 60000).map((g) => g.id),
    ["confirmed", "pending", "retry"],
  );
  // A new failed recheck of a confirmed result does not accelerate its six-hour cadence.
  assert.deepEqual(
    resultBatch(
      [games[0]],
      progress,
      [{ game_id: "confirmed", attempted_at: iso(-1) }],
      now,
    ),
    [],
  );
});
test("result attempt scheduling is service-only and separate from result evidence", () => {
  const r = spawnSync(
    process.execPath,
    ["tests/sql/sports-result-attempts.mjs"],
    { encoding: "utf8", timeout: 60000 },
  );
  assert.equal(r.status, 0, r.error?.message || r.stderr || r.stdout);
});

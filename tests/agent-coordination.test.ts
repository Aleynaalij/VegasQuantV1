import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateBoard, renderBoard } from "../scripts/agents/validate.mjs";
const url = "https://github.com/Aleynaalij/VegasQuantV1/issues/65";
const task = (id = "ONE-001", owner = "CODEX", files = ["src/one.ts"]) => ({
  id,
  owner,
  files,
  scope: "application",
  status: "review",
  updated_at: "2026-10-17T15:56:00Z",
  next_action: "Peer review",
  depends_on: [],
  handoff: { to: owner === "CODEX" ? "CLAUDE" : "CODEX", url },
  acknowledgment: null,
  checks: [],
});
const board = (...tasks: unknown[]) => ({ version: 1, tasks });
test("current board is valid and rendered summary matches the checked-in page", () => {
  const b = JSON.parse(readFileSync("docs/agents/tasks.json", "utf8"));
  assert.deepEqual(validateBoard(b), []);
  assert.equal(renderBoard(b), readFileSync("docs/agents/TASKS.md", "utf8"));
});
test("review can await ACK, but ready needs a receiving peer and passing check evidence", () => {
  const t: any = task();
  assert.deepEqual(validateBoard(board(t)), []);
  t.status = "ready";
  assert.ok(
    validateBoard(board(t)).some((e: string) => e.includes("acknowledgment")),
  );
  t.acknowledgment = { by: "CLAUDE", url };
  t.checks = [{ outcome: "passed", evidence: url }];
  assert.deepEqual(validateBoard(board(t)), []);
  t.acknowledgment.by = "CODEX";
  assert.ok(validateBoard(board(t)).length);
});
test("unmet dependencies and cycles cannot be declared ready", () => {
  const a: any = task(),
    b: any = task("TWO-002", "CLAUDE", ["src/two.ts"]);
  a.status = "ready";
  a.acknowledgment = { by: "CLAUDE", url };
  a.checks = [{ outcome: "passed", evidence: url }];
  a.depends_on = [{ task: b.id, required: "merged" }];
  assert.ok(
    validateBoard(board(a, b)).some((e: string) =>
      e.includes("has not reached"),
    ),
  );
  b.depends_on = [{ task: a.id, required: "verified" }];
  assert.ok(
    validateBoard(board(a, b)).some((e: string) => e.includes("cycle")),
  );
});
test("production cannot be called complete and verified requires deployment plus timed live evidence", () => {
  const t: any = task();
  t.status = "complete";
  t.completion_evidence = url;
  assert.ok(validateBoard(board(t)).length);
  t.status = "verified";
  t.acknowledgment = { by: "CLAUDE", url };
  t.checks = [{ outcome: "passed", evidence: url }];
  t.merged_commit = "a".repeat(40);
  t.deployment_url = url;
  assert.ok(
    validateBoard(board(t)).some((e: string) =>
      e.includes("live verification"),
    ),
  );
  t.live_verification = {
    at: "2026-10-17T16:00:00Z",
    result: "passed",
    evidence: url,
  };
  assert.deepEqual(validateBoard(board(t)), []);
});
test("cross-owner file and directory claims conflict while documentation-only closure needs evidence", () => {
  assert.ok(
    validateBoard(board(task(), task("TWO-002", "CLAUDE", ["src/**"]))).some(
      (e: string) => e.includes("overlapping"),
    ),
  );
  const t: any = task();
  t.scope = "documentation";
  t.status = "complete";
  assert.ok(validateBoard(board(t)).length);
  t.completion_evidence = url;
  assert.deepEqual(validateBoard(board(t)), []);
});
test("unknown owners, duplicate IDs, invalid references and missing blockers are rejected", () => {
  const t: any = task();
  t.owner = "GUESS";
  t.status = "blocked";
  t.depends_on = [{ task: "MISSING-003", required: "merged" }];
  const errors = validateBoard(board(t, t));
  assert.ok(errors.some((e: string) => e.includes("owner")));
  assert.ok(errors.some((e: string) => e.includes("unique")));
  assert.ok(errors.some((e: string) => e.includes("reason")));
  assert.ok(errors.some((e: string) => e.includes("dependency")));
});

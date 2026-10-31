import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { feedbackState, emptyFeedback } from "../src/lib/frank-nhl-feedback";
test("feedback client rejects malformed response bodies and preserves plain text", () => {
  for (const value of [
    null,
    [],
    { state: "submitted" },
    { state: "submitted", answers: emptyFeedback(), submitted_at: "bad" },
  ])
    assert.equal(feedbackState(value).state, "hidden");
  const answers = { ...emptyFeedback(), notes: "<script>plain text</script>" };
  const state = feedbackState({
    state: "submitted",
    answers,
    submitted_at: "2026-10-31T18:00:00Z",
  });
  assert.equal(state.state, "submitted");
  if (state.state === "submitted")
    assert.equal(state.answers.notes, answers.notes);
  assert.equal(
    feedbackState({
      state: "submitted",
      answers: { ...answers, notes: "x".repeat(3001) },
      submitted_at: "2026-10-31T18:00:00Z",
    }).state,
    "hidden",
  );
});
test("Frank NHL feedback enforces recipient, privacy, validation and idempotent storage", () => {
  const r = spawnSync(process.execPath, ["tests/sql/frank-nhl-feedback.mjs"], {
    encoding: "utf8",
    timeout: 60000,
  });
  assert.equal(r.status, 0, r.error?.message || r.stderr || r.stdout);
});

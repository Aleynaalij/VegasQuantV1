import assert from "node:assert/strict";
import test from "node:test";
import { assessPublication } from "../src/lib/nba-publication-intelligence";

const slate = "2026-11-16";
const now = new Date("2026-11-16T15:36:00Z");
const run = {
  startedAt: slate + "T15:20:01Z",
  completedAt: slate + "T15:20:09Z",
  status: "succeeded",
};
const post = {
  id: "00000000-0000-4000-8000-000000000301",
  publishedAt: slate + "T15:20:07Z",
  dealer: true,
  contentMatches: true,
};
const journal = {
  slate,
  status: "POSTED",
  postId: post.id,
  observedAt: slate + "T15:20:08Z",
};
const base = {
  slate,
  checkedAt: now.toISOString(),
  eligibleGames: 4,
  scheduleFeedAt: slate + "T15:30:00Z",
  schedule: { active: true, expression: "20 14,15 * * *", timezone: "GMT" },
  runs: [run],
  journal: null,
  posts: [],
};
const assess = (changes: Record<string, unknown> = {}) =>
  assessPublication({ ...base, ...changes }, now, "fixture");
const flags = (changes?: Record<string, unknown>) =>
  assess(changes).incidents.map((i) => i.classification);

test("live contract preserves five publication classifications", () => {
  assert.equal(assess({ journal, posts: [post] }).status, "PUBLISHED");
  assert.equal(
    assess({ journal: { ...journal, status: "WAITING", postId: null } }).status,
    "WAITING",
  );
  assert.equal(
    assess({ journal: { ...journal, status: "SKIPPED", postId: null } }).status,
    "SKIPPED",
  );
  assert.equal(assess({ eligibleGames: 0 }).status, "NO_ELIGIBLE_SLATE");
  assert.equal(assess().status, "EVIDENCE_UNAVAILABLE");
});

test("scheduler success and overdue missing evidence are separate from confirmed publisher failure", () => {
  assert.deepEqual(flags(), ["scheduler_without_post", "overdue"]);
  assert.ok(
    flags({ journal: { ...journal, status: "FAILED", postId: null } }).includes(
      "publisher_failure",
    ),
  );
  assert.deepEqual(flags({ eligibleGames: 0 }), []);
  assert.ok(!flags({ scheduleFeedAt: null }).includes("overdue"));
  assert.ok(
    !flags({ checkedAt: slate + "T15:30:00Z" }).includes("publisher_failure"),
  );
});

test("rejects duplicates, wrong-day runs, spoofed authors and mismatched cards", () => {
  assert.ok(flags({ runs: [run, run] }).includes("inconsistent_records"));
  assert.ok(
    flags({ runs: [{ ...run, startedAt: "2026-11-17T15:20:00Z" }] }).includes(
      "inconsistent_records",
    ),
  );
  assert.ok(
    flags({ journal, posts: [post, post] }).includes("inconsistent_records"),
  );
  assert.ok(
    flags({ journal, posts: [{ ...post, dealer: false }] }).includes(
      "journal_mismatch",
    ),
  );
  assert.ok(
    flags({ journal, posts: [{ ...post, contentMatches: false }] }).includes(
      "journal_mismatch",
    ),
  );
  assert.equal(
    assess({ journal, posts: [post], schedule: null }).status,
    "PUBLISHED",
  );
  assert.equal(
    assessPublication(null, now, "read-only source").status,
    "EVIDENCE_UNAVAILABLE",
  );
});

test("UTC attempts retain their Eastern slate on DST transition days and across UTC midnight", () => {
  for (const [day, checkedAt] of [
    ["2026-03-08", "2026-03-08T13:55:00Z"],
    ["2026-11-01", "2026-11-01T13:55:00Z"],
  ]) {
    const report = assessPublication(
      { ...base, slate: day, checkedAt, scheduleFeedAt: checkedAt, runs: [] },
      new Date(checkedAt),
      "fixture",
    );
    assert.equal(report.status, "WAITING");
    assert.equal(report.evidence.attempts[0], day + "T14:20:00Z");
  }
  const checkedAt = "2026-11-17T03:00:00Z";
  assert.equal(
    assessPublication(
      { ...base, checkedAt, scheduleFeedAt: checkedAt },
      new Date(checkedAt),
      "fixture",
    ).slate,
    slate,
  );
});

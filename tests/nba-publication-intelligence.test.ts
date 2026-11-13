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
const slateCoverage = {
  slate,
  evaluatedAt: slate + "T15:31:00Z",
  complete: true,
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
  assert.equal(
    assess({ eligibleGames: 0, slateCoverage }).status,
    "NO_ELIGIBLE_SLATE",
  );
  assert.equal(assess().status, "EVIDENCE_UNAVAILABLE");
});

test("scheduler success and overdue missing evidence are separate from confirmed publisher failure", () => {
  assert.deepEqual(flags(), ["scheduler_without_post", "overdue"]);
  assert.ok(
    flags({ journal: { ...journal, status: "FAILED", postId: null } }).includes(
      "publisher_failure",
    ),
  );
  assert.deepEqual(flags({ eligibleGames: 0, slateCoverage }), []);
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

test("FAILED journal and verified Dealer card preserve publication and open reconciliation", () => {
  const failed = { ...journal, status: "FAILED" };
  for (const changes of [
    { journal: failed, posts: [post] },
    { journal: { ...failed, postId: null }, posts: [post], runs: [run, run] },
    {
      journal: { ...failed, observedAt: "invalid" },
      posts: [post],
      eligibleGames: 0,
    },
  ]) {
    const result = assess(changes);
    assert.equal(result.status, "PUBLISHED");
    assert.ok(
      result.evidence.integrityWarnings.some((w) =>
        w.includes("FAILED journal"),
      ),
    );
    assert.ok(
      result.incidents.some((i) => i.classification === "journal_mismatch"),
    );
    assert.ok(
      result.incidents.every(
        (i) => i.resolution === "Proposed for human review",
      ),
    );
    assert.ok(!flags(changes).includes("publisher_failure"));
    assert.ok(!flags(changes).includes("overdue"));
  }
  assert.notEqual(
    assess({ journal: failed, posts: [{ ...post, dealer: false }] }).status,
    "PUBLISHED",
  );
  assert.ok(
    !flags({ journal: failed, posts: [post, post] }).includes(
      "publisher_failure",
    ),
  );
});

test("invalid scheduler, journal and post timestamps suppress overdue inference", () => {
  for (const changes of [
    { runs: [{ ...run, status: "running" }] },
    { runs: [{ ...run, completedAt: null }] },
    { runs: [{ ...run, completedAt: slate + "T15:19:59Z" }] },
    { runs: [{ ...run, completedAt: slate + "T15:36:01Z" }] },
    { runs: [{ ...run, startedAt: slate + "T15:20:01" }] },
    { runs: [{ ...run, startedAt: slate + "T15:20:01+24:00" }] },
    {
      journal: {
        ...journal,
        slate: "2026-11-15",
        status: "FAILED",
        postId: null,
      },
    },
    {
      journal: {
        ...journal,
        observedAt: slate + "T04:59:59Z",
        status: "WAITING",
        postId: null,
      },
    },
    {
      journal: { ...journal, observedAt: slate + "T15:20:06Z" },
      posts: [post],
    },
    { scheduleFeedAt: slate + "T15:36:01Z" },
  ]) {
    const result = assess(changes);
    assert.ok(
      result.evidence.integrityWarnings.length,
      JSON.stringify(changes),
    );
    assert.ok(!flags(changes).includes("overdue"));
    assert.ok(!flags(changes).includes("publisher_failure"));
  }
  assert.equal(
    assess({ runs: [{ ...run, status: "running" }], journal, posts: [post] })
      .status,
    "PUBLISHED",
  );
});

test("zero stored games require fresh authoritative coverage of the target slate", () => {
  for (const coverage of [
    undefined,
    { ...slateCoverage, complete: false },
    { ...slateCoverage, slate: "2026-11-15" },
    { ...slateCoverage, evaluatedAt: slate + "T15:36:01Z" },
    { ...slateCoverage, evaluatedAt: slate + "T15:29:59Z" },
    { ...slateCoverage, evaluatedAt: slate + "T15:31:00" },
  ]) {
    const changes = { eligibleGames: 0, slateCoverage: coverage };
    assert.equal(assess(changes).status, "EVIDENCE_UNAVAILABLE");
    assert.ok(!flags(changes).includes("overdue"));
  }
  assert.equal(
    assess({
      eligibleGames: 0,
      slateCoverage,
      scheduleFeedAt: slate + "T14:30:00Z",
    }).status,
    "EVIDENCE_UNAVAILABLE",
  );
});

test("only an authoritative policy skip suppresses missing-publication proposals", () => {
  const expected = {
    ...journal,
    status: "SKIPPED",
    postId: null,
    skipReason: "insufficient_player_history",
    skipPublisherVerified: true,
  };
  const accepted = assess({ journal: expected });
  assert.equal(accepted.status, "SKIPPED");
  assert.equal(accepted.evidence.skipAssessment, "verified_expected");
  assert.deepEqual(accepted.incidents, []);

  const cases = [
    {
      label: "unexplained",
      journal: { ...expected, skipReason: "unexplained" },
    },
    {
      label: "unauthorized",
      journal: { ...expected, skipPublisherVerified: false },
    },
    {
      label: "unauthorized",
      journal: { ...expected, skipReason: "publisher_unavailable" },
    },
    {
      label: "insufficient_evidence",
      journal: { ...expected, skipPublisherVerified: null },
    },
    {
      label: "insufficient_evidence",
      journal: { ...expected, slate: "2026-11-15" },
    },
    {
      label: "insufficient_evidence",
      journal: { ...expected, observedAt: slate + "T15:21:00Z" },
    },
    { label: "insufficient_evidence", journal: expected, scheduleFeedAt: null },
    { label: "insufficient_evidence", journal: expected, runs: [] },
    { label: "contradictory", journal: { ...expected, postId: post.id } },
    { label: "contradictory", journal: expected, posts: [post] },
  ];
  for (const { label, ...changes } of cases) {
    const result = assess(changes);
    assert.equal(result.evidence.skipAssessment, label);
    assert.ok(
      result.incidents.some((i) => i.classification === "skip_requires_review"),
    );
    assert.ok(
      result.incidents.every((i) => i.classification !== "publisher_failure"),
    );
    if (["unexplained", "unauthorized"].includes(label)) {
      assert.ok(result.incidents.some((i) => i.classification === "overdue"));
      assert.ok(
        result.incidents.some(
          (i) => i.classification === "scheduler_without_post",
        ),
      );
    }
  }
  const contradiction = assess({ journal: expected, posts: [post] });
  assert.equal(contradiction.status, "PUBLISHED");
  assert.ok(
    contradiction.incidents.some(
      (i) => i.classification === "journal_mismatch",
    ),
  );
});

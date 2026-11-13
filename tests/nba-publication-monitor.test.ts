import assert from "node:assert/strict";
import test from "node:test";
import { previewNbaPublicationMonitor } from "../src/lib/nba-publication-monitor-fixtures";
import { verifyNbaPublication } from "../src/lib/nba-publication-monitor";

const examples = previewNbaPublicationMonitor();
const published = examples[0].evidence;
const missing = examples[4].evidence;

test("preview fixtures distinguish all five publication outcomes", () => {
  assert.deepEqual(
    examples.map(({ status }) => status),
    [
      "PUBLISHED",
      "WAITING",
      "SKIPPED",
      "NO_ELIGIBLE_SLATE",
      "EVIDENCE_UNAVAILABLE",
    ],
  );
  assert.equal(missing.scheduler?.outcome, "succeeded");
  assert.equal(missing.eligibility?.eligibleGames, 4);
  assert.equal(missing.post, null);
});

test("journal and post must agree on identity, type, Dealer attribution and Eastern slate", () => {
  for (const change of [
    { id: "another-post" },
    { author: "other" as const },
    { kind: "other" as const },
    { slate: "2026-11-15" },
    { publishedAt: "2026-11-16T04:59:59Z" },
    { publishedAt: "2026-11-16T15:25:01Z" },
  ]) {
    assert.equal(
      verifyNbaPublication({
        ...published,
        post: { ...published.post!, ...change },
      }).status,
      "EVIDENCE_UNAVAILABLE",
    );
  }
  assert.equal(
    verifyNbaPublication({ ...published, post: null }).status,
    "EVIDENCE_UNAVAILABLE",
  );
  assert.equal(
    verifyNbaPublication({ ...published, journal: null }).status,
    "EVIDENCE_UNAVAILABLE",
  );
  assert.equal(
    verifyNbaPublication({ ...published, scheduler: null }).status,
    "PUBLISHED",
  );
});

test("missing, prior-day and contradictory eligibility are distinct from a verified empty slate", () => {
  assert.equal(
    verifyNbaPublication({ ...missing, eligibility: null }).status,
    "EVIDENCE_UNAVAILABLE",
  );
  const empty = {
    eligibleGames: 0,
    observedAt: missing.eligibility!.observedAt,
  };
  assert.equal(
    verifyNbaPublication({ ...missing, eligibility: empty }).status,
    "NO_ELIGIBLE_SLATE",
  );
  assert.equal(
    verifyNbaPublication({ ...published, eligibility: empty }).status,
    "EVIDENCE_UNAVAILABLE",
  );
  assert.equal(
    verifyNbaPublication({
      ...missing,
      eligibility: { ...empty, observedAt: "2026-11-16T04:59:59Z" },
    }).status,
    "EVIDENCE_UNAVAILABLE",
  );
});

test("waits before the scheduled attempt with evidence on either side of the DST transition", () => {
  for (const [slate, utcMidnight] of [
    ["2026-10-31", "04"],
    ["2026-11-02", "05"],
  ]) {
    assert.equal(
      verifyNbaPublication({
        ...missing,
        slate,
        checkedAt: `${slate}T14:19:00Z`,
        scheduledAt: [`${slate}T14:20:00Z`, `${slate}T15:20:00Z`],
        scheduler: null,
        eligibility: {
          eligibleGames: 1,
          observedAt: `${slate}T${utcMidnight}:00:00Z`,
        },
      }).status,
      "WAITING",
    );
  }
});

test("the November 12 evidence shape leaves publication unresolved", () => {
  assert.equal(
    verifyNbaPublication({
      ...examples[1].evidence,
      eligibility: null,
    }).status,
    "EVIDENCE_UNAVAILABLE",
  );
});

test("schedule inference rejects missing or invalid offsets, normalized dates, wrong slate days and non-increasing instants", () => {
  const first = "2026-11-16T14:20:00Z";
  const second = "2026-11-16T15:20:00Z";
  const cases: Record<string, readonly [string, string]> = {
    "missing offset": ["2026-11-16T09:20:00", second],
    "invalid offset hour": ["2026-11-16T09:20:00-24:00", second],
    "invalid offset minute": [first, "2026-11-16T10:20:00-05:60"],
    "invalid hour": ["2026-11-16T24:00:00Z", second],
    "impossible date": ["2026-02-30T14:20:00Z", second],
    "previous Eastern date": ["2026-11-16T04:59:59Z", second],
    "next Eastern date": [first, "2026-11-17T05:00:00Z"],
    "both attempts on the next date": [
      "2026-11-17T14:20:00Z",
      "2026-11-17T15:20:00Z",
    ],
    "reversed attempts": [second, first],
    "equal instants with different offsets": [
      first,
      "2026-11-16T09:20:00-05:00",
    ],
  };

  for (const [label, scheduledAt] of Object.entries(cases)) {
    const result = verifyNbaPublication({
      ...missing,
      scheduler: null,
      checkedAt: "2026-11-16T14:00:00Z",
      eligibility: { eligibleGames: 4, observedAt: "2026-11-16T13:55:00Z" },
      scheduledAt,
    });
    assert.equal(result.status, "EVIDENCE_UNAVAILABLE", label);
    assert.match(result.reason, /Scheduled attempts/, label);
  }
});

test("checks Eastern midnight and instant ordering on both DST transition days", () => {
  const transitionCases = [
    {
      slate: "2026-03-08",
      midnight: "2026-03-08T00:00:00-05:00",
      beforeMidnight: "2026-03-08T04:59:59Z",
      scheduledAt: ["2026-03-08T01:59:59-05:00", "2026-03-08T03:00:00-04:00"],
    },
    {
      slate: "2026-11-01",
      midnight: "2026-11-01T00:00:00-04:00",
      beforeMidnight: "2026-11-01T03:59:59Z",
      scheduledAt: ["2026-11-01T01:59:59-04:00", "2026-11-01T01:00:00-05:00"],
    },
  ] as const;
  for (const {
    slate,
    midnight,
    beforeMidnight,
    scheduledAt,
  } of transitionCases) {
    const evidence = {
      ...missing,
      slate,
      checkedAt: midnight,
      scheduler: null,
      eligibility: { eligibleGames: 1, observedAt: midnight },
      scheduledAt,
    };
    assert.equal(verifyNbaPublication(evidence).status, "WAITING");
    assert.equal(
      verifyNbaPublication({
        ...evidence,
        scheduledAt: [beforeMidnight, scheduledAt[1]],
      }).status,
      "EVIDENCE_UNAVAILABLE",
    );
  }
});

test("independent publication and journal evidence survive an invalid schedule", () => {
  for (const example of examples.slice(0, 4)) {
    assert.equal(
      verifyNbaPublication({
        ...example.evidence,
        scheduledAt: ["invalid", "2026-11-17T15:20:00Z"],
      }).status,
      example.status,
    );
  }
});

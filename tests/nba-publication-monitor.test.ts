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

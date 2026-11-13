import { z } from "zod";
import {
  verifyNbaPublication,
  type PublicationEvidence,
} from "./nba-publication-monitor";

const instant = z.iso.datetime({ offset: true });
function timestamp(value: string | null | undefined): number {
  if (!instant.safeParse(value).success || !value) return NaN;
  return Date.parse(value);
}
const eastern = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const evidenceSchema = z.object({
  slate: z.iso.date(),
  checkedAt: z.string(),
  schedule: z
    .object({
      expression: z.string(),
      timezone: z.string(),
      active: z.boolean(),
    })
    .nullable(),
  runs: z
    .array(
      z.object({
        startedAt: z.string(),
        completedAt: z.string().nullable(),
        status: z.enum([
          "succeeded",
          "failed",
          "running",
          "starting",
          "connecting",
          "sending",
        ]),
      }),
    )
    .max(3),
  scheduleFeedAt: z.string().nullable(),
  slateCoverage: z
    .object({
      slate: z.iso.date(),
      evaluatedAt: z.string(),
      complete: z.boolean(),
    })
    .nullish(),
  eligibleGames: z.number().int().nonnegative(),
  journal: z
    .object({
      slate: z.iso.date(),
      status: z.enum(["POSTED", "WAITING", "SKIPPED", "FAILED"]),
      postId: z.uuid().nullable(),
      observedAt: z.string(),
    })
    .nullable(),
  posts: z
    .array(
      z.object({
        id: z.uuid(),
        publishedAt: z.string(),
        dealer: z.boolean(),
        contentMatches: z.boolean(),
      }),
    )
    .max(2),
});

const incidentTypes = {
  overdue: [
    "high",
    "medium",
    "Verify the eligible slate and reconcile the journal with The Zone.",
  ],
  scheduler_without_post: [
    "medium",
    "medium",
    "Check publisher disposition and compare the journal with the Dealer card.",
  ],
  journal_mismatch: [
    "high",
    "high",
    "Check the journal link, card marker, and configured Dealer identity.",
  ],
  evidence_unavailable: [
    "medium",
    "low",
    "Check source coverage, timestamps, and scheduler configuration.",
  ],
  inconsistent_records: [
    "high",
    "high",
    "Reconcile the duplicate or inconsistent records with their original sources.",
  ],
  publisher_failure: [
    "high",
    "high",
    "Review the recorded publisher failure and look for later successful publication evidence.",
  ],
} as const;

export function assessPublication(
  input: unknown,
  now: Date,
  source: "fixture" | "read-only source",
) {
  const parsed = evidenceSchema.safeParse(input);
  const row = parsed.success ? parsed.data : null;
  const slate = eastern.format(now);
  const checkedAt = now.toISOString();
  const snapshotAt = timestamp(row?.checkedAt);
  const validSnapshot =
    !!row &&
    Number.isFinite(snapshotAt) &&
    row.slate === slate &&
    eastern.format(snapshotAt) === slate &&
    snapshotAt <= +now;
  const fresh = validSnapshot && +now - snapshotAt <= 60_000;
  const data = fresh ? row : null;
  // The installed job is a fixed UTC pair. Other expressions or zones need a reviewed adapter.
  const schedule = data?.schedule;
  const scheduledAt: PublicationEvidence["scheduledAt"] =
    schedule?.active &&
    schedule.expression === "20 14,15 * * *" &&
    ["GMT", "UTC", "Etc/UTC"].includes(schedule.timezone)
      ? [`${slate}T14:20:00Z`, `${slate}T15:20:00Z`]
      : ["", ""];
  const deadline = scheduledAt[1]
    ? new Date(Date.parse(scheduledAt[1]) + 15 * 60_000).toISOString()
    : null;
  const feed = timestamp(data?.scheduleFeedAt);
  const coverage = data?.slateCoverage;
  const evaluated = timestamp(coverage?.evaluatedAt);
  const coverageComplete =
    coverage?.complete === true &&
    coverage.slate === slate &&
    evaluated <= snapshotAt &&
    snapshotAt - evaluated <= 30 * 60_000 &&
    evaluated >= feed &&
    eastern.format(evaluated) === slate;
  const eligible =
    data &&
    feed <= snapshotAt &&
    snapshotAt - feed <= 30 * 60_000 &&
    (data.eligibleGames > 0 || coverageComplete)
      ? data.eligibleGames
      : null;
  const runs = data?.runs ?? [];
  const withinSlate = (at: number) =>
    Number.isFinite(at) && at <= snapshotAt && eastern.format(at) === slate;
  const runSlots = runs.map((r) =>
    scheduledAt.findIndex((at) => {
      const delta = timestamp(r.startedAt) - Date.parse(at);
      return delta >= 0 && delta < 15 * 60_000;
    }),
  );
  const inconsistentRuns =
    new Set(runSlots).size !== runs.length ||
    runSlots.includes(-1) ||
    runs.some((r) => {
      const started = timestamp(r.startedAt);
      const completed = timestamp(r.completedAt);
      const terminal = r.status === "succeeded" || r.status === "failed";
      return (
        !withinSlate(started) ||
        terminal !== (r.completedAt !== null) ||
        (terminal && (!withinSlate(completed) || completed < started))
      );
    });
  const completed = inconsistentRuns
    ? undefined
    : runs.find((r) => r.status === "succeeded" || r.status === "failed");
  const journal = data?.journal ?? null;
  const journalAt = timestamp(journal?.observedAt);
  const invalidJournal =
    !!journal && (journal.slate !== slate || !withinSlate(journalAt));
  const posts = data?.posts ?? [];
  const invalidPosts = posts.some(
    (p) => !withinSlate(timestamp(p.publishedAt)),
  );
  const post = posts.length === 1 && !invalidPosts ? posts[0] : null;
  const failedWithPost =
    journal?.status === "FAILED" && !!post?.dealer && post.contentMatches;
  const integrityWarnings = [
    ...(!parsed.success && input != null
      ? ["Malformed evidence snapshot."]
      : []),
    ...(row && !validSnapshot
      ? ["Snapshot timestamp or Eastern slate is inconsistent."]
      : []),
    ...(data?.scheduleFeedAt && (!Number.isFinite(feed) || feed > snapshotAt)
      ? ["Schedule feed timestamp is invalid or in the future."]
      : []),
    ...(coverage &&
    (coverage.slate !== slate ||
      !Number.isFinite(evaluated) ||
      evaluated > snapshotAt)
      ? ["Slate coverage timestamp or Eastern slate is inconsistent."]
      : []),
    ...(inconsistentRuns
      ? ["Scheduler records have inconsistent states, timestamps, or attempts."]
      : []),
    ...(invalidJournal
      ? ["Journal timestamp or Eastern slate is inconsistent."]
      : []),
    ...(invalidPosts || posts.length > 1
      ? ["Zone post timestamps or uniqueness are inconsistent."]
      : []),
    ...(journal?.status === "POSTED" &&
    post &&
    timestamp(post.publishedAt) > journalAt
      ? ["Zone post timestamp follows its POSTED journal entry."]
      : []),
    ...(failedWithPost
      ? ["FAILED journal conflicts with a verified Dealer post."]
      : []),
  ];
  const result = failedWithPost
    ? {
        status: "PUBLISHED" as const,
        reason:
          "A unique Dealer card was verified. The FAILED journal requires reconciliation.",
      }
    : verifyNbaPublication({
        slate,
        checkedAt: data?.checkedAt ?? checkedAt,
        scheduledAt: integrityWarnings.length ? ["", ""] : scheduledAt,
        eligibility:
          eligible === null
            ? null
            : { eligibleGames: eligible, observedAt: data!.checkedAt },
        journal: invalidJournal ? null : journal,
        post: post
          ? {
              id: post.id,
              slate,
              author: post.dealer ? "TheDealer" : "other",
              kind: post.contentMatches ? "nba-threes" : "other",
              publishedAt: post.publishedAt,
            }
          : null,
        scheduler: completed
          ? {
              completedAt: completed.completedAt!,
              outcome:
                completed.status === "succeeded" ? "succeeded" : "failed",
            }
          : null,
      });
  const verified = result.status === "PUBLISHED";
  const evidence = {
    observedAt: row?.checkedAt ?? null,
    scheduleFeedAt: row?.scheduleFeedAt ?? null,
    eligibilityFresh: eligible !== null,
    eligibleGames: eligible,
    slateCoverageComplete: coverageComplete,
    integrityWarnings,
    attempts: scheduledAt.filter(Boolean),
    runs,
    journalStatus: journal?.status ?? null,
    journalAt: journal?.observedAt ?? null,
    journalPostId: journal?.postId ?? null,
    posts,
    scheduleFresh: !!scheduledAt[0] && !inconsistentRuns,
  };
  const conditions: Array<keyof typeof incidentTypes> = [];
  if (!data || eligible === null || !scheduledAt[0])
    conditions.push("evidence_unavailable");
  if (integrityWarnings.length) conditions.push("inconsistent_records");
  if (
    failedWithPost ||
    (!verified &&
      (journal?.status === "POSTED" || journal?.postId || posts.length))
  )
    conditions.push("journal_mismatch");
  if (
    !verified &&
    journal?.status === "FAILED" &&
    !posts.length &&
    !integrityWarnings.length &&
    !journal.postId
  )
    conditions.push("publisher_failure");
  if (
    !verified &&
    eligible !== 0 &&
    runs.some((r) => !inconsistentRuns && r.status === "succeeded")
  )
    conditions.push("scheduler_without_post");
  if (
    !verified &&
    eligible !== null &&
    eligible > 0 &&
    deadline &&
    !integrityWarnings.length &&
    !runs.some((r) => r.completedAt === null) &&
    +now >= Date.parse(deadline)
  )
    conditions.push("overdue");
  const incidents = conditions.map((classification) => {
    const [severity, confidence, investigation] = incidentTypes[classification];
    return {
      id: `nba-threes:${slate}:${classification}`,
      classification,
      severity,
      confidence,
      sport: "NBA",
      contentType: "Three-point volume",
      slate,
      deadline,
      evidence,
      impact: "Members may miss or receive conflicting research in The Zone.",
      investigation,
      resolution: "Proposed for human review",
    };
  });
  return {
    source,
    slate,
    checkedAt,
    deadline,
    ...result,
    evidence,
    incidents,
    diagnosis: {
      facts: [result.reason, ...integrityWarnings],
      hypotheses: [
        "Source delay, publisher deferral, or attribution mismatch may require investigation.",
      ],
      taskDraft: incidents[0]?.investigation ?? null,
    },
  };
}

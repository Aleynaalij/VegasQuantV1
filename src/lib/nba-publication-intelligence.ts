import { z } from "zod";
import {
  verifyNbaPublication,
  type PublicationEvidence,
} from "./nba-publication-monitor";

const instant = z.iso.datetime({ offset: true });
const eastern = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const evidenceSchema = z.object({
  slate: z.iso.date(),
  checkedAt: instant,
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
        startedAt: instant,
        completedAt: instant.nullable(),
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
  scheduleFeedAt: instant.nullable(),
  eligibleGames: z.number().int().nonnegative(),
  journal: z
    .object({
      slate: z.iso.date(),
      status: z.enum(["POSTED", "WAITING", "SKIPPED", "FAILED"]),
      postId: z.uuid().nullable(),
      observedAt: instant,
    })
    .nullable(),
  posts: z
    .array(
      z.object({
        id: z.uuid(),
        publishedAt: instant,
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
  const snapshotAt = row ? Date.parse(row.checkedAt) : NaN;
  const fresh =
    !!row &&
    row.slate === slate &&
    snapshotAt <= +now &&
    +now - snapshotAt <= 60_000;
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
  const feed = data?.scheduleFeedAt ? Date.parse(data.scheduleFeedAt) : NaN;
  const eligible =
    data && feed <= snapshotAt && snapshotAt - feed <= 30 * 60_000
      ? data.eligibleGames
      : null;
  const runs = data?.runs ?? [];
  const runSlots = runs.map((r) =>
    scheduledAt.findIndex((at) => {
      const delta = Date.parse(r.startedAt) - Date.parse(at);
      return delta >= 0 && delta < 15 * 60_000;
    }),
  );
  const inconsistentRuns =
    new Set(runSlots).size !== runs.length ||
    runSlots.includes(-1) ||
    runs.some(
      (r) =>
        Date.parse(r.startedAt) > snapshotAt ||
        (r.completedAt
          ? Date.parse(r.completedAt) < Date.parse(r.startedAt) ||
            Date.parse(r.completedAt) > snapshotAt
          : ["succeeded", "failed"].includes(r.status)),
    );
  const completed = inconsistentRuns
    ? undefined
    : runs.find(
        (r) =>
          r.completedAt && (r.status === "succeeded" || r.status === "failed"),
      );
  const journal = data?.journal ?? null;
  const posts = data?.posts ?? [];
  const post = posts.length === 1 ? posts[0] : null;
  const result = verifyNbaPublication({
    slate,
    checkedAt: data?.checkedAt ?? checkedAt,
    scheduledAt: inconsistentRuns ? ["", ""] : scheduledAt,
    eligibility:
      eligible === null
        ? null
        : { eligibleGames: eligible, observedAt: data!.checkedAt },
    journal,
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
          outcome: completed.status === "succeeded" ? "succeeded" : "failed",
        }
      : null,
  });
  const verified = result.status === "PUBLISHED";
  const evidence = {
    observedAt: row?.checkedAt ?? null,
    scheduleFeedAt: row?.scheduleFeedAt ?? null,
    eligibilityFresh: eligible !== null,
    eligibleGames: eligible,
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
  if (inconsistentRuns || posts.length > 1)
    conditions.push("inconsistent_records");
  if (
    !verified &&
    (journal?.status === "POSTED" || journal?.postId || posts.length)
  )
    conditions.push("journal_mismatch");
  if (
    !verified &&
    journal?.status === "FAILED" &&
    journal.slate === slate &&
    eastern.format(Date.parse(journal.observedAt)) === slate &&
    Date.parse(journal.observedAt) <= snapshotAt
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
    !inconsistentRuns &&
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
      facts: [result.reason, ...incidents.map((i) => i.classification)],
      hypotheses: [
        "Source delay, publisher deferral, or attribution mismatch may require investigation.",
      ],
      taskDraft: incidents[0]?.investigation ?? null,
    },
  };
}

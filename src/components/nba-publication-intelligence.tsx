"use client";

import { useState } from "react";
import type { readPreviewPublicationIntelligence } from "@/lib/nba-publication-intelligence-preview";

type Preview = Awaited<ReturnType<typeof readPreviewPublicationIntelligence>>;

const time = (value: string | null) =>
  value ? <time dateTime={value}>{value}</time> : "Unavailable";

export function NbaPublicationIntelligence({ data }: { data: Preview }) {
  const [reviewed, setReviewed] = useState<Set<string>>(() => new Set());
  return (
    <section aria-label="NBA publication intelligence">
      <h2>NBA publication intelligence</h2>
      <p>
        {data.live
          ? "Isolated read-only source"
          : "Fixture-only mode · SYNTHETIC evidence"}
      </p>
      {[...(data.live ? [data.live] : []), ...data.fixtures].map(
        (report, index) => {
          const key = `${report.source}:${report.slate}:${report.status}:${index}`;
          const evidence = report.evidence;
          return (
            <section key={key} aria-label={`${report.source} ${report.status}`}>
              <h3>
                {report.source === "fixture"
                  ? report.evidence.journalStatus === "FAILED"
                    ? "SYNTHETIC contradiction"
                    : "SYNTHETIC example"
                  : "Read-only observation"}{" "}
                · {report.status}
              </h3>
              <p>
                {report.slate} Eastern · {report.reason}
              </p>
              {evidence.integrityWarnings.map((warning) => (
                <p key={warning}>
                  <strong>Evidence integrity warning.</strong> {warning}
                </p>
              ))}
              <dl>
                {evidence.skipAssessment && (
                  <>
                    <dt>Skip assessment</dt>
                    <dd>{evidence.skipAssessment.replaceAll("_", " ")}</dd>
                  </>
                )}
                <dt>Expected deadline</dt>
                <dd>{time(report.deadline)}</dd>
                <dt>Evidence snapshot</dt>
                <dd>{time(evidence.observedAt)}</dd>
                <dt>Slate source freshness</dt>
                <dd>
                  {evidence.eligibilityFresh ? "Fresh" : "Unverified"} ·{" "}
                  {time(evidence.scheduleFeedAt)}
                </dd>
                <dt>Eligible games</dt>
                <dd>{evidence.eligibleGames ?? "Unverified"}</dd>
                <dt>Scheduled attempts</dt>
                <dd>
                  {evidence.scheduleFresh
                    ? evidence.attempts.join(" · ")
                    : "Unverified"}
                </dd>
              </dl>
              <details>
                <summary>Evidence timeline</summary>
                <ul>
                  {evidence.runs.map((run, index) => (
                    <li key={index}>
                      Scheduler {run.status} · {time(run.startedAt)} to{" "}
                      {time(run.completedAt)}
                    </li>
                  ))}
                  <li>
                    Publisher journal {evidence.journalStatus ?? "unavailable"}{" "}
                    · {time(evidence.journalAt)}
                  </li>
                  {evidence.posts.map((post) => (
                    <li key={post.id}>
                      Zone post{" "}
                      <code style={{ overflowWrap: "anywhere" }}>
                        {post.id}
                      </code>{" "}
                      · {time(post.publishedAt)} ·{" "}
                      {post.dealer && post.contentMatches
                        ? "Dealer and card checks match"
                        : "Dealer or card mismatch"}
                    </li>
                  ))}
                </ul>
              </details>
              <h4>Incident proposals</h4>
              {report.incidents.length === 0 && <p>No incident proposed.</p>}
              {report.incidents.map((incident) => {
                const reviewKey = `${key}:${incident.id}:${report.checkedAt}`;
                return (
                  <details
                    key={incident.id}
                    id={
                      report.source === "fixture"
                        ? `publication-incident-${incident.id}`
                        : undefined
                    }
                  >
                    <summary>
                      {incident.classification.replaceAll("_", " ")} ·{" "}
                      {incident.severity} severity
                    </summary>
                    <p>
                      Confidence: {incident.confidence}. {incident.resolution}.
                    </p>
                    <p>{incident.impact}</p>
                    <p>{incident.investigation}</p>
                    <button
                      type="button"
                      disabled={reviewed.has(reviewKey)}
                      onClick={() =>
                        setReviewed(
                          (previous) => new Set([...previous, reviewKey]),
                        )
                      }
                    >
                      {reviewed.has(reviewKey)
                        ? "Reviewed in this session"
                        : "Mark reviewed in this session"}
                    </button>
                  </details>
                );
              })}
              <details>
                <summary>Decision record · {time(report.checkedAt)}</summary>
                <p>Observed facts</p>
                <ul>
                  {report.diagnosis.facts.map((fact) => (
                    <li key={fact}>{fact.replaceAll("_", " ")}</li>
                  ))}
                </ul>
                {report.diagnosis.taskDraft && (
                  <>
                    <p>
                      Hypothesis to review: {report.diagnosis.hypotheses[0]}
                    </p>
                    <p>Draft investigation: {report.diagnosis.taskDraft}</p>
                  </>
                )}
              </details>
            </section>
          );
        },
      )}
    </section>
  );
}

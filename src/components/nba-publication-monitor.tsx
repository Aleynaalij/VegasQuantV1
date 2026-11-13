import type { previewNbaPublicationMonitor } from "@/lib/nba-publication-monitor-fixtures";

const easternTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/New_York",
});

function timestamp(value: string) {
  return <time dateTime={value}>{easternTime.format(new Date(value))} ET</time>;
}

export function NbaPublicationMonitor({
  examples,
}: {
  examples: ReturnType<typeof previewNbaPublicationMonitor>;
}) {
  return (
    <section aria-labelledby="nba-publication-monitor">
      <h2 id="nba-publication-monitor">NBA three-point Publication Monitor</h2>
      <p>SYNTHETIC evidence</p>
      <p>
        Expected publication · One original NBA three-point volume card by
        TheDealer in The Zone on an eligible Eastern slate.
      </p>
      {examples.map(({ label, status, reason, evidence }) => (
        <details key={label}>
          <summary>
            {label} · <strong>{status}</strong>
          </summary>
          <p>{reason}</p>
          <dl>
            <dt>Eastern slate</dt>
            <dd>{evidence.slate}</dd>
            <dt>Scheduled attempts</dt>
            <dd>
              {timestamp(evidence.scheduledAt[0])} and{" "}
              {timestamp(evidence.scheduledAt[1])}
            </dd>
            <dt>Scheduler outcome</dt>
            <dd>
              {evidence.scheduler ? (
                <>
                  {evidence.scheduler.outcome} ·{" "}
                  {timestamp(evidence.scheduler.completedAt)}
                </>
              ) : (
                "Unavailable"
              )}
            </dd>
            <dt>Eligibility evidence</dt>
            <dd>
              {evidence.eligibility ? (
                <>
                  {evidence.eligibility.eligibleGames} eligible games ·{" "}
                  {timestamp(evidence.eligibility.observedAt)}
                </>
              ) : (
                "Unavailable"
              )}
            </dd>
            <dt>Publisher journal</dt>
            <dd>
              {evidence.journal ? (
                <>
                  {evidence.journal.status} ·{" "}
                  {timestamp(evidence.journal.observedAt)}
                </>
              ) : (
                "Unavailable"
              )}
            </dd>
            <dt>Actual post ID</dt>
            <dd style={{ overflowWrap: "anywhere" }}>
              {evidence.post ? (
                <>
                  <code>{evidence.post.id}</code> ·{" "}
                  {timestamp(evidence.post.publishedAt)}
                </>
              ) : (
                "Unavailable"
              )}
            </dd>
            <dt>Evidence checked</dt>
            <dd>{timestamp(evidence.checkedAt)}</dd>
          </dl>
        </details>
      ))}
      <h3>November 12, 2026 · Unresolved investigation</h3>
      <p>
        Audit evidence showed a successful scheduler record and a WAITING
        journal entry with no post ID at 10:20 a.m. ET. Slate eligibility, the
        cause, and the final publication outcome remain unverified.
      </p>
    </section>
  );
}

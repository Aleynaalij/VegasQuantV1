import type { buildBlackboxIntelligence } from "@/lib/blackbox-intelligence";

type Intelligence = ReturnType<typeof buildBlackboxIntelligence>;

export function BlackboxBriefing({
  data,
  now,
}: {
  data: Intelligence;
  now: number;
}) {
  return (
    <section aria-label="Engineering briefing">
      <h3>Engineering briefing</h3>
      <p>
        Synthetic staging ledger · {new Date(now).toISOString()} · {data.policy}
      </p>
      <p>
        Platform health and production readiness require separate evidence.
        Production release requires CEO approval.
      </p>
      <ul>
        {data.queue.map((item) => (
          <li key={item.anchor}>
            <a href={`#${item.anchor}`}>{item.plan.problem}</a> ·{" "}
            {item.task.status.replaceAll("_", " ")} ·{" "}
            {item.outcomes.length
              ? "independently reviewed"
              : "investigation only"}{" "}
            · evidence {item.fresh ? "fresh" : "stale or unknown"}
          </li>
        ))}
      </ul>
      <p>
        {data.queue.filter((item) => item.outcomes.length === 0).length} open ·
        Pending independent review {data.pendingReview.length} · Blocked or
        stale {data.blocked.length} · Reviewed resolutions{" "}
        {data.resolutions.length}
      </p>
      <p>
        Mean acknowledgment-to-review time{" "}
        {data.averageHours === null
          ? "unavailable"
          : `${data.averageHours.toFixed(1)} hours`}
        . Reviewer availability and recommendation acceptance are unmeasured.
      </p>
      <h4>Agent workload</h4>
      <ul>
        {data.workload.map((agent) => (
          <li key={agent.role}>
            {agent.role} · {agent.skill} ·{" "}
            {agent.registered
              ? "eligible for recommendation"
              : "availability unconfirmed"}{" "}
            ·{" "}
            {agent.assigned.map((anchor, index) => (
              <a key={anchor} href={`#${anchor}`}>
                Task {index + 1}{" "}
              </a>
            ))}
          </li>
        ))}
      </ul>
      <h4>Proposed improvements</h4>
      {data.improvements.length === 0 && (
        <p>No rejection-based improvement proposed.</p>
      )}
      <ul>
        {data.improvements.map((item) => (
          <li key={item.id}>
            <a href={`#${item.anchor}`}>{item.recommendation}</a>{" "}
            <small style={{ overflowWrap: "anywhere" }}>{item.id}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BlackboxPriority({
  item,
}: {
  item: Intelligence["queue"][number];
}) {
  return (
    <>
      <p>
        Advisory priority {item.score} · {item.confidence} confidence · observed{" "}
        {item.task.proposal.incident.evidence.observedAt ?? "unknown"}
      </p>
      <details>
        <summary>Priority factors</summary>
        <ul>
          {Object.entries(item.factors).map(([name, value]) => (
            <li key={name}>
              {name} {value}
            </li>
          ))}
        </ul>
      </details>
      {item.blockers.length > 0 && (
        <p>Blockers · {item.blockers.join(" · ")}</p>
      )}
      {item.stale && (
        <p>
          Escalation recommendation · Confirm ownership and assess a supervised
          handoff.
        </p>
      )}
      <p>Potential impact · {item.task.proposal.incident.impact}</p>
      <p>Unknowns · {item.plan.unknowns.join(" · ")}</p>
      <p>Risk · {item.plan.risk}</p>
      <p>Related slates {item.recurrences}</p>
      {item.historical.map(({ anchor, outcome }) => (
        <p key={`${anchor}:${outcome.version}`}>
          <a href={`#${anchor}`}>Reviewed precedent</a> · {outcome.conclusion} ·{" "}
          {outcome.confidence} confidence
        </p>
      ))}
      <h4>Suggested validation</h4>
      <ul>
        {item.plan.tests.map((test) => (
          <li key={test}>{test}</li>
        ))}
      </ul>
      <h4>Completion criteria</h4>
      <ul>
        {item.task.proposal.acceptance.map((criterion) => (
          <li key={criterion}>{criterion}</li>
        ))}
      </ul>
    </>
  );
}

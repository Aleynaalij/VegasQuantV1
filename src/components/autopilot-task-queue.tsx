import type { AutopilotTask } from "@/lib/autopilot-tasks";

export function AutopilotTaskQueue({ tasks }: { tasks: AutopilotTask[] }) {
  return (
    <section aria-label="Autopilot task queue">
      <h2>Autopilot task queue</h2>
      <p>SYNTHETIC · Read-only coordination preview</p>
      {tasks.length === 0 && <p>No task proposals.</p>}
      {tasks.map((task) => (
        <details key={task.id}>
          <summary>
            {task.priority} ·{" "}
            {task.incident.classification.replaceAll("_", " ")} ·{" "}
            {task.status.replaceAll("_", " ")}
          </summary>
          <dl>
            <dt>Task ID</dt>
            <dd style={{ overflowWrap: "anywhere" }}>{task.id}</dd>
            <dt>Source incident</dt>
            <dd>
              <a href={`#${task.evidenceAnchor}`}>
                {task.incident.slate} Eastern · evidence
              </a>
            </dd>
            <dt>Severity</dt>
            <dd>{task.incident.severity}</dd>
            <dt>Recommended agent</dt>
            <dd>{task.recommendedAgent}</dd>
            <dt>Assigned agent</dt>
            <dd>{task.assigned ?? "Unassigned"}</dd>
            <dt>Acknowledged owner</dt>
            <dd>{task.owner ?? "Awaiting assignment or acknowledgment"}</dd>
            <dt>Risk and approval</dt>
            <dd>
              {task.risk} · {task.approval}
            </dd>
          </dl>
          {task.status === "blocked" && (
            <p>
              <strong>Escalation:</strong> {task.history.at(-1)?.evidence}
            </p>
          )}
          {(
            [
              ["Observed fixture facts", task.facts],
              ["Hypotheses", task.hypotheses],
              ["Investigation", task.investigation],
              ["Acceptance criteria", task.acceptance],
            ] satisfies [string, string[]][]
          ).map(([label, items]) => (
            <div key={label}>
              <h3>{label}</h3>
              <ul>
                {items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
          <h3>Task history</h3>
          {task.history.length === 0 && <p>Proposal awaiting human review.</p>}
          <ol>
            {task.history.map((event) => (
              <li key={event.at}>
                <time dateTime={event.at}>{event.at}</time> · {event.actor} ·{" "}
                {event.action} · {event.evidence}
              </li>
            ))}
          </ol>
        </details>
      ))}
    </section>
  );
}

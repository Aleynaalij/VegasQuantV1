import type { assessPublication } from "./nba-publication-intelligence";

type Report = ReturnType<typeof assessPublication>;
type Agent = "Codex" | "Claude";
type Actor = Agent | "Director" | "Administrator";
type Status =
  | "proposed"
  | "assigned"
  | "in_progress"
  | "blocked"
  | "in_review"
  | "completed";
type Event = {
  actor: Actor;
  at: string;
  evidence: string;
} & (
  | { action: "assign" | "handoff"; to: Agent }
  | { action: "acknowledge" | "escalate" | "submit" | "approve" }
);

export type AutopilotTask = {
  id: string;
  incident: Report["incidents"][number];
  evidenceAnchor: string;
  facts: string[];
  hypotheses: string[];
  priority: "P1" | "P2";
  recommendedAgent: Agent;
  investigation: string[];
  acceptance: string[];
  risk: "read-only investigation";
  approval: "Independent administrator review";
  status: Status;
  assigned: Agent | null;
  owner: Agent | null;
  history: Event[];
};

export function draftAutopilotTasks(reports: Report[]): AutopilotTask[] {
  const tasks = new Map<string, AutopilotTask>();
  for (const report of reports) {
    if (report.source !== "fixture") continue;
    for (const incident of report.incidents) {
      // Related observations for the same slate belong to one investigation.
      const reconcile = [
        "journal_mismatch",
        "inconsistent_records",
        "skip_requires_review",
      ].includes(incident.classification);
      const id = `task:nba-threes:${incident.slate}:${reconcile ? "reconcile-records" : "verify-publication"}`;
      const previous = tasks.get(id);
      if (
        previous &&
        (previous.incident.severity === "high" || incident.severity !== "high")
      )
        continue;
      tasks.set(id, {
        id,
        incident,
        evidenceAnchor: `publication-incident-${incident.id}`,
        facts: [
          `Synthetic observation · ${report.status} · ${report.checkedAt}`,
          ...report.diagnosis.facts,
        ],
        hypotheses: [...report.diagnosis.hypotheses],
        priority: incident.severity === "high" ? "P1" : "P2",
        recommendedAgent: reconcile ? "Claude" : "Codex",
        investigation: [
          incident.investigation,
          "Record source timestamps, identifiers, and any unresolved gaps.",
        ],
        acceptance: [
          "Reconcile the exact Eastern slate against authoritative source records.",
          "Record the conclusion and supporting evidence for independent review. Leave unresolved findings open.",
        ],
        risk: "read-only investigation",
        approval: "Independent administrator review",
        status: "proposed",
        assigned: null,
        owner: null,
        history: [],
      });
    }
  }
  return [...tasks.values()].sort(
    (a, b) => a.priority.localeCompare(b.priority) || a.id.localeCompare(b.id),
  );
}

// Replay of synthetic history only. A future server must derive actors from
// authenticated identities and validate independent reviewer identity itself.
export function replayTaskHistory(
  draft: AutopilotTask,
  events: readonly Event[],
): AutopilotTask {
  let task = draft;
  for (const event of events) {
    const at = Date.parse(event.at);
    const last = task.history.at(-1);
    if (
      !Number.isFinite(at) ||
      new Date(at).toISOString() !== event.at ||
      (last && at <= Date.parse(last.at)) ||
      !event.evidence.trim()
    )
      throw new Error("Invalid audit event");

    let next: Partial<AutopilotTask>;
    switch (event.action) {
      case "assign":
        if (event.actor !== "Administrator" || task.status !== "proposed")
          throw new Error("Assignment denied");
        next = { status: "assigned", assigned: event.to };
        break;
      case "acknowledge":
        if (event.actor !== task.assigned || task.status !== "assigned")
          throw new Error("Acknowledgment denied");
        next = { status: "in_progress", owner: task.assigned };
        break;
      case "escalate":
        if (event.actor !== task.owner || task.status !== "in_progress")
          throw new Error("Escalation denied");
        next = { status: "blocked" };
        break;
      case "handoff":
        if (
          event.actor !== "Administrator" ||
          task.status !== "blocked" ||
          event.to === task.owner
        )
          throw new Error("Handoff denied");
        next = { status: "assigned", assigned: event.to, owner: null };
        break;
      case "submit":
        if (event.actor !== task.owner || task.status !== "in_progress")
          throw new Error("Submission denied");
        next = { status: "in_review" };
        break;
      case "approve":
        if (event.actor !== "Administrator" || task.status !== "in_review")
          throw new Error("Approval denied");
        next = { status: "completed" };
        break;
    }
    task = { ...task, ...next, history: [...task.history, { ...event }] };
  }
  return task;
}

export function previewAutopilotTasks(fixtures: Report[]): AutopilotTask[] {
  return draftAutopilotTasks(fixtures).map((task) => {
    if (task.recommendedAgent === "Claude") return task;
    return replayTaskHistory(task, [
      {
        actor: "Administrator",
        action: "assign",
        to: "Codex",
        at: "2026-11-16T16:00:00.000Z",
        evidence: "Synthetic investigation approved.",
      },
      {
        actor: "Codex",
        action: "acknowledge",
        at: "2026-11-16T16:01:00.000Z",
        evidence: "Synthetic ownership acknowledged.",
      },
      {
        actor: "Codex",
        action: "escalate",
        at: "2026-11-16T16:10:00.000Z",
        evidence: "Awaiting an authoritative slate coverage record.",
      },
    ]);
  });
}

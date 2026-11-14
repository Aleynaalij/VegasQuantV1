import type { BlackboxAgent, BlackboxTask } from "./blackbox";

const hour = 3_600_000;
const policy = "phase3-v1";
const taskAnchor = (id: string) => `blackbox-task-${id}`;
const capability = {
  codex: "publication verification",
  claude: "record reconciliation",
};

function dependenciesOf(
  id: string,
  dependencies: Readonly<Record<string, readonly string[]>>,
  tasks: Map<string, BlackboxTask>,
) {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const blockers = new Set<string>();
  function visit(current: string) {
    if (visiting.has(current)) {
      blockers.add(`Dependency cycle through ${current}`);
      return;
    }
    if (visited.has(current)) return;
    visiting.add(current);
    for (const next of dependencies[current] ?? []) {
      const dependency = tasks.get(next);
      if (!dependency)
        blockers.add(`Dependency ${next} is outside the visible ledger`);
      else {
        if (dependency.status !== "completed" || !reviewed(dependency).length)
          blockers.add(`Dependency ${next} has no reviewed completion`);
        visit(next);
      }
    }
    visiting.delete(current);
    visited.add(current);
  }
  visit(id);
  return [...blockers].sort();
}

function reviewed(task: BlackboxTask) {
  return (task.outcomes ?? []).filter(
    (outcome) =>
      outcome.verification === "independent synthetic review" &&
      outcome.sourceIncident === task.proposal.incident.id &&
      typeof outcome.conclusion === "string" &&
      outcome.conclusion.trim() &&
      task.history.some(
        (e) =>
          e.action === "approve" &&
          e.role === "reviewer" &&
          e.version === outcome.version &&
          e.observed_at === outcome.reviewedAt,
      ),
  );
}

export function buildBlackboxIntelligence(
  input: readonly BlackboxTask[],
  agents: readonly BlackboxAgent[],
  now: number,
  dependencies: Readonly<Record<string, readonly string[]>> = {},
) {
  const tasks = new Map<string, BlackboxTask>();
  for (const task of input) {
    const prior = tasks.get(task.id);
    if (!prior || prior.version < task.version) tasks.set(task.id, task);
  }
  const rows = [...tasks.values()].sort((a, b) => a.id.localeCompare(b.id));
  const workload = Object.entries(capability).map(([role, skill]) => ({
    role,
    skill,
    registered: agents.some((a) => a.role === role),
    assigned: rows
      .filter((t) => t.assigned_role === role && t.status !== "completed")
      .map((t) => taskAnchor(t.id)),
  }));
  const queue = rows
    .map((task) => {
      const incident = task.proposal.incident;
      const observed = Date.parse(incident.evidence.observedAt ?? "");
      const age = now - Date.parse(task.updated_at);
      const fresh =
        Number.isFinite(observed) &&
        observed <= now &&
        now - observed < 24 * hour;
      const contradictory = incident.evidence.integrityWarnings.length > 0;
      const confidence = !fresh || contradictory ? "low" : incident.confidence;
      const blockers = dependenciesOf(task.id, dependencies, tasks);
      if (task.status === "blocked")
        blockers.push("Ledger marks investigation blocked");
      const related = rows.filter(
        (t) =>
          t.id !== task.id &&
          t.proposal.incident.classification === incident.classification &&
          t.proposal.incident.contentType === incident.contentType &&
          t.proposal.incident.sport === incident.sport,
      );
      const recurrences = new Set(
        related
          .map((t) => t.proposal.incident.slate)
          .filter((s) => s !== incident.slate),
      ).size;
      const historical = related.flatMap((t) =>
        reviewed(t).map((outcome) => ({ anchor: taskAnchor(t.id), outcome })),
      );
      const stale =
        task.status === "assigned"
          ? age >= 24 * hour
          : task.status === "in_progress" && age >= 72 * hour;
      const deadline = Date.parse(incident.deadline ?? "");
      const factors = {
        severity: incident.severity === "high" ? 30 : 15,
        possibleImpact: incident.impact ? 5 : 0,
        confidence: { high: 20, medium: 10, low: 0 }[confidence],
        deadline: fresh && !contradictory && deadline <= now ? 15 : 0,
        age: Number.isFinite(age)
          ? Math.min(10, Math.max(0, Math.floor(age / (24 * hour))))
          : 0,
        blockers: blockers.length ? 10 : 0,
        recurrence: Math.min(10, recurrences * 5),
        reviewedPrecedent: historical.length ? 5 : 0,
        workload: workload.some((a) => a.registered && a.assigned.length === 0)
          ? 5
          : 0,
      };
      const preferred = task.proposal.recommendedAgent.toLowerCase();
      const candidates = workload
        .filter((a) => a.registered)
        .sort(
          (a, b) =>
            a.assigned.length +
              2 * Number(a.role !== preferred) -
              b.assigned.length -
              2 * Number(b.role !== preferred) || a.role.localeCompare(b.role),
        );
      const recommended =
        blockers.length || task.status !== "proposed"
          ? null
          : (candidates[0]?.role ?? null);
      return {
        task,
        anchor: taskAnchor(task.id),
        confidence,
        fresh,
        recurrences,
        historical,
        blockers,
        stale,
        recommended,
        factors,
        score: Object.values(factors).reduce((a, b) => a + b, 0),
        outcomes: reviewed(task),
        plan: {
          problem: `Investigate ${incident.classification.replaceAll("_", " ")} for ${incident.slate} Eastern`,
          unknowns: [
            ...(!fresh ? ["Current source freshness"] : []),
            ...(contradictory
              ? ["Which conflicting record reflects the verified outcome"]
              : []),
            "Actual member impact and root cause",
          ],
          steps: task.proposal.investigation,
          tests: [
            "Reconcile source identifiers and Eastern timestamps",
            "Reproduce with synthetic data and exercise authorization denial",
          ],
          risk:
            contradictory || !fresh
              ? "Elevated risk of an unsupported conclusion"
              : "Read-only investigation",
        },
      };
    })
    .sort(
      (a, b) =>
        Number(a.outcomes.length > 0) - Number(b.outcomes.length > 0) ||
        b.score - a.score ||
        a.task.id.localeCompare(b.task.id),
    );
  const rejection = queue.filter((t) =>
    t.task.history.some((e) => e.action === "reject"),
  );
  const resolutions = queue.filter((t) => t.outcomes.length);
  const approvals = resolutions
    .flatMap((t) =>
      t.outcomes.map((outcome) => {
        const start = Date.parse(
          t.task.history.find((e) => e.action === "acknowledge")?.observed_at ??
            "",
        );
        const end = Date.parse(String(outcome.reviewedAt));
        return Number.isFinite(start) && end >= start
          ? (end - start) / hour
          : null;
      }),
    )
    .filter((n): n is number => n !== null);
  return {
    policy,
    queue,
    workload,
    resolutions,
    rejection,
    pendingReview: queue.filter((t) => t.task.status === "in_review"),
    blocked: queue.filter((t) => t.blockers.length || t.stale),
    averageHours: approvals.length
      ? approvals.reduce((a, b) => a + b, 0) / approvals.length
      : null,
    improvements: rejection.map((t) => ({
      id: `${policy}:${t.task.id}:corroboration:v${t.task.version}`,
      anchor: t.anchor,
      recommendation:
        "Require an independent source reference and exact slate timestamps before resubmission.",
    })),
  };
}

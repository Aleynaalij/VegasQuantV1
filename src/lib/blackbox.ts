import type { AutopilotTask } from "./autopilot-tasks";

export type BlackboxRole = "admin" | "reviewer" | "codex" | "claude";
export type BlackboxAgent = { id: string; role: "codex" | "claude" };
export type BlackboxOutcome = Record<string, string | number>;
export type BlackboxTask = {
  id: string;
  proposal: AutopilotTask;
  status: string;
  version: number;
  updated_at: string;
  assigned_role: string | null;
  outcomes?: BlackboxOutcome[];
  history: {
    version: number;
    role: string;
    action: string;
    evidence: string;
    observed_at: string;
  }[];
};

export function blackboxEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  return (
    env.VERCEL_ENV === "preview" &&
    env.VQ_BLACKBOX_STAGING === "true" &&
    env.NEXT_PUBLIC_SUPABASE_URL === "https://apwndmcsjxzjxnpxfywo.supabase.co"
  );
}

export function directTasks(tasks: BlackboxTask[], now: number) {
  const overdue = tasks.filter(
    (task) =>
      task.status === "assigned" &&
      now - Date.parse(task.updated_at) >= 24 * 60 * 60 * 1000,
  );
  const recurring = Object.entries(
    tasks.reduce<Record<string, number>>((counts, task) => {
      const classification = task.proposal.incident.classification;
      counts[classification] = (counts[classification] ?? 0) + 1;
      return counts;
    }, {}),
  ).filter(([, count]) => count > 1);
  return {
    recurring,
    open: tasks.filter((task) => task.status !== "completed").length,
    completed: tasks.filter((task) => task.status === "completed").length,
    blocked: tasks.filter((task) => task.status === "blocked").length,
    overdue,
    prioritized: [...tasks].sort(
      (a, b) =>
        a.proposal.priority.localeCompare(b.proposal.priority) ||
        (a.proposal.incident.confidence === b.proposal.incident.confidence
          ? 0
          : ["high", "medium", "low"].indexOf(a.proposal.incident.confidence) -
            ["high", "medium", "low"].indexOf(
              b.proposal.incident.confidence,
            )) ||
        a.id.localeCompare(b.id),
    ),
  };
}

export function recommendAgent(
  task: BlackboxTask,
  tasks: BlackboxTask[],
  agents: BlackboxAgent[],
) {
  if (task.assigned_role) return task.assigned_role;
  const preference = task.proposal.recommendedAgent.toLowerCase();
  const load = (role: string) =>
    tasks.filter((t) => t.assigned_role === role && t.status !== "completed")
      .length;
  return (
    [...new Set(agents.map((agent) => agent.role))].sort(
      (a, b) =>
        load(a) +
          Number(a !== preference) -
          (load(b) + Number(b !== preference)) ||
        Number(a !== preference) - Number(b !== preference) ||
        a.localeCompare(b),
    )[0] ?? preference
  );
}

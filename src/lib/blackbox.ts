import type { AutopilotTask } from "./autopilot-tasks";

export type BlackboxTask = {
  id: string;
  proposal: AutopilotTask;
  status: string;
  version: number;
  updated_at: string;
  assigned_role: string | null;
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
  return {
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

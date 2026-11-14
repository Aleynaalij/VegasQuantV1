"use client";

import { useRef, useState, type FormEvent } from "react";
import type { BlackboxAgent, BlackboxRole, BlackboxTask } from "@/lib/blackbox";

export async function blackboxRequest(
  payload: object,
  token: string,
  signal?: AbortSignal,
) {
  const response = await fetch("/api/operations/blackbox", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok)
    throw new Error(
      response.status === 409
        ? "Task changed. Refresh before retrying."
        : "Action unavailable for this session.",
    );
  return response.json();
}

export function BlackboxTaskAction({
  task,
  role,
  agents,
  recommended,
  token,
  refresh,
}: {
  task: BlackboxTask;
  role: BlackboxRole;
  agents: BlackboxAgent[];
  recommended: string;
  token: string;
  refresh: () => Promise<void>;
}) {
  const actions =
    role === "admin"
      ? task.status === "proposed"
        ? ["assign"]
        : task.status === "blocked"
          ? ["handoff"]
          : []
      : role === "reviewer"
        ? task.status === "in_review"
          ? ["approve", "reject"]
          : []
        : task.status === "assigned"
          ? ["acknowledge"]
          : task.status === "in_progress"
            ? ["submit", "escalate"]
            : [];
  const [selection, setSelection] = useState("");
  const action = actions.includes(selection) ? selection : actions[0];
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const retry = useRef<{ body: string; id: string } | null>(null);
  if (!action) return null;
  const assign = action === "assign" || action === "handoff";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const payload = {
      action,
      task: task.id,
      version: task.version,
      evidence: String(data.get("evidence") ?? ""),
      target: assign ? String(data.get("target") ?? "") : undefined,
      outcome:
        action === "approve"
          ? Object.fromEntries(
              [
                "conclusion",
                "confidence",
                "rootCause",
                "fix",
                "tests",
                "deployment",
                "rollback",
                "runbook",
              ].flatMap((key) => {
                const value = String(data.get(key) ?? "").trim();
                return value ? [[key, value]] : [];
              }),
            )
          : undefined,
    };
    const body = JSON.stringify(payload);
    if (retry.current?.body !== body)
      retry.current = { body, id: crypto.randomUUID() };
    setBusy(true);
    setNotice("");
    try {
      await blackboxRequest({ ...payload, request: retry.current.id }, token);
      await refresh();
      setNotice("Staging action recorded.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Action unavailable.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <fieldset disabled={busy}>
        <legend>Staging task action</legend>
        <label>
          Action{" "}
          <select value={action} onChange={(e) => setSelection(e.target.value)}>
            {actions.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        {assign && (
          <label>
            Agent{" "}
            <select
              name="target"
              required
              defaultValue={
                agents.find((a) => a.role === recommended)?.id ?? ""
              }
            >
              <option value="">Choose agent</option>
              {agents
                .filter(
                  (a) => action !== "handoff" || a.role !== task.assigned_role,
                )
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.role}
                  </option>
                ))}
            </select>
          </label>
        )}
        <label>
          {action === "reject" ? "Rejection reason" : "Evidence or reason"}{" "}
          <textarea name="evidence" required maxLength={1500} />
        </label>
        {action === "approve" && (
          <>
            <label>
              Verified conclusion{" "}
              <textarea name="conclusion" required maxLength={1500} />
            </label>
            <label>
              Confidence{" "}
              <select name="confidence" defaultValue="medium">
                <option>low</option>
                <option>medium</option>
                <option>high</option>
              </select>
            </label>
            {Object.entries({
              rootCause: "Verified root cause",
              fix: "Fix reference",
              tests: "Test results",
              deployment: "Deployment reference",
              rollback: "Rollback reference",
              runbook: "Reviewed runbook recommendation",
            }).map(([name, label]) => (
              <label key={name}>
                {label} <input name={name} maxLength={500} />
              </label>
            ))}
          </>
        )}
        <button type="submit">Record staging action</button>
      </fieldset>
      {notice && <p role="status">{notice}</p>}
    </form>
  );
}

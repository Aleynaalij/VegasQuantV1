"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  directTasks,
  recommendAgent,
  type BlackboxAgent,
  type BlackboxRole,
  type BlackboxTask,
} from "@/lib/blackbox";
import { BlackboxTaskAction, blackboxRequest } from "./blackbox-task-action";
import { onUserChange } from "@/lib/auth-user";

export function BlackboxControlCenter() {
  const [tasks, setTasks] = useState<BlackboxTask[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState("");

  const [role, setRole] = useState<BlackboxRole | null>(null);
  const [agents, setAgents] = useState<BlackboxAgent[]>([]);
  const [token, setToken] = useState("");
  const generation = useRef(0);
  async function load(signal?: AbortSignal) {
    const version = ++generation.current;
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Sign in required");
      const payload = await blackboxRequest(
        { action: "list" },
        data.session.access_token,
        signal,
      );
      if (version !== generation.current || signal?.aborted) return;
      setTasks(payload.tasks);
      setAgents(payload.agents ?? []);
      setRole(payload.role ?? null);
      setToken(data.session.access_token);
      setFailed(false);
    } catch {
      if (version !== generation.current || signal?.aborted) return;
      setTasks(null);
      setRole(null);
      setToken("");
      setAgents([]);
      setFailed(true);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const stop = onUserChange(() => {
      ++generation.current;
      setTasks(null);
      setRole(null);
      setToken("");
      setAgents([]);
      void load(controller.signal);
    });
    return () => {
      ++generation.current;
      controller.abort();
      stop();
    };
  }, []);

  const summary = directTasks(tasks ?? [], Date.now());
  const query = search.trim().toLowerCase();
  const matches = summary.prioritized.filter((task) =>
    [
      task.id,
      task.status,
      ...task.proposal.facts,
      ...task.history.map((event) => event.evidence),
      ...(task.outcomes ?? []).flatMap(Object.values).map(String),
    ].some((value) => value.toLowerCase().includes(query)),
  );
  return (
    <section aria-label="Blackbox control center">
      <h2>Blackbox control center</h2>
      <p>SYNTHETIC · Isolated staging</p>
      {failed && (
        <p role="status">
          Staging task history is unavailable for this session.
        </p>
      )}
      {!tasks && !failed && <p role="status">Loading staging task history…</p>}
      {tasks && (
        <>
          <h3>Executive summary</h3>
          <p>
            {summary.open} open · {summary.completed} completed ·{" "}
            {summary.blocked} blocked · {summary.overdue.length} awaiting
            acknowledgment for 24 hours
          </p>
          {summary.overdue.length > 0 && (
            <p>
              Escalation recommendation · Ask the assigned agent to acknowledge
              or arrange a handoff.
            </p>
          )}
          {summary.recurring.map(([kind, count]) => (
            <p key={kind}>
              Recurring pattern · {kind.replaceAll("_", " ")} ({count} tasks).
              Runbook suggestion · Compare the source timelines before revising
              procedures.
            </p>
          ))}
          <label>
            Search operational history{" "}
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          {!matches.length && <p>No matching tasks.</p>}
          {matches.map((task) => (
            <details key={task.id}>
              <summary>
                {task.proposal.priority} ·{" "}
                {task.proposal.incident.classification.replaceAll("_", " ")} ·{" "}
                {task.status.replaceAll("_", " ")}
              </summary>
              <p>
                Recommended agent {recommendAgent(task, tasks, agents)} ·
                Assigned {task.assigned_role ?? "Unassigned"} ·{" "}
                {task.proposal.approval}
              </p>
              <p>
                <a href={`/admin/operations#${task.proposal.evidenceAnchor}`}>
                  Source incident evidence
                </a>
              </p>
              <h4>Observed facts</h4>
              <ul>
                {task.proposal.facts.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
              <h4>Hypotheses</h4>
              <ul>
                {task.proposal.hypotheses.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <h4>Investigation plan</h4>
              <ul>
                {task.proposal.investigation.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
              <h4>Organizational memory</h4>
              {(task.outcomes ?? []).map((outcome) => (
                <dl key={outcome.version}>
                  {Object.entries(outcome)
                    .filter(([key]) => key !== "version")
                    .map(([key, value]) => (
                      <div key={key}>
                        <dt>
                          {key.replace(
                            /[A-Z]/g,
                            (letter) => " " + letter.toLowerCase(),
                          )}
                        </dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                </dl>
              ))}
              {role && (
                <BlackboxTaskAction
                  key={task.version}
                  task={task}
                  role={role}
                  agents={agents}
                  recommended={recommendAgent(task, tasks, agents)}
                  token={token}
                  refresh={load}
                />
              )}
              <h4>Audit history</h4>
              <ol>
                {task.history.map((event) => (
                  <li key={event.version}>
                    {event.observed_at} · {event.role} · {event.action} ·{" "}
                    {event.evidence}
                  </li>
                ))}
              </ol>
            </details>
          ))}
        </>
      )}
    </section>
  );
}

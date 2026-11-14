"use client";

import { BlackboxBriefing, BlackboxPriority } from "./blackbox-intelligence";
import { buildBlackboxIntelligence } from "@/lib/blackbox-intelligence";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
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
  const [briefing, setBriefing] = useState<{
    day: string;
    version: number;
    captured_at: string;
    summary: { tasks: { id: string; status: string; version: number }[] };
  } | null>(null);
  const [notice, setNotice] = useState("");
  const generation = useRef(0);
  async function load(signal?: AbortSignal) {
    const version = ++generation.current;
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Sign in required");
      const credentials = data.session.access_token;
      const collected: BlackboxTask[] = [];
      let after: string | undefined;
      let payload;
      do {
        payload = await blackboxRequest(
          { action: "page", after },
          credentials,
          signal,
        );
        if (version !== generation.current || signal?.aborted) return;
        collected.push(...payload.tasks);
        if (payload.next && payload.next === after)
          throw new Error("Invalid cursor");
        after = payload.next ?? undefined;
      } while (after);
      setTasks(collected);
      setAgents(payload.agents ?? []);
      setRole(payload.role ?? null);
      setBriefing(payload.briefing ?? null);
      setToken(data.session.access_token);
      setFailed(false);
    } catch {
      if (version !== generation.current || signal?.aborted) return;
      setTasks(null);
      setBriefing(null);
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
      setBriefing(null);
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

  const now = Date.now();
  const intelligence = buildBlackboxIntelligence(
    tasks ?? [],
    agents,
    now,
    Object.fromEntries((tasks ?? []).map((t) => [t.id, t.dependencies ?? []])),
  );
  const query = search.trim().toLowerCase();
  const matches = intelligence.queue.filter(({ task }) =>
    [
      task.id,
      task.status,
      ...task.proposal.facts,
      ...task.history.map((event) => event.evidence),
      ...(task.reviews ?? []).flatMap(Object.values).map(String),
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
          <BlackboxBriefing data={intelligence} now={now} />
          {role === "admin" && (
            <button
              type="button"
              onClick={async () => {
                const current = generation.current;
                try {
                  await blackboxRequest({ action: "briefing" }, token);
                  if (current === generation.current) await load();
                } catch {
                  if (current === generation.current)
                    setNotice("Briefing capture failed.");
                }
              }}
            >
              Save daily briefing
            </button>
          )}
          {notice && <p role="status">{notice}</p>}
          {briefing && (
            <details>
              <summary>
                Saved briefing · {briefing.day} Eastern · revision{" "}
                {briefing.version}
              </summary>
              <p>Captured {briefing.captured_at}</p>
              <ul>
                {briefing.summary.tasks.map((task) => (
                  <li key={task.id}>
                    <a href={`#blackbox-task-${task.id}`}>{task.id}</a> ·{" "}
                    {task.status} · version {task.version}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <label>
            Search operational history{" "}
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          {!matches.length && <p>No matching tasks.</p>}
          {matches.map((item) => {
            const { task } = item;
            return (
              <details key={task.id} id={item.anchor}>
                <summary>
                  {item.score} ·{" "}
                  {task.proposal.incident.classification.replaceAll("_", " ")} ·{" "}
                  {task.status.replaceAll("_", " ")}
                </summary>
                <p>
                  Recommended agent {item.recommended ?? "Pending review"} ·
                  Assigned {task.assigned_role ?? "Unassigned"} ·{" "}
                  {task.proposal.approval}
                </p>
                <p>
                  <a href={`/admin/operations#${task.proposal.evidenceAnchor}`}>
                    Source incident evidence
                  </a>
                </p>
                <BlackboxPriority item={item} />
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
                    recommended={
                      item.recommended ?? recommendAgent(task, tasks, agents)
                    }
                    token={token}
                    refresh={load}
                  />
                )}
                {(task.reviews ?? []).map((review) => (
                  <p key={`${review.outcome_version}:${review.revision}`}>
                    Reviewed improvement · {review.classification} ·{" "}
                    {review.effectiveness} · {review.recommendation} ·{" "}
                    {review.evidence}
                  </p>
                ))}
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
            );
          })}
        </>
      )}
    </section>
  );
}

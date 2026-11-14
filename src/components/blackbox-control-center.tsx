"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { directTasks, type BlackboxTask } from "@/lib/blackbox";

export function BlackboxControlCenter() {
  const [tasks, setTasks] = useState<BlackboxTask[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) throw new Error("Sign in required");
        const response = await fetch("/api/operations/blackbox", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${data.session.access_token}`,
          },
          body: JSON.stringify({ action: "list" }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Task history unavailable");
        const payload = await response.json();
        if (!controller.signal.aborted) setTasks(payload.tasks);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  const summary = directTasks(tasks ?? [], Date.now());
  const query = search.trim().toLowerCase();
  const matches = summary.prioritized.filter((task) =>
    [
      task.id,
      task.status,
      ...task.proposal.facts,
      ...task.history.map((event) => event.evidence),
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
                Recommended agent {task.proposal.recommendedAgent} · Assigned{" "}
                {task.assigned_role ?? "Unassigned"} · {task.proposal.approval}
              </p>
              <p>
                <a href={`#${task.proposal.evidenceAnchor}`}>
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

import assert from "node:assert/strict";
import test from "node:test";
import {
  draftAutopilotTasks,
  previewAutopilotTasks,
  replayTaskHistory,
} from "../src/lib/autopilot-tasks";
import { readPreviewPublicationIntelligence } from "../src/lib/nba-publication-intelligence-preview";
import type { SupabaseClient } from "@supabase/supabase-js";

async function fixtures() {
  const db = {
    rpc: () => {
      throw new Error("Unexpected RPC");
    },
  } as unknown as SupabaseClient;
  return (await readPreviewPublicationIntelligence(db)).fixtures;
}

test("groups duplicate findings, rejects non-fixture sources, and preserves conflicts as investigations", async () => {
  const reports = await fixtures();
  const tasks = draftAutopilotTasks([...reports, ...reports]);
  assert.deepEqual(tasks, draftAutopilotTasks(reports));
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].recommendedAgent, "Claude");
  assert.match(tasks[0].facts.join(" "), /PUBLISHED.*FAILED journal/);
  assert.ok(tasks[0].hypotheses.length > 0);
  assert.equal(tasks[0].status, "proposed");
  assert.ok(
    tasks.every((task) => task.incident.classification !== "publisher_failure"),
  );
  assert.deepEqual(
    draftAutopilotTasks(
      reports.map((report) => ({ ...report, source: "read-only source" })),
    ),
    [],
  );
});

test("assignment, acknowledgment, escalation, handoff and independent approval replay in order", async () => {
  const task = draftAutopilotTasks(await fixtures())[0];
  const at = (minute: number) => `2026-11-16T16:0${minute}:00.000Z`;
  const events = [
    {
      actor: "Administrator",
      action: "assign",
      to: "Codex",
      at: at(1),
      evidence: "Approved scope",
    },
    {
      actor: "Codex",
      action: "acknowledge",
      at: at(2),
      evidence: "Accepted scope",
    },
    {
      actor: "Codex",
      action: "escalate",
      at: at(3),
      evidence: "Coverage missing",
    },
    {
      actor: "Administrator",
      action: "handoff",
      to: "Claude",
      at: at(4),
      evidence: "Reconciliation requested",
    },
    {
      actor: "Claude",
      action: "acknowledge",
      at: at(5),
      evidence: "Accepted handoff",
    },
    {
      actor: "Claude",
      action: "submit",
      at: at(6),
      evidence: "Read-only investigation report",
    },
    {
      actor: "Administrator",
      action: "approve",
      at: at(7),
      evidence: "Independent review accepted",
    },
  ] as const;
  assert.throws(
    () => replayTaskHistory(task, [{ ...events[0], actor: "Director" }]),
    /Assignment denied/,
  );
  assert.throws(
    () =>
      replayTaskHistory(task, [events[0], { ...events[1], actor: "Claude" }]),
    /Acknowledgment denied/,
  );
  assert.throws(
    () =>
      replayTaskHistory(task, [
        ...events.slice(0, 6),
        { ...events[6], actor: "Claude" },
      ]),
    /Approval denied/,
  );
  assert.throws(
    () => replayTaskHistory(task, [events[0], { ...events[1], at: at(1) }]),
    /Invalid audit event/,
  );
  assert.throws(
    () => replayTaskHistory(task, [{ ...events[0], evidence: " " }]),
    /Invalid audit event/,
  );
  assert.equal(replayTaskHistory(task, events.slice(0, 3)).status, "blocked");
  assert.equal(replayTaskHistory(task, events.slice(0, 4)).owner, null);
  const completed = replayTaskHistory(task, events);
  assert.equal(completed.status, "completed");
  assert.equal(completed.owner, "Claude");
  assert.deepEqual(completed.history, events);
  assert.equal(task.history.length, 0);
  assert.ok(
    previewAutopilotTasks(await fixtures()).some(
      (task) => task.status === "blocked",
    ),
  );
});

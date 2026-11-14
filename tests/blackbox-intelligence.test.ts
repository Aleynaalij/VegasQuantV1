import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readPreviewPublicationIntelligence } from "../src/lib/nba-publication-intelligence-preview";
import { draftAutopilotTasks } from "../src/lib/autopilot-tasks";
import { buildBlackboxIntelligence } from "../src/lib/blackbox-intelligence";
import type { BlackboxTask } from "../src/lib/blackbox";

async function ledger(): Promise<BlackboxTask[]> {
  const { fixtures } = await readPreviewPublicationIntelligence(
    {} as SupabaseClient,
  );
  return draftAutopilotTasks(fixtures).map((proposal) => ({
    id: proposal.id,
    proposal,
    status: "proposed",
    version: 0,
    assigned_role: null,
    updated_at: "2026-11-16T15:36:00Z",
    history: [],
  }));
}
const now = Date.parse("2026-11-16T16:00:00Z");
test("advisory ranking deduplicates stable IDs and deflates contradictory or old evidence", async () => {
  const rows = await ledger();
  const first = buildBlackboxIntelligence(rows, [], now);
  assert.deepEqual(
    first,
    buildBlackboxIntelligence([...rows, ...rows].reverse(), [], now),
  );
  const conflict = first.queue.find(
    (row) => row.task.proposal.incident.evidence.integrityWarnings.length,
  );
  assert.ok(conflict);
  assert.equal(conflict.confidence, "low");
  assert.equal(conflict.factors.deadline, 0);
  assert.equal(conflict.recommended, null);
  assert.ok(
    buildBlackboxIntelligence(rows, [], now + 86400000).queue.every(
      (row) => !row.fresh && row.confidence === "low",
    ),
  );
});

test("cycles and unreviewed dependencies block recommendations", async () => {
  const rows = await ledger();
  const [a, b] = rows;
  const agents = [{ id: "fixture", role: "claude" as const }];
  assert.ok(
    buildBlackboxIntelligence(rows, agents, now).queue.every(
      (t) => t.recommended === "claude",
    ),
  );
  const blocked = buildBlackboxIntelligence(rows, agents, now, {
    [a.id]: [b.id],
    [b.id]: [a.id, "missing"],
  });
  assert.ok(
    blocked.queue.every(
      (row) =>
        row.recommended === null &&
        row.blockers.some((reason) => reason.includes("cycle")),
    ),
  );
});

test("verified memory requires matching independent approval and recurrence uses distinct slates", async () => {
  const [task] = await ledger();
  const at = "2026-11-16T15:50:00Z";
  const outcome = {
    version: 3,
    reviewedAt: at,
    sourceIncident: task.proposal.incident.id,
    verification: "independent synthetic review",
    conclusion: "Synthetic reconciliation",
    confidence: "high",
  };
  const history = [
    {
      version: 1,
      observed_at: "2026-11-16T15:40:00Z",
      role: "claude",
      action: "acknowledge",
      evidence: "Fixture",
    },
    {
      version: 2,
      observed_at: "2026-11-16T15:45:00Z",
      role: "reviewer",
      action: "reject",
      evidence: "Need corroboration",
    },
    {
      version: 3,
      observed_at: at,
      role: "reviewer",
      action: "approve",
      evidence: "Reviewed",
    },
  ];
  const related = {
    ...task,
    id: "historical",
    proposal: {
      ...task.proposal,
      incident: { ...task.proposal.incident, slate: "2026-11-15" },
    },
    status: "completed",
    version: 3,
    history,
    outcomes: [outcome],
  };
  const advisory = buildBlackboxIntelligence([task, related], [], now);
  assert.equal(advisory.resolutions.length, 1);
  assert.equal(
    advisory.queue.find((item) => item.task.id === task.id)?.recurrences,
    1,
  );
  assert.equal(advisory.improvements.length, 1);
  assert.match(advisory.improvements[0].id, /phase3-v1.*v3/);
  assert.equal(
    buildBlackboxIntelligence(
      [{ ...related, history: history.slice(0, 2) }],
      [],
      now,
    ).resolutions.length,
    0,
  );
});

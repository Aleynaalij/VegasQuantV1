import fs from "node:fs";
import { pathToFileURL } from "node:url";
const states = [
  "queued",
  "active",
  "blocked",
  "review",
  "ready",
  "merged",
  "deployed",
  "verified",
  "complete",
];
const released = new Set(["verified", "complete"]);
const integrated = new Set(["merged", "deployed", "verified"]);
const https = (s) => typeof s === "string" && /^https:\/\/[^\s]+$/.test(s);
const date = (s) =>
  typeof s === "string" &&
  /(?:Z|[+-]\d\d:\d\d)$/.test(s) &&
  Number.isFinite(Date.parse(s));
const sha = (s) => typeof s === "string" && /^[a-f0-9]{40}$/.test(s);
const overlap = (a, b) =>
  a === b ||
  (a.endsWith("/**") && b.startsWith(a.slice(0, -2))) ||
  (b.endsWith("/**") && a.startsWith(b.slice(0, -2)));
export function validateBoard(board) {
  const errors = [];
  if (board?.version !== 1 || !Array.isArray(board?.tasks))
    return ["Expected version 1 with tasks array"];
  const ids = new Set();
  for (const t of board.tasks) {
    const fail = (m) => errors.push(`${t.id || "?"}: ${m}`);
    if (!/^[A-Z]+-\d{3}$/.test(t.id || "") || ids.has(t.id))
      fail("unique task ID required");
    ids.add(t.id);
    if (!["CODEX", "CLAUDE", "OWNER"].includes(t.owner)) fail("owner required");
    if (!states.includes(t.status)) fail("invalid state");
    if (!["documentation", "application", "service"].includes(t.scope))
      fail("scope required");
    if (!date(t.updated_at) || !t.next_action?.trim())
      fail("UTC/offset timestamp and next action required");
    if (
      !Array.isArray(t.files) ||
      !t.files.length ||
      t.files.some(
        (f) => typeof f !== "string" || f.startsWith("/") || f.includes(".."),
      )
    )
      fail("repository file claims required");
    if (!Array.isArray(t.depends_on)) fail("dependencies array required");
    if (t.status === "blocked" && !t.blocker?.trim())
      fail("blocked task needs a reason");
    if (
      t.handoff &&
      (!https(t.handoff.url) ||
        !["CODEX", "CLAUDE", "OWNER"].includes(t.handoff.to))
    )
      fail("handoff needs recipient and URL");
    if (["ready", "merged", "deployed", "verified"].includes(t.status)) {
      if (
        !https(t.acknowledgment?.url) ||
        t.acknowledgment?.by !== t.handoff?.to ||
        t.acknowledgment.by === t.owner
      )
        fail("receiving peer acknowledgment required");
      if (
        !Array.isArray(t.checks) ||
        !t.checks.length ||
        t.checks.some((c) => c.outcome !== "passed" || !https(c.evidence))
      )
        fail("passing checks and evidence URLs required");
    }
    if (integrated.has(t.status) && !sha(t.merged_commit))
      fail("merged commit required");
    if (["deployed", "verified"].includes(t.status) && !https(t.deployment_url))
      fail("deployment URL required");
    if (
      t.status === "verified" &&
      (!date(t.live_verification?.at) ||
        !https(t.live_verification?.evidence) ||
        t.live_verification?.result !== "passed")
    )
      fail("timestamped successful live verification required");
    if (
      t.status === "complete" &&
      (t.scope !== "documentation" || !https(t.completion_evidence))
    )
      fail(
        "complete is for evidenced documentation-only work; production work ends at verified",
      );
  }
  const by = new Map(board.tasks.map((t) => [t.id, t]));
  for (const t of board.tasks) {
    for (const d of t.depends_on || []) {
      if (
        !by.has(d.task) ||
        d.task === t.id ||
        !["merged", "verified", "complete"].includes(d.required)
      )
        errors.push(`${t.id}: invalid dependency`);
      else if (["ready", "merged", "deployed", "verified"].includes(t.status)) {
        const state = by.get(d.task).status;
        const met =
          d.required === "merged"
            ? integrated.has(state)
            : state === d.required;
        if (!met)
          errors.push(
            `${t.id}: dependency ${d.task} has not reached ${d.required}`,
          );
      }
    }
  }
  const visit = (id, path = []) => {
    if (path.includes(id)) {
      errors.push(`${id}: dependency cycle`);
      return;
    }
    for (const d of by.get(id)?.depends_on || [])
      if (by.has(d.task)) visit(d.task, [...path, id]);
  };
  for (const id of ids) visit(id);
  for (let i = 0; i < board.tasks.length; i++)
    for (let j = i + 1; j < board.tasks.length; j++) {
      const a = board.tasks[i],
        b = board.tasks[j];
      if (
        !released.has(a.status) &&
        !released.has(b.status) &&
        a.owner !== b.owner &&
        a.files?.some((x) => b.files?.some((y) => overlap(x, y)))
      )
        errors.push(`${a.id}/${b.id}: overlapping file claims across owners`);
    }
  return [...new Set(errors)];
}
export function renderBoard(board) {
  const clean = (x) => String(x ?? "—").replace(/[|\n\r]/g, " ");
  return (
    "# Shared task board\n\nGenerated from `tasks.json`. Run `node scripts/agents/validate.mjs --write` after updates. These are reported states, not a live monitor.\n\n| Task | Owner | State | Dependencies | Handoff acknowledged | Next action |\n|---|---|---|---|---|---|\n" +
    board.tasks
      .map(
        (t) =>
          `| ${clean(t.id)} | ${t.owner} | ${t.status} | ${clean(t.depends_on.map((d) => d.task + " → " + d.required).join(", "))} | ${t.acknowledgment ? "[" + t.acknowledgment.by + "](" + t.acknowledgment.url + ")" : "Not yet"} | ${clean(t.next_action)} |`,
      )
      .join("\n") +
    "\n\nBefore changing work, read [issue #65](https://github.com/Aleynaalij/VegasQuantV1/issues/65) for newer messages. `ready` requires acknowledgment, check evidence and satisfied dependencies. `verified` additionally requires merge, deployment and live-verification evidence. This validator checks the contract, not the truth of external claims or GitHub branch protection.\n"
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const board = JSON.parse(fs.readFileSync("docs/agents/tasks.json", "utf8"));
  const errors = validateBoard(board);
  if (errors.length) {
    for (const e of errors) console.error(e);
    process.exitCode = 1;
  } else {
    const rendered = renderBoard(board),
      path = "docs/agents/TASKS.md";
    if (process.argv.includes("--write")) fs.writeFileSync(path, rendered);
    else if (fs.readFileSync(path, "utf8") !== rendered) {
      console.error(
        "Task board is stale; run node scripts/agents/validate.mjs --write",
      );
      process.exitCode = 1;
    } else
      console.log(
        "Coordination contract and task board pass. External evidence still requires review.",
      );
  }
}

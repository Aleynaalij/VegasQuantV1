import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  evidence,
  tasks,
  memories,
  searchMemory,
  resolveView,
} from "../src/components/blackbox-command/model";
test("every presented task and memory points to a synthetic evidence record", () => {
  for (const row of [...tasks, ...memories]) assert.ok(evidence[row.evidence]);
  assert.equal(new Set(tasks.map((x) => x.id)).size, tasks.length);
});
test("memory search matches classifications and returns empty rather than invented results", () => {
  assert.equal(searchMemory("hypothesis").length, 1);
  assert.equal(searchMemory("  DATE  ").length, 1);
  assert.equal(searchMemory("nonexistent").length, 0);
  assert.equal(searchMemory("").length, 3);
});
test("design has no live adapter or operational mutation", () => {
  const ui = readFileSync(
    "src/components/blackbox-command/experience.tsx",
    "utf8",
  );
  assert.doesNotMatch(ui, /\bfetch\s*\(|supabase|\.rpc\s*\(|blackboxRequest/);
  assert.match(ui, /SYNTHETIC DATA/);
  assert.match(ui, /disabled\s*>\s*Production authorization/);
  assert.match(ui, /disabled\s*>\s*Not connected/);
});
test("design route fails closed outside development and preview", () => {
  const page = readFileSync("src/app/design/blackbox-command/page.tsx", "utf8");
  assert.match(
    page,
    /NODE_ENV !== "development" &&\s*process.env.VERCEL_ENV !== "preview"\s*\)\s*notFound\(\)/,
  );
});

test("Back to the initial empty hash restores Command and unknown hashes fail safe", () => {
  assert.equal(resolveView(""), "command");
  assert.equal(resolveView("#unknown"), "command");
  assert.equal(resolveView("#operations"), "operations");
  assert.equal(resolveView("#memory"), "memory");
  assert.equal(resolveView("#security"), "security");
});

test("skip link lands on a programmatically focusable workspace", () => {
  const ui = readFileSync("src/components/blackbox-command/experience.tsx", "utf8");
  assert.match(ui, /href="#command-main"/);
  assert.match(ui, /event.preventDefault\(\); workspace.current\?\.focus\(\)/);
  assert.match(ui, /<main ref=\{workspace\} id="command-main" className=\{s.main\} tabIndex=\{-1\}>/);
});

test("audit reconciliation and acceptance never imply operational authority", () => { const ui=readFileSync("src/components/blackbox-command/experience.tsx", "utf8"); assert.match(ui,/auditMissing/); assert.match(ui,/Re-enable is refused/); assert.match(ui,/not authorization to change anything/); assert.match(ui,/Separate accounts do not establish separate people/); });

test("evidence dialog cycles keyboard focus at both edges", () => {const ui=readFileSync("src/components/blackbox-command/experience.tsx", "utf8");assert.match(ui,/event.shiftKey && document.activeElement === first/);assert.match(ui,/!event.shiftKey && document.activeElement === last/);assert.match(ui,/last.focus\(\)/);assert.match(ui,/first.focus\(\)/);});

test("CEO indicator is conditional and briefing separates situation response and decision",()=>{const ui=readFileSync("src/components/blackbox-command/experience.tsx","utf8");assert.match(ui,/needsCeoDecision = scenario === "decisionReady"/);assert.match(ui,/needsCeoDecision &&/);assert.match(ui,/<dt>Situation/);assert.match(ui,/<dt>Response/);assert.match(ui,/<dt>Your decision/);assert.match(ui,/None yet. Review is incomplete/);});

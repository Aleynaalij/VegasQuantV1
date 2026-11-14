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

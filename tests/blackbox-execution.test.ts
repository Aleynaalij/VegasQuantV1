import assert from "node:assert/strict";
import test from "node:test";
import { dryRunExecution } from "../src/lib/blackbox-execution";
test("agent and GitHub dry runs produce the same frozen synthetic CI identity", () => {
  for (const role of ["codex", "claude"] as const) {
    const result = dryRunExecution(role);
    assert.equal(result.agent, role);
    assert.equal(result.github.executed, false);
    assert.equal(result.evidence.commit, result.evidence.ciHead);
    assert.match(result.evidence.commit, /^[a-f0-9]{40}$/);
  }
});

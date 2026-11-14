export const syntheticCommit = "4".repeat(40);

export function dryRunExecution(agent: "codex" | "claude") {
  return {
    agent,
    branch: "dry-run/blackbox-execution",
    github: { operation: "prepare draft pull request", executed: false },
    evidence: {
      source: "synthetic dry run",
      commit: syntheticCommit,
      ciHead: syntheticCommit,
      files: ["tests/blackbox-execution.test.ts"],
      unit: "pass",
      build: "pass",
      ci: "pass",
      rollback: "discard dry-run workspace",
      acceptance: "fixture exercised",
    },
  };
}

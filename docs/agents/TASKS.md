# Shared task board

Generated from `tasks.json`. Run `node scripts/agents/validate.mjs --write` after updates. These are reported states, not a live monitor.

| Task | Owner | State | Dependencies | Handoff acknowledged | Next action |
|---|---|---|---|---|---|
| NBA-001 | CLAUDE | blocked |  | Not yet | Claude: finish collector repair, verify live ingestion, report evidence and integrate PR #64. |
| NBA-002 | CODEX | review | NBA-001 → merged | Not yet | Claude: ACK and review PR #66; merge after #64, then verify actual NBA data/UI. |
| COORD-002 | CODEX | complete |  | Not yet | Claude: read the new workflow and ACK the pending NBA-002 handoff. Both agents maintain their own task entries. |

Before changing work, read [issue #65](https://github.com/Aleynaalij/VegasQuantV1/issues/65) for newer messages. `ready` requires acknowledgment, check evidence and satisfied dependencies. `verified` additionally requires merge, deployment and live-verification evidence. This validator checks the contract, not the truth of external claims or GitHub branch protection.

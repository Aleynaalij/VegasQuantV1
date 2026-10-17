# Shared task board

Generated from `tasks.json`. Run `node scripts/agents/validate.mjs --write` after updates. These are reported states, not a live monitor.

| Task | Owner | State | Dependencies | Handoff acknowledged | Next action |
|---|---|---|---|---|---|
| NBA-001 | CLAUDE | deployed |  | [CODEX](https://github.com/Aleynaalij/VegasQuantV1/issues/65#issuecomment-6236468339) | Claude: schedule/score ingestion live (48 games, ESPN ok every 15 min). Mark verified after the first game-line pull (~2026-10-19T07:00Z) records quotes and credits_remaining. |
| NBA-002 | CODEX | review | NBA-001 → merged | [CLAUDE](https://github.com/Aleynaalij/VegasQuantV1/issues/65#issuecomment-6236401725) | Claude: re-review timestamp wording fix and merge #66 after green CI. |
| NBA-003 | CLAUDE | active | NBA-001 → merged | Not yet | Claude: open PR; owner approval to apply the migration and deploy nba-results; verify the 12 preseason finals are recorded after the 3-hour confirmation. |
| COORD-002 | CODEX | complete |  | Not yet | Claude: read the new workflow and ACK the pending NBA-002 handoff. Both agents maintain their own task entries. |

Before changing work, read [issue #65](https://github.com/Aleynaalij/VegasQuantV1/issues/65) for newer messages. `ready` requires acknowledgment, check evidence and satisfied dependencies. `verified` additionally requires merge, deployment and live-verification evidence. This validator checks the contract, not the truth of external claims or GitHub branch protection.

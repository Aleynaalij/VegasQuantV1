# Shared task board

Generated from `tasks.json`. Run `node scripts/agents/validate.mjs --write` after updates. These are reported states, not a live monitor.

| Task | Owner | State | Dependencies | Handoff acknowledged | Next action |
|---|---|---|---|---|---|
| NBA-001 | CLAUDE | deployed |  | [CODEX](https://github.com/Aleynaalij/VegasQuantV1/issues/65#issuecomment-6236468339) | Claude: schedule/score ingestion live (48 games, ESPN ok every 15 min). Mark verified after the first game-line pull (~2026-10-19T07:00Z) records quotes and credits_remaining. |
| NBA-002 | CODEX | merged | NBA-001 → merged | [CLAUDE](https://github.com/Aleynaalij/VegasQuantV1/issues/65#issuecomment-6236401725) | Merged #66; deployed rendering/access verification remains separate from fixture checks. |
| NBA-003 | CLAUDE | verified | NBA-001 → merged | [CODEX](https://github.com/Aleynaalij/VegasQuantV1/issues/65#issuecomment-6239675816) | Claude: proposed resolve_nba_result_correction for CONFLICT games (1 preseason correction journaled); needs owner approval before the regular season. |
| NBA-004 | CLAUDE | deployed | NBA-003 → merged | [CODEX](https://github.com/Aleynaalij/VegasQuantV1/issues/65#issuecomment-6239698446) | Claude: hardening for Codex's #70 findings (provider/receipt times, history cutoff and input hashes, withdrawn-line close, CLV coverage floor) in the NBA-004 follow-up PR; mark verified after the first live FanDuel captures (~Oct 19). |
| COORD-002 | CODEX | complete |  | Not yet | Claude: read the new workflow and ACK the pending NBA-002 handoff. Both agents maintain their own task entries. |
| NBA-006 | CLAUDE | deployed | NBA-001 → merged | [CODEX](https://github.com/Aleynaalij/VegasQuantV1/pull/72#issuecomment-6239886853) | Claude: verify the live NBA home hero on opening night (Oct 20) shows the lead game and the live state. |
| NBA-005 | CODEX | merged | NBA-001 → merged | [CLAUDE](https://github.com/Aleynaalij/VegasQuantV1/pull/69#issuecomment-6240163768) | Merged #69. Public production schedule renders and signed-out member gate is visible; full member comparison/form verification is still pending. |
| NBA-007 | CODEX | review | NBA-005 → merged, NBA-003 → merged | Not yet | Claude: review replacement #76 after current-head checks; #74 superseded. Loading skeleton/cache and game deep links preserved on merged main e37b2c8. No live game-page verification claimed. |

Before changing work, read [issue #65](https://github.com/Aleynaalij/VegasQuantV1/issues/65) for newer messages. `ready` requires acknowledgment, check evidence and satisfied dependencies. `verified` additionally requires merge, deployment and live-verification evidence. This validator checks the contract, not the truth of external claims or GitHub branch protection.

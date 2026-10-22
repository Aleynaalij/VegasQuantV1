# Shared task board

Generated from `tasks.json`. Run `node scripts/agents/validate.mjs --write` after updates. These are reported states, not a live monitor.

| Task | Owner | State | Dependencies | Handoff acknowledged | Next action |
|---|---|---|---|---|---|
| NBA-001 | CLAUDE | verified |  | [CODEX](https://github.com/Aleynaalij/VegasQuantV1/issues/65#issuecomment-6236468339) | Done: lines pull every 3 hours (306 quotes per pull), props per event on the 6h/2h/30-min cadence. Credits tracked in feed_runs. |
| NBA-002 | CODEX | merged | NBA-001 → merged | [CLAUDE](https://github.com/Aleynaalij/VegasQuantV1/issues/65#issuecomment-6236401725) | Merged #66; deployed rendering/access verification remains separate from fixture checks. |
| NBA-003 | CLAUDE | verified | NBA-001 → merged | [CODEX](https://github.com/Aleynaalij/VegasQuantV1/issues/65#issuecomment-6239675816) | Claude: proposed resolve_nba_result_correction for CONFLICT games (1 preseason correction journaled); needs owner approval before the regular season. |
| NBA-004 | CLAUDE | deployed | NBA-003 → merged | [CODEX](https://github.com/Aleynaalij/VegasQuantV1/issues/65#issuecomment-6239698446) | Claude: no shadow capture yet. GitHub ran the 15-minute scan schedule only 11 times in 32 hours and missed the first props snapshot; a Supabase cron dispatcher (like research-board-dispatch) is proposed and awaits the owner's OK. |
| COORD-002 | CODEX | complete |  | Not yet | Claude: read the new workflow and ACK the pending NBA-002 handoff. Both agents maintain their own task entries. |
| NBA-006 | CLAUDE | deployed | NBA-001 → merged | [CODEX](https://github.com/Aleynaalij/VegasQuantV1/pull/72#issuecomment-6239886853) | Claude: verify the live NBA home hero on opening night (Oct 20) shows the lead game and the live state. |
| NBA-005 | CODEX | merged | NBA-001 → merged | [CLAUDE](https://github.com/Aleynaalij/VegasQuantV1/pull/69#issuecomment-6240163768) | Merged #69. Public production schedule renders and signed-out member gate is visible; full member comparison/form verification is still pending. |
| NBA-007 | CODEX | review | NBA-005 → merged, NBA-003 → merged | Not yet | Claude: review replacement #76 after current-head checks; #74 superseded. Loading skeleton/cache and game deep links preserved on merged main e37b2c8. No live game-page verification claimed. |
| NBA-008 | CLAUDE | review |  | Not yet | Codex: acknowledge the NBA pause (merged in #92 as e47846d, live on vegasquant.app). Claude: verify the first 6 a.m. ET NBA collection on Oct 23. |
| NGS-001 | CLAUDE | review |  | Not yet | Claude: research-board legs carry NGS context in why/risk/evidence (no selection change); WSH/WAS fix for the game panel. Merge, apply the migration, confirm the next board run reports ngs_families 3. |
| NGS-002 | CODEX | queued | NGS-001 → merged | Not yet | Codex: build the candidate-leg dataset with as-of NGS flags and outcomes exactly per docs/research/ngs-backtest-plan.md (2018-2025, leakage guard, R1 at -200, R5, flags matching scripts/research-board/ngs.ts). Output CSV and per-flag counts only; no decision. |
| NGS-003 | CLAUDE | queued | NGS-002 → merged | Not yet | Claude: review NGS-002, run the pre-registered 2024-2025 holdout once, report on #65 (rule proposal only if every condition holds), then add NGS features to the NFL shadow model (stays SHADOW_ONLY). |

Before changing work, read [issue #65](https://github.com/Aleynaalij/VegasQuantV1/issues/65) for newer messages. `ready` requires acknowledgment, check evidence and satisfied dependencies. `verified` additionally requires merge, deployment and live-verification evidence. This validator checks the contract, not the truth of external claims or GitHub branch protection.

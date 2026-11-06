# Running-clock timeout cells v0.2.20 — frozen before fit (Claude)

Base: v0.2.11 at `f5d1bc0`, reproduced independently (`diagnostics/reproduction-0.2.11-claude.json`):
refit model hash matches, and the reloaded 10,000-run batch differs only in `generated_at` and
`runtime_seconds`. v0.2.12–v0.2.13.1 (`3d98499`) were never published and are not used,
reconstructed or compared as originals; their reported failures stand as reported. Version numbers
0.2.12–0.2.19 stay reserved for that unrecovered work.

## Finding addressed
v0.2.11 fails timeouts (7.3488 vs 7.7823) and late timeout-followed continuing plays (1.995 vs
corrected 4.4834). The engine already has a separate running-clock decision point (`couple_stop`,
after a late continuing run/completion), but it reads the same pooled timeout table as every
pre-snap decision. In the source, timeouts after running-clock plays are 3–4× the stopped-clock
rates in every late band (#144 6484160451).

## Change (one variable: how timeout decisions are estimated and keyed)
1. **Two opportunity families**, defined in `timeout_cells.py` and shared by the support audit and
   the fit:
   - **RUNNING:** a late continuing run or completion: Q2/Q4, ≤300 s, scrimmage, not a TD, and the
     next scrimmage context within 8 rows has the same possession. These are exactly the plays
     `couple_stop` handles. The outcome is a timeout on that row or an immediately following
     `no_play` timeout row (the corrected 9th-diagnostic definition).
   - **STOPPED:** every pre-snap opportunity `fit_timeouts` counts today, except (a) a snap whose
     decision a no-call running play already consumed (in the sim the next pre-snap draw is skipped
     because `decision_read_state == s`), and (b) timeout rows attributed to a running play.
2. **Keyed by the pre-play state** for RUNNING. Budgets, score and possession are unchanged by a
   continuing play, so the decision no longer depends on a projected post-play clock: the
   candidate-clock lookahead bias is removed from this path. The stopped-duration draw and the queued
   timeout after a call are unchanged.
3. **Categorical common cells.** Each cell counts opportunities `n` and calls by `offense` and
   `defense` for one eligibility config (`both`, `offense`-only, `defense`-only budgets). Both rates
   come from one count, so `p_off + p_def ≤ 1` always holds. A role without a timeout never calls.
4. **Lookup order** (minimum 30 opportunities, first supported cell wins):
   `band|elig|fine-lead|field` → `band|elig|fine-lead` → `band|elig|coarse-lead` → `band|elig` →
   pre-declared coarsened floors:
   - RUNNING: `last10|last30 → le30 → le120 → le300`, `last120 → le300`, `last300 → le300`, always
     within the same half;
   - STOPPED late bands: widen within the same half (`le30`, `le120`, `le300@h2`);
   - STOPPED normal bands: `normal@qN → normal@h1|h2 → normal@all → normal@all~role`, where `~role`
     is the eligible role's marginal rate over normal-band opportunities in which it had a timeout,
     whatever the other side's budget. Normal bands only.
   - Coarsening never crosses family (clock state) or eligibility config, except the declared
     `~role` last resort. Every coarsened lookup and every `~role` use is counted in the batch.
5. **Support, audited before fit** (`diagnostics/running-clock-support-0.2.20.json`, source
   `0c69a71e…`): after the declared chains, **zero unresolved floors in either family**. 4,938
   running opportunities with a budget (1,215 calls); 34,220 stopped opportunities (830 calls).
   An unsupported lookup in the sim still raises and is counted; nothing is clamped or normalized.

Unchanged: play contexts and templates, stop-duration and non-followed runoff tables, clock rules,
OT using h2 support, scoring corrections, the reload fix and phantom-stop correction.

## Acceptance (unchanged)
- 10,000 runs, seed 1701, old OT, the full requested denominator.
- All four scoring gates and all five diagnostics, with the corrected source counter for the 9th,
  at the existing 3-SE tolerances. Zero failed runs and zero unsupported samples.
- Saved-model reload reproduces the batch; a test reloads a fitted model and compares traces.
- Reported alongside: band trace on a 1,000-game prefix, kneel audit, coarsening and `~role`
  counts, and the already-inspected 2023 CRPS (context only, not a gate).
- If any check fails, v0.2.20 is preserved as a failure. No retuning, reseeding, threshold change
  or survivor-only reporting. A follow-up is a new frozen version.

No team/player coupling, model approval, forecasts, member release, database writes or
notifications.

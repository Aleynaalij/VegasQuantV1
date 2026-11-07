# Role-marginal timeout floor fix v0.2.24 — frozen before fit (Claude)

Base: v0.2.23, model `63906f6b…6d89`. Its accounting package is `artifacts/v0.2.23-accounting`
(head `67ce290`), which Elo re-audited and passed for accounting. Both v0.2.23 packages stay as
published, and their results stand as reported.

## Finding (Elo, re-audit of `67ce290`; confirmed against the source)
`RUNNING_CLOCK_PROTOCOL.md` §4 declares `normal@all~role` as "the eligible role's marginal rate
over normal-band opportunities in which it had a timeout, whatever the other side's budget".
The implementation is wrong for the `both` config:
- `coarse_floors` appends the eligibility config, so a both-eligible stopped chain ends in
  `normal@all~role|both`.
- `residual_cells` reads the role from that key as `both`. It then counts calls where
  `outcome == 'both'`, which is never true, so the cell always has zero calls.
- The fitted cell is `n = 29,564` with zero offense and zero defense calls. The 2022 source over
  the same 29,564 both-eligible normal-band opportunities has **350 offense and 154 defense
  calls** (`diagnostics/role-marginal-source-0.2.23.json`, from `role_marginal_check.py`).
- In the v0.2.23 batch, 2,449 stopped decisions read this cell
  (`timeout_terminal_floor:stopped:normal@all~role|both`), each with a timeout probability of
  zero.

The `offense` and `defense` cells are correct: offense 351 / 29,588 and defense 154 / 29,601.

## Change (one variable: the both-eligible role-marginal floor)
1. **The definition is unchanged; the estimator now follows it.** For a both-eligible decision
   that reaches the role-marginal floor, both roles are eligible, and each uses its own declared
   marginal:
   - `p_offense = offense / n` from `normal@all~role|offense`
   - `p_defense = defense / n` from `normal@all~role|defense`

   Both cells must have at least 30 opportunities, or the lookup is unsupported and raises, as
   before. `p_offense + p_defense ≤ 1` is checked.
2. **Fit.**
   - `residual_cells` no longer builds a `~role|both` cell, so the model has none.
   - It always writes `~role|offense` and `~role|defense`.
   - A both-eligible opportunity counts as resolved at this floor when both role cells are
     supported. This changes only the coverage count of unresolved opportunities.
3. **Runtime.** `Sampler.timeout_rates` composes the two role cells for the
   `normal@all~role|both` key. It is counted as `role_marginal_timeout_cell:both`, on top of the
   existing `role_marginal_timeout_cell` and terminal-floor counters.
4. `MODEL_ID` becomes `vq-empirical-game/0.2.24`.

Unchanged: every other cell, chain, play context, clock rule, two-minute warning, last300 context
and accounting counter.

## Acceptance (unchanged bar)
- 10,000 runs, seed 1701, old OT, the full requested denominator.
- All four scoring gates and all five diagnostics at the existing 3-SE tolerances. Zero failed
  runs and zero unsupported samples.
- `verify_package --source` passes.
- A saved-model reload reproduces the batch: the refit hash matches, and the reloaded batch
  differs only in `generated_at` and `runtime_seconds`.
- Reported alongside:
  - the full §6 accounting (`accounting.py`)
  - the frozen budget, late-mix and elapsed diagnostics
  - the already-inspected 2023 calibration, as context only
- Regression tests:
  - a synthetic both-eligible fixture with offense and defense calls must give non-zero rates
    equal to the role marginals
  - the model must have no `~role|both` cell
  - the source check must reproduce 350 / 154
- If any check fails, v0.2.24 is preserved as a failure. No retuning, reseeding, threshold change
  or survivor-only reporting.

No team/player coupling, model approval, forecasts, 2024 download, merge, deploy or database
writes. TEAM_LAYER_PROTOCOL §0 stays empty until an independent review of this fix passes.

## Result (2026-11-07, appended after the run; nothing above was changed)
Package `artifacts/v0.2.24`, built from commit `ad17555` on source `0c69a71e…`:
- **Runs and verification:**
  - 10,000 / 10,000 complete, 0 failed, 0 unsupported samples.
  - `verify_package --source`: 6 files and 29 implementation hashes verified, with the rules
    replay verified.
- **Saved-model self-check** (`diagnostics/reproduction-0.2.24-selfcheck.json`):
  - the refit hash `f0b8ab26b0605ad50e0212b23b3186f7a78eeced281989e2655505950977512d` matches
  - the reloaded 10,000-run batch differs only in `generated_at` and `runtime_seconds`
- **All nine checks PASS:**

  | check | v0.2.24 | source | tolerance |
  |---|---:|---:|---:|
  | total points | 44.793 | 43.764 | 2.546 |
  | touchdowns | 5.0156 | 4.8524 | 0.394 |
  | made FGs | 3.2706 | 3.3321 | 0.302 |
  | punts | 7.7705 | 8.1181 | 0.584 |
  | timeouts | 7.6409 | 7.7823 | 0.390 |
  | FG attempts | 3.8552 | 3.9188 | 0.322 |
  | late FG attempts | 0.4403 | 0.4871 | 0.110 |
  | late decisions | 1.7562 | 2.0996 | 0.375 |
  | late timeout-followed continuing plays | 4.2451 | 4.4834 | 0.327 |

- **The fix in the batch:**
  - The model has no `~role|both` cell. The role cells are offense 351 / 29,588 and defense
    154 / 29,601.
  - 2,517 decisions used the composed both-eligible floor (`role_marginal_timeout_cell:both`).
    The v0.2.23 batch had 2,449 lookups of the zero cell.
  - This is lookup exposure, not a measured effect. Because the random draws diverge after the
    first changed decision, no per-game effect is attributed to the fix.
- **Accounting** (`diagnostics/accounting-0.2.24.json`, all paths as in v0.2.23):
  - band-preserved 327,875; same-band half-pooled 265; last300 fallback 2,828
  - two-minute-warning snaps 19,233; warning-censored resampled 14,860, unresolved 378
  - terminal full-count lookups 15,533; coarsened timeout cells 35,608
  - thin draws: play 50,190, stop-duration 47,650, runoff 1,268
  - missing eligible stop durations 1,824
- **Frozen diagnostics** (`*-0.2.24.json`):
  - Q4 121–300 s running opportunities 5.53 per game against 5.59 in the source
  - Q4 ≤120 s running opportunities 2.884 per game against 3.033, with 0.344 calls per
    opportunity against 0.387
  - kneels in the last 10 s, still too frequent: 0.51 and 0.42 per game against 0.20 and 0.08
    (reported, not tuned)
- **2023 calibration, context only:**
  - margin CRPS 8.1839 against 8.0656 historical, 95% CI on the difference [−0.032, 0.265]
  - total CRPS 7.6497 against 7.5984, CI [−0.044, 0.140]
  - home-win Brier 0.2514
  - **No superiority shown.**

This is a self-check by the builder. TEAM_LAYER_PROTOCOL §0 stays empty until an independent
review of v0.2.24 passes and the base is pinned in a separate commit.

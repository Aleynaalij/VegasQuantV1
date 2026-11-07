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

# v0.2.23 accounting revision — frozen before any rerun (Claude)

Responds to Elo's independent audit of v0.2.23 (#237, review 5809096163, head `d163af0`).
The audit reproduced all nine gates, the refit model hash
`63906f6b7bbbf911bed5b159da84ab815fa4d867bf59c9b8671ad6dbccac6d89` and the saved-model batch
byte for byte. It withheld the AUDIT_PLAN §6 pass because the approximation accounting is
incomplete. This revision changes **counters only**: no fit, sampling rule, random draw, threshold
or gate changes. `artifacts/v0.2.23` stays as published and is not overwritten.

## Findings addressed
1. **Play-context backoff dropped from the batch.** `Sampler.draw` counted the chosen context's
   length under an integer key, and `run_batch` keeps only string keys, so the full batch had no
   play-context backoff counts.
2. **Clock/half labels wrong for the last300 fallback.** Every `last300_normal_fallback` draw was
   also counted as `clock_preserved_samples` and `half_pooled_fallback`, though the fallback uses
   a normal-clock context and drops the band.
3. **Uncounted paths.**
   - two-minute-warning crossings snapped to 120 by `state.transition`
   - the terminal full-count exception in `timeout_cells.residual_cells` (amendment A1 of
     `RESIDUAL_BACKOFF_PROTOCOL.md`)
   - the remaining clipping and spot-boundary paths

## Change (labels and counters only)
1. **Play-context paths.** Each draw records `play_context:<branch>:<path>`, where:
   - `branch` is `late` (a non-normal band whose own context was used), `last300_normal` (the
     declared v0.2.23 fallback) or `normal`.
   - `path` names the dimensions dropped:
     - late: `exact`, `drop:distance`, `drop:down+distance`, `floor:coarse_lead`,
       `floor:coarse_lead+goal_zone`, `pooled_half:coarse_lead`,
       `pooled_half:coarse_lead+goal_zone`
     - normal and last300_normal: `exact`, `drop:lead`, `drop:distance+lead`,
       `drop:down+distance+lead`, `floor:phase+clock+zone`

   When two definitions produce the same key, the first one wins, matching the order in
   `context_options`. `play_context_length:<n>` is kept alongside as a string key. The integer key
   is removed.
2. **Band labels.** A draw in a non-normal band that used its own band's context counts as
   `band_preserved_samples`, and then as either `band_half_preserved_samples` or
   `band_half_pooled_fallback`. A `last300_normal_fallback` draw counts only under that label. The
   old `clock_preserved_samples`, `half_pooled_fallback` and `half_preserved_samples` keys are
   retired, and they stay in older artifacts as published.
3. **Two-minute-warning snaps.** In Q2, Q4 and OT, an action that starts above 120 s and would end
   below 120 s counts as `two_minute_warning_snapped`. The seconds it restores are summed in
   `two_minute_warning_seconds_restored`. Warning-censored resampled and unresolved gaps are
   separate events and keep their own counters.
4. **Terminal full-count usage.** A timeout lookup that reads the last key of its chain counts as
   `timeout_terminal_floor:<family>:<key>`. `accounting.py` recomputes, deterministically from the
   source, which terminal keys took their full count under amendment A1. It reports their usage as
   `terminal_full_count_lookups` by summing those keys.
5. **Clipping and boundary paths.** Each is counted when it actually changes a value:
   - `elapsed_clipped_to_clock`: a template's elapsed time above the remaining clock
   - `spot_clamped`: a template spot mapped outside 0–99
   - `yards_clamped_to_field`: scrimmage yards beyond the goal lines
   - `runoff_clipped_to_clock`: a non-followed runoff above the remaining clock
   - `penalty_half_distance`: the half-the-distance rule applied in `state.transition`

   Disposition of the paths that are not counted:
   - the `couple_stop` projection clip changes no committed value
   - the missed-FG spot `min(80, …)` is the NFL rule
   - the penalty distance `max(1, …)` cannot bind, because `y < distance` on that branch
   - the survival monotone ceiling and mass floor are fit-time estimators, already described in
     the model
   - the defensive-TD elapsed floor `max(1, …)` is a fit-time template rule

## Acceptance
- Rebuilt with the same command as v0.2.23 into `artifacts/v0.2.23-accounting`:
  10,000 runs, seed 1701, old OT.
- The refit model hash must equal `63906f6b…6d89`.
- Every batch field must be byte-identical to `artifacts/v0.2.23` except:
  - `generated_at`
  - `runtime_seconds`
  - `coverage.censoring`, which gains the new keys and loses the three retired ones
  - the package's archived runtime source and implementation hashes

  Any other difference fails this revision. It is then reported, nothing is re-tuned, and the
  existing counts stand as they are.
- Relabelling must reconcile exactly:
  - `band_preserved_samples + last300_normal_fallback` = old `clock_preserved_samples`
  - `band_half_pooled_fallback + last300_normal_fallback` = old `half_pooled_fallback`
  - `band_half_preserved_samples` = old `half_preserved_samples`
  - `play_context:*` counts sum to the number of play draws
- `verify_package` passes on both the new package and the unchanged v0.2.23 package.
- Unit tests cover each new counter. An aggregation test checks that `run_batch` keeps the
  play-context counts.
- Published with the new package: `diagnostics/accounting-0.2.23.json` (every §6 path and its
  full-batch count), plus the frozen budget, late-mix and elapsed diagnostics re-run on it.

No team/player coupling, model approval, forecasts, 2024 download, merge, deploy or database
writes. TEAM_LAYER_PROTOCOL §0 stays empty until a re-audit passes.

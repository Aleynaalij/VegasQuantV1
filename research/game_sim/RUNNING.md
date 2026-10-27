# Runnable research engine — v0.1.1

The engine now runs full regulation games and regular-season overtime with seeded
empirical sampling, replay selection and batch distributions. It is an operational
**league-level research baseline**, not a finished current-matchup predictor.
Do not remove its blockers or expose it as approved picks.

## Completed code

- Accepted no-play/dead-ball penalty enforcement, half-distance abstraction,
  automatic first downs/loss of down, recovered fumbles, turnovers, blocked kicks,
  defensive/kick-return TDs, onside recovery position, timeout budgets and halftime
  reset. Actions are normalized inputs, not an inference of compound NFL penalties.
- Old opening-TD sudden-death and newer both-possession **regular-season** ten-minute
  overtime; kickoff-return TD, second-team conversion and clock-expiry cases tested.
- 2022 empirical phase/down/distance/field/clock/script templates with transparent
  backoff, missing-data exclusions and illegal-template rejection counts.
- Stable seeded batches, actual/failed counts, ties, histograms, quantiles and a
  declared typical replay (minimum L1 team-score median distance; lowest seed tie).
- Separate-RNG workload scenario allocator: caller supplies reviewed identities,
  explicit weights and timestamped hashed sources. Unknown availability is rejected.
  Ordinary credited stats reconcile; incomplete target/compound-fumble/lateral stats
  stay unsupported. Scenario assumptions are not independent proof of clearance.
- Retrospective CRPS/Brier/80%-interval diagnostics and game-resampled intervals.
  No betting-price benchmark is guessed from a spread or total point line.
- Research render handoff, explicit before/after quarter clocks and extended play
  types. It is **not** silently mapped into the existing demo-only0.1 adapter.

## Reproduce

```
python -m unittest discover -s tests/game_sim -v
python -m research.game_sim.batch --model research/game_sim/artifacts/v0.1.1/model.json.gz --runs 10000 --seed 1701 --output /path/batch.json
python -m research.game_sim.render --batch /path/batch.json --output /path/research-render.json
python -m research.game_sim.evaluate --batch /path/batch.json --training /path/play_by_play_2022.csv.gz --calibration /path/play_by_play_2023.csv.gz --output /path/diagnostics.json
```

To reproduce fitting, add `--train /path/play_by_play_2022.csv.gz` and write a new
`--model /path/model.json`. Calibration file2023 is never fitted. The source downloader
and exact hashes are in the milestone1 audit. Workload scenarios are opt-in using
`--workload-context /path/reviewed-scenario.json`; never populate them with guesses.

## Artifact/results

`artifacts/v0.1.1/manifest.json` identifies the actual canonical model bytes and
compressed bytes, source audit and implementation hashes. `benchmark-summary.json`
contains exact run counts/runtime/coverage. Compressed full benchmark, per-game
calibration diagnostics and renderer output accompany it. Runtime is measured on
this machine, not a phone or hosted service promise. JSON object key ordering and
prepared-table caching do not change seeded outcomes (regression tested).

The initial0.1 batch revealed fit/save/reload key-order instability; it was corrected
in0.1.1 before adopting an artifact. Original hashes/summary are preserved in
`superseded-summaries.json`. No calibration-driven parameter tuning occurred.
A subsequent rare OT kickoff-return correction was tested and the final10k batch
was regenerated; prior benchmark metadata is preserved, not called final output.

## What this does NOT establish

The2023 calibration diagnostics do **not** show an advantage over the historical
league baseline (especially total-score CRPS). Keep that failure visible. No
2024/2025/2026 holdout has been downloaded/scored by this experiment and no current
matchup forecast is published or journaled. Source data is historical; conditional
sampling and operational correctness do not make probabilities calibrated.

Current-team offensive/defensive adjustments, current verified player workload,
full compound penalty/return-credit semantics, postseason OT, current-season
kickoff distribution and model calibration/qualification are not complete.
Do not claim this league baseline answers those questions. Current-game support
requires that work and documented current inputs; historical team/player labels
are never current roster/availability evidence. The journal exists separately,
but this baseline cannot truthfully satisfy its complete pregame-source contract.

No wagers, prices, provider settings, platform publications, notification triggers,
model approvals or bankroll/result ledgers were changed.

## Rules references

NFL Football Operations2025 rulebook, including Rule16 regular-season overtime:
https://operations.nfl.com/media/ntif5hxb/2025-nfl-rulebook-final.pdf
https://operations.nfl.com/rules-officiating/featured-rules
Historical kickoff samples are retained rather than silently calling them current
2025/2026 dynamic-kickoff placement. This normalized kernel is not a claim to
implement every exception in the NFL rulebook.

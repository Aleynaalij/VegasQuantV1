# Two-minute warning v0.2.22 — frozen before fit (Claude)

Base: v0.2.21 (`artifacts/v0.2.21`, a preserved failure). One change: the engine gets the NFL
two-minute warning, and fitting stops treating warning-truncated gaps as ordinary runoff.

## Finding
- `diagnostics/late-elapsed-0.2.21.json` (frozen in `elapsed_diagnostic.py` before it ran): in Q4
  121–300 s, no-timeout snap-to-snap gaps are far longer in the sim. Completions take 34.8 s vs 23.1
  in the source, runs 36.7 vs 30.7, sacks 36.7 vs 28.1. Inside 120 s they match closely
  (completions 18.2 vs 17.5, runs 26.7 vs 27.5).
- The engine has no two-minute warning (`state.py` and `model.py` carry no such rule).
- In the 2022 source, play sequences cross 2:00 in Q2 and Q4 542 times (2.0 per game). In 455 of
  them (84%) the next row sits at exactly 120 s: the clock stopped at the warning.
- The sim runs through 2:00, burns extra clock, loses late snaps and therefore loses timeout
  opportunities. This is the loop identified in the v0.2.20 diagnostics.

## Change
1. **Kernel (`state.transition`).** In periods 2, 4 and 5, when the clock before an action is above
   120 and the action's elapsed would take it below 120, the clock after the action is 120.
   - Plays that end inside the final two minutes on their own are approximated as stopping at 2:00.
     About 16% of source crossings land below 120; this is disclosed.
   - No timeout is charged. Scores, possession and phase are unchanged by the rule.
2. **Fit: warning-censored gaps.** A source play in period 2, 4 or 5 snapped at clock > 120, whose
   next row in the same period is at exactly 120, has an elapsed truncated by the warning. Such a
   play:
   - keeps its play outcome as a template, marked `warning_censored`;
   - is excluded from the stopped-duration (`stop_tables`) and non-followed runoff (`runoff_tables`)
     tables, and is counted.
3. **Sampler.** When a `warning_censored` template is drawn at a state where `clock − elapsed > 120`
   (it would not reach the warning there), its elapsed is a lower bound. It is replaced by a draw
   from the chosen context table's non-censored templates of the same kind with elapsed ≥ the
   censored value, weighted by count. This is the same conditional-survival approach as the TD
   censoring correction. If none exist, the censored value is kept and counted as
   `warning_censored_unresolved`. Otherwise the kernel's warning applies.

Unchanged: v0.2.21 timeout cells (residual), opportunity definitions, keys, play contexts, all other
tables and rules, the gates and the 9th diagnostic's source counter.

## Acceptance (unchanged)
10,000 runs, seed 1701, old OT, all nine checks at the existing tolerances, zero failed or
unsupported runs, and saved-model reload. Reported alongside: warning crossings per game (sim vs
source), the censored-template count, resample and unresolved counts, and the late elapsed table
re-run on the new package. A failure is preserved; no retuning.

## Result (2026-11-07, appended after the run; nothing above was changed)
Package `artifacts/v0.2.22`, built from `2a4a242`. `verify_package`: 6 files and 24 implementation
hashes verified against the source. 10,000 / 10,000 complete, 0 failed, 0 unsupported.
- Scoring gates PASS: total 44.7526, TD 5.0004, FG 3.2934, punts 7.9502. FG attempts 3.8859, late
  FG 0.4314 and late decisions 1.7866 PASS.
- **Timeouts PASS for the first time:** 7.4596 vs 7.7823 (difference −0.323, tolerance 0.390).
  v0.2.21: 7.0657.
- **FAIL** late timeout-followed continuing plays **4.0997** vs 4.4834 (difference −0.384,
  tolerance 0.327). v0.2.21: 3.7703.
- 8 of 9 checks pass. v0.2.22 does not meet TEAM_LAYER_PROTOCOL §0 and is preserved as a failure.
  No retuning, reseeding or threshold change.
- Counters: 41,284 running and 33,312 stopped timeout calls; 178,065 running decisions (17.8 per
  game; source 18.2); 8,727 warning-censored gaps resampled and 178 unresolved (kept and counted).
- Old packages still verify under their own archived kernels (v0.2.10.1, v0.2.11 and v0.2.21
  replays verified).

2023 already-inspected CRPS, context only: margin 8.1827 vs 8.0656, CI [−0.032, 0.265]; total
7.6513 vs 7.5984. No superiority shown.

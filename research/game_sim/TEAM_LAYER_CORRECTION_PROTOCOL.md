# Team layer v0.3.1 correctness rerun — frozen before any code change (Claude)

Responds to Elo's independent review of the v0.3.0 packet (#237 comment 6706784974, head
`62bb157`). The v0.3.0 package (`artifacts/team-0.3.0`) and its result section in
`TEAM_LAYER_PROTOCOL.md` are preserved unchanged as a **superseded, research-acceptance-withheld**
result.

2024 outcomes are now known. This plan therefore changes only what the frozen protocol already
required. It does not change any coefficient rule, threshold, seed, run count, metric, comparator,
bootstrap or decision rule. Whatever the corrected run shows is reported: a failure stays a failure,
and the A-pass is not recovered by tuning.

## Findings addressed
1. **Gain population (scientific blocker).** §2 restricts gain evidence to G_run ∪ G_pass as §3
   defines them. The v0.3.0 `team_layer/data.py` excluded only interceptions and lost fumbles, so
   **recovered fumbles and enforced run/pass penalties** entered the gain ridge. The engine
   classifies those rows as `fumble_recovered` and `penalty`, which belong to the fixed group F.
   Elo measured 2,249 of 98,834 gain rows (2.276%) and showed that `a_o`/`b_d` change.
2. **Resume check.** `run.py` reproduced only the first completed shard on resume. §6 requires every
   completed shard to reproduce.
3. **Fail-closed scoring.** `score.load_shards` did not check recorded hashes, unique and complete
   272-game coverage, or failed or incomplete runs before declaring criteria.
4. **`tilt_unattainable` evidence.** §3 asks for the team, context and target of each unattainable
   tilt. Only aggregate counts were kept.
5. **Monte Carlo error per metric.** §6 asks for Monte Carlo SE per game and per metric. Only the
   SE of simulated means was reported.

## Changes (each one restores the frozen definition)
1. **Gain eligibility uses the engine's own classification order** for a scrimmage `run`/`pass`
   row, from `model.fit`. A row enters the gain ridge only if all of these hold:
   - it is not `enforced_penalty(row)` (the engine's function, imported, not re-implemented);
   - it is not a defensive touchdown (`td_team` present and different from `posteam`);
   - it is not an interception, a lost fumble or **any fumble** (`fumble == '1'`, which the engine
     maps to `fumble_recovered`).

   The row then maps to `run`, `sack`, `pass_complete` or `pass_incomplete`, as in the engine.

   The **pass-rate population is unchanged**, as §2 specifies: scrimmage `run`/`pass` rows, with
   kneels and spikes excluded.

   Source-row tests cover:
   - positive cases: a plain run, a complete pass, an incomplete pass, a sack
   - negative cases: an enforced penalty on a run, an enforced penalty on a pass, a recovered
     fumble, a lost fumble, an interception, a defensive touchdown
   - a declined (non-enforced) penalty stays in G, matching the engine
2. **Resume:** every completed shard is recomputed and must reproduce its recorded SHA256 before
   the run continues.
3. **Scoring fails closed** unless all of these hold:
   - every shard hash matches `shards.json`;
   - the 272 game IDs and indices are unique and complete, and match the targets;
   - each game has 2,000 requested and 2,000 actual runs in both arms, with zero failures.
4. **Tilt evidence:** each game records every unattainable or degenerate tilt context, from the
   `adjust` log, with team, context, target shift and draw count.
5. **Monte Carlo SE per game and per metric:** CRPS for margin and total, P(home win) and 80%
   coverage indicators. For each game and arm, CRPS SE comes from 200 run-level bootstrap
   resamples of that game's stored score distribution, seed 20261107. The mean over games is
   reported, with the per-game values in the evaluation. P(home) uses the binomial SE. Reporting
   only; no decision uses it.

## Unchanged and disclosed
- Same 2024 sources and hashes, the same pinned v0.2.24 base, the A3 test and the same seeds:
  per-game seed 1701 + index, so run j uses 1701 + index + j. This keeps the disclosed cross-game
  correlation of Monte Carlo noise.
- 2,000 runs per game per arm, the comparators, the bootstrap (10,000 resamples, seed 20261028)
  and both decision rules.
- Arm A is unaffected by the gain population, so it is re-run unchanged and must reproduce v0.3.0's
  arm-A summaries exactly. That doubles as a determinism check.
- The v0.3.0 pilot-before-prerequisite deviation stays disclosed.

## Acceptance of this rerun as a packet
- The new package `artifacts/team-0.3.1` is complete: 272 × 2,000 × 2 runs, with failures reported.
- Arm A matches v0.3.0 exactly.
- The tests above pass, and the 1,000-seed A3 test is re-run.
- The result is appended below, decisions (A) and (B) are recomputed by the unchanged rule, and the
  packet goes to independent review. Until that review, v0.3.1 is not a player-protocol base.

No player protocol, approval, forecasts, picks, member use, merge, deploy, database writes or
notifications.

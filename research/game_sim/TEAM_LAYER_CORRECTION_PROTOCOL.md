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

## Addendum A1 (2026-11-07, before any v0.3.1 result exists): Codex review 5812134489
Frozen while the original-stream v0.3.1 run is still in progress, before any of its shards are
scored.

1. **Disjoint-stream sensitivity run (Codex P1).** The original stream reuses seeds across
   adjacent games: run j of game i uses 1701 + i + j. An arm therefore uses only 2,271 unique seeds
   for 544,000 runs, which the game-level bootstrap does not model.
   - A second v0.3.1 run, `artifacts/team-0.3.1-disjoint`, uses **disjoint per-game streams**: run
     j of game i uses seed `1701 + 2000·i + j`. A and D stay paired on every seed.
   - Everything else is identical: same code, effects, runs, metrics, bootstrap and rules.
   - **Combination rule:**
     - Decision (A) counts as established only if it passes in **both** the original-stream and
       the disjoint-stream run. Otherwise (A) is reported as **not established**.
     - Decision (B) is reported for both runs and passes only if it passes in both.
     - Both runs are reported in full, whatever they show. Neither is chosen after seeing results.
2. **Immutable schedule URL (Codex P2).** `games.csv` is pinned to nflverse/nfldata commit
   `3b867ba53860b501669d4dcf755b05e430f874e9`, which Codex verified serves the hashed bytes. The
   moving `master` URL no longer does.
3. **Reschedule exclusion limit (Codex P2).** The pinned `games.csv` has no `status` or
   `game_status` column. The code's reschedule, cancel and suspend test therefore cannot fire on
   these inputs. This is documented as a verification limit: kickoffs are taken as recorded, and
   the 24-hour rule uses the recorded kickoff.
   - The rule is not changed here. Any change needs a separate research protocol.
   - Canceled or unfinished games are still excluded, by missing results or a missing END GAME row.
4. **Exposure wording (Codex P2).** "Outcomes first read by score.py" was inaccurate. The loader
   programmatically processes the complete 2024 schedule rows, including results, to generate
   exclusions, and the full 2024 play-by-play to build evidence, before scoring.
   - The accurate statement separates three things: automated processing; human inspection, where
     no 2024 target result was viewed before scoring; and final metric computation in `score.py`.
   - The pilot timing and outputs are recorded verbatim in
     `artifacts/team-0.3.1/CHRONOLOGY.md`.

## Result (2026-11-07, appended after both runs were scored; nothing above was changed)
**Packages.** Code `caaf1b5`, plus `349e574`, which only adds the `--stream` option.
- `artifacts/team-0.3.1` (original stream): shards `121eb9f`, evaluation `f4e487f`.
- `artifacts/team-0.3.1-disjoint`: shards `0e190ba`, evaluation in this commit.
- `artifacts/team-0.3.0` is preserved as superseded.

**Inputs.**
- Gain plays: 96,585, down from 98,834. Exactly the 2,249 rows Elo identified moved to F:
  - enforced penalties: 1,437
  - recovered fumbles: 868
  - turnovers: 1,772
  - defensive touchdowns: 161
- The pass-rate population is unchanged at 100,823 plays.
- Every target passed `check_cutoff`.

**Runs.**
- Both runs: 272 games × 2,000 runs × arms A and D, **0 failures**. Each run's scorer passed every
  fail-closed check.
- **Determinism:** arm A of the original-stream run is **identical to v0.3.0 for 272 of 272
  games**.
- **Monte Carlo SE per game, arm D:**
  - margin CRPS about 0.16, total CRPS about 0.16
  - P(home) about 0.011
  - simulated mean about 0.29

| run | arm | margin CRPS | total CRPS | Brier | cov80 margin | cov80 total |
|---|---|---:|---:|---:|---:|---:|
| original | A | 8.1247 | 7.2807 | 0.2502 | 75.7% | 80.5% |
| original | **D** | **7.5290** | **7.3093** | **0.2214** | **77.9%** | **79.8%** |
| disjoint | A | 8.1173 | 7.2692 | 0.2506 | 74.3% | 80.9% |
| disjoint | **D** | **7.5056** | **7.3165** | **0.2214** | **79.0%** | **80.1%** |
| both | B | 8.0824 | 7.4017 | 0.2497 | 73.5% | 83.1% |
| both | C | 7.0447 | 6.9918 | 0.2013 | 77.9% | 84.6% |

Paired bootstrap, 10,000 resamples, seed 20261028:

| difference | original: mean [95% CI] | disjoint: mean [95% CI] |
|---|---|---|
| D−A margin CRPS | −0.596 [−0.964, −0.233] | −0.612 [−0.987, −0.241] |
| D−A total CRPS | +0.029 [−0.305, +0.359] | +0.047 [−0.281, +0.375] |
| D−A Brier | −0.0287 [−0.0452, −0.0117] | −0.0293 [−0.0457, −0.0121] |
| D−C margin CRPS | +0.484 [+0.195, +0.780] | +0.461 [+0.176, +0.746] |
| D−C total CRPS | +0.318 [+0.088, +0.551] | +0.325 [+0.097, +0.558] |
| D−C Brier | +0.0201 [+0.0075, +0.0324] | +0.0201 [+0.0076, +0.0322] |
| D−B margin CRPS | −0.553 [−0.950, −0.154] | −0.577 [−0.976, −0.174] |
| D−B total CRPS | −0.092 [−0.436, +0.246] | −0.085 [−0.427, +0.252] |

**Decision (A), research acceptance: passes in both runs, so it is ESTABLISHED under addendum A1.**
In each run:
- D−A margin CRPS is below 0, with a CI that excludes 0.
- The D−A total CRPS CI includes 0.
- D's 80% coverage is within ±5 points.

The disjoint streams leave the conclusion unchanged. This permits only what the protocol permits:
the corrected team layer may serve as the base for a separately frozen player protocol, after
independent review of this packet.

**Decision (B), member/market qualification: FAILS in both runs.** D is shown to be worse than
the assumed market reference on margin CRPS, total CRPS and home-win Brier. Every CI lies entirely
above 0, so nothing qualifies.

**Limits (unchanged):**
- C is an assumed normal on retrospective closing lines, not verified prices.
- The reschedule exclusion cannot fire on these inputs (A1 §3).
- The pilot deviation is disclosed in `CHRONOLOGY.md`.
- Only run/pass mix and gain are team-adjusted.
- Research only: `approval: false`, no forecasts, picks, member use, merge or deploy.

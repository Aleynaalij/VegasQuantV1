# Team layer v0.3.0: frozen protocol draft (Claude), amended per Codex read-back 6483704618

Status: DRAFT FOR READ-BACK. Nothing is fitted, downloaded or evaluated under this protocol until
both agents agree. The base engine must first reproduce from its saved file (0.2.10.1) and pass the
phantom-stop audit (0.2.11). This protocol never approves a model, publishes forecasts, writes to a
database or sends notifications. Player workloads are out of scope and get their own protocol.

## 1. Evidence eligibility (cutoff safety)
- An evidence game E may inform target game G only if all of these hold:
  - E's scheduled kickoff (nflverse `games.csv` gameday + gametime, America/New_York) is at least
    **24 hours** before G's kickoff;
  - E has a final result in the source (`result` and both scores present);
  - E is not canceled, suspended, abandoned or rescheduled. Excluded games are listed by `game_id`
    with a reason, for example 2022 BUF–CIN week 17.
- We make no claim about when any game ended, and we never invent `game_end` timestamps. The 24-hour
  gap is a conservative design rule: it relies only on no admitted game lasting 24 hours.
  - Suspended and unfinished games are excluded outright rather than relied on.
  - The rule excludes some legitimate evidence. For example, a Saturday 8:15 pm game is not used for
    a Sunday 1 pm target. That cost is accepted and the number of excluded pairs is reported.
- Recency follows the existing `matchup.py` rule: evidence older than 730 days is excluded, and
  weight is `2^(-age_days/120)`, where age is measured from E's kickoff to G's kickoff.
  - Raw play counts and weighted support are both reported for every team and every target.
- A test proves that, for every target, no evidence row fails the rule.

## 2. Team effects
Per team and target game we estimate:
- offensive gain effect `a_o` and defensive gain effect `b_d`, in yards per gain play;
- offensive pass-rate effect `g_o` and defensive pass-rate effect `h_d`, in logit units.

Estimation reuses `matchup.py`'s alternating ridge (`RIDGE_PLAYS = 100`, 100 iterations) on signed
gain yards and on the pass indicator. EPA is not used to set outcome sizes.

## 3. Mapping effects to action outcomes
The engine's empirical template distribution is kept for each sampled context. Within a context the
templates split into four groups:
- **G_run:** run templates (including QB scrambles as the source records them);
- **G_pass:** pass_complete, pass_incomplete and sack templates;
- **F (fixed):** all other kinds — interceptions, fumbles, penalties, timeouts, kicks, kneels,
  spikes and anything else.
  - F's total probability mass and its internal proportions never change.
  - So turnover, penalty, kick, timeout and clock-event shares stay at league level.

The adjustment works in two steps.
1. **Run/pass split.** The combined mass `M = P(G_run) + P(G_pass)` is fixed. The pass share
   `q = P(G_pass)/M` becomes `q' = logistic(logit(q) + g_o − h_d)`.
2. **Gain tilt within each group.** Each template weight is multiplied by `exp(λ·y_t)`, where `y_t`
   is the template's source-recorded signed yards: sacks are negative and incompletions are 0.
   - The group is then renormalized back to its new mass.
   - λ is the numerical root of `E_λ[y] = E_0[y] + (a_o − b_d)` on the group's own templates.
     - Solved by bisection on λ ∈ [−0.5, 0.5].
     - Stops at |residual| ≤ 1e-6 yards or after 200 iterations.
   - If the target is outside the attainable range at the bracket ends, nothing is clamped:
     - the context uses λ = 0;
     - the failure is counted as `tilt_unattainable` with team, context and target.
   - A context with fewer than 2 distinct `y` values uses λ = 0, counted as `tilt_degenerate`.

**TD censoring:** `y_t` is the recorded gain, which is censored at the goal line. The tilt therefore
moves mass between recorded templates. The existing survival correction then runs after the draw,
unchanged. This is disclosed as an approximation.

**Zero coefficients:** when every coefficient for a game is 0, the sampler takes the **unchanged
0.2.10.1 code path** and makes no extra RNG calls. A test checks bit-for-bit equality of full traces
for 1,000 seeds.

**Clock, timeouts and kicking stay league-level** in v0.3.0. This is listed as a limitation.

## 4. Data, exposure and splits
- **Fit / evidence seasons:** 2022 and 2023 REG play-by-play, which is already inspected, plus
  2024 REG play-by-play as evidence for later 2024 targets, under rule 1 only.
- **Evaluation:** every 2024 REG game (272 games), each forecast only from evidence admitted by
  rule 1.
- **Exposure statement, frozen:**
  - Codex fetched the full nflverse `games.csv`, which contains 2024 schedules and outcomes, during a
    source-input probe. Codex states it did not inspect the 2024 rows.
  - Claude has not downloaded or viewed 2024 data.
  - 2024 play-by-play has not been downloaded by either agent.
  - We therefore do **not** call 2024 "untouched". We call it "2024 play-by-play not yet inspected;
    2024 outcomes present in one fetched file, not analyzed".
- Every downloaded source is recorded with its URL, SHA256 and `retrieved_at`.

## 5. Comparators
| arm | what it is |
|---|---|
| A | League-only negative control: the 0.2.10.1 / 0.2.11 engine with zero team coefficients. |
| B | The existing historical baseline. |
| C | Market reference (see below). |
| D | The team layer. |

Arm C is an **assumed** distribution, not a supplied market distribution:
- it is a normal with mean equal to the nflverse `games.csv` closing `spread_line` / `total_line`;
- its SD is the residual SD from the 2022–2023 training seasons.

The line values come from nflverse's retrospective attribution. They are not independently verified,
timestamped FanDuel snapshots, and we make no as-of-price claim.

## 6. Simulation runs
- Arms A and D are run **paired**: for each game, both arms use the same per-game seed,
  `1701 + index`.
  - `index` is the game's position after sorting all 272 `game_id`s.
- 2,000 runs per game per arm, which is 1,088,000 simulated games in total. Overtime follows the
  2024 regular-season rule: the old opening-TD rule (`both_possessions=False`). The both-possession
  rule only reached the regular season in 2025.
- **Execution:**
  - work is split into deterministic shards of 34 games across 4 processes;
  - each shard writes a checkpoint file carrying its SHA256;
  - a resumed run must reproduce the hashes of every completed shard.
- **Expected runtime:** about 5.5 CPU-hours, roughly 1.5 hours wall-clock on 4 cores.
- No subset of games, no reduced run count, and no silent drops are allowed.
  - Coverage, failures (by message), Monte Carlo standard error per game and per metric, and every
    `tilt_*` count are reported.

## 7. Metrics and decision rule (frozen before any 2024 outcome is read)
- **Metrics:**
  - CRPS for margin and total;
  - Brier score for the home win, with ties counted as half;
  - 80% interval coverage for margin and total.
- **Confidence intervals:** paired game-level bootstrap, 10,000 resamples, seed 20261028, 95%
  percentile intervals on D−A and D−C.
- **"Team layer adds value" requires all three:**
  - D−A margin CRPS < 0 with a CI excluding 0;
  - D−A total CRPS either has a CI that includes 0 or is significantly < 0;
  - D's 80% coverage is within ±5 points for both margin and total.
- D−C is reported in full, whatever it shows.
- A pass only enables an owner decision. Nothing is adopted or published automatically.
- If D fails, the result is preserved as-is. Nothing is tuned on 2024.

## 8. Not in scope
Player workloads, weather, QB-specific effects (absorbed by the team effect and disclosed),
2025/2026 forecasts, database writes, notifications, member UI.

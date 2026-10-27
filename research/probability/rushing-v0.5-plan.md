# v0.5 rushing: game-script inputs (written before any v0.5 result)

Owner request, October 27, 2026: retune rushing yards. This plan is fixed before v0.5 is fitted.
Changing the inputs or the acceptance rule after seeing results voids the comparison. Receiving is
not touched: v0.3 stays for receiving whatever happens here.

## Why rushing

Exploratory scorecard, 189 settled RB rushing main lines from 2026 Weeks 6–7, v0.3's last
pre-kickoff forecast against FanDuel's no-vig price:

- Brier: model 0.2779, market 0.2499.
- The model's lean carried no information about the result. Correlation of model probability with
  the result was −0.065; when the model leaned over, the over hit 38.6% (70 props).
- Receiving, same weeks (440 props): correlation +0.146, so the receiving model does carry signal.

v0.3 knows a back's workload and efficiency, but not the game he is about to play. Rushing volume
depends heavily on game script: favorites run more, and high-scoring games create more snaps. The
line already prices that, so a model without it disagrees with the line for reasons the line has
already accounted for.

These weeks were viewed when choosing this idea. They are diagnosis, not evidence for v0.5.

## Added inputs (rushing only)

Both come from the game's betting lines, from the player's team's side:

- `team_implied_points`: log of (total ÷ 2 + spread ÷ 2 for the favorite, − spread ÷ 2 for the
  underdog) ÷ 22.
- `team_spread`: the team's expected margin (positive = favored) ÷ 10.

Historical training and testing use nflverse `schedules/games.csv` `spread_line` (positive = home
favored) and `total_line`, which are closing lines. Live forecasts use the latest pre-kickoff
consensus of the collected sportsbook spread and total. A game with no line is not forecast.
Closing lines are known only at kickoff, so historical tests are slightly optimistic compared with a
forecast made hours earlier; this is disclosed, not corrected.

Everything else is unchanged from v0.3: data files, cohort, splits, thresholds, ridge penalty,
calibration, residual pools and bootstrap seed.

## Stage 1: historical check (gate to stage 2)

- Same splits as v0.3/v0.4: train ≤ 2022, calibrate 2023.
- Primary: 2026 Weeks 7 onward with logs available at run time. Neither v0.3, v0.4 nor this plan
  has scored those weeks against player outcomes.
- Secondary: 2025, already viewed for v0.3 and v0.4, never with these inputs.
- Measure: Brier difference v0.5 minus v0.3 on the same player-games, thresholds 20.5–100.5,
  1,000 NFL-game-clustered bootstrap replicates, seed 1701.
- **Passes only if the point difference is ≤ 0 on both samples and the 2025 interval's upper
  bound is below 0.** The 2026 sample is too small to require a significant interval.
- Fail → v0.5 is recorded as rejected, nothing is captured, and rushing stays v0.3. No retries
  with other input sets on these weeks; a new idea needs a new plan and new untouched weeks.

## Stage 2: prospective market test (the decision that matters)

If stage 1 passes, v0.5 rushing is captured before kickoff from the next slate alongside v0.3,
with its own artifact hash, and scored against FanDuel's no-vig price on settled main lines.

- Replace v0.3 for rushing only after the frozen qualification protocol's floors are met for
  v0.5's own captures (200 player-games across 40 NFL games), and only if v0.5's Brier minus
  market Brier upper 95% game-clustered bound is below zero.
- Anything short of that: v0.5 is not adopted.

Whatever the result, the model stays **SHADOW_ONLY**. Qualification under
`qualification-2026-10-16`, the owner's approval and `private.nfl_selection_model_approvals`
still govern any release.

## Result (October 27, 2026): v0.5 rejected at stage 1; rushing stays v0.3

The plan above was committed (`ec9b6de`) before the comparison ran. Data hashes match the v0.3 and
v0.4 files, and v0.3's published 2025 rushing Brier (0.156575) reproduces exactly. Full output is
in `artifacts/v0.5-rejected/`.

| Sample | Player-games (games) | v0.3 Brier | v0.5 Brier | v0.5 − v0.3 | 95% interval | Rule |
|---|---:|---:|---:|---:|---|---|
| 2026 Week 7 (primary, untouched) | 39 (14) | 0.199442 | 0.199520 | +0.00008 | −0.00232 to +0.00263 | fails (above 0) |
| 2025 (secondary) | 750 (269) | 0.156575 | 0.157085 | +0.00051 | −0.00029 to +0.00135 | fails |

Only Week 7 of 2026 had player logs when this ran, so the primary sample is small; the result does
not depend on it, because 2025 fails on its own.

The game's spread and total did not help v0.3 predict rushing yards. A likely reason: v0.3's
recent-workload inputs already track the team's run share, and the closing line moves mostly on
information (injuries, depth charts) that shows up in the very next workload. Per the plan, nothing
is captured and no other input set is tried on these weeks. `game_lines.py` stays available, off by
default.

What this means for rushing: v0.3 rushing remains SHADOW_ONLY and is not a qualification
candidate on current evidence. It does not feed the research board or any user-facing pick; the
board's rushing leans use recent form and the market price only.

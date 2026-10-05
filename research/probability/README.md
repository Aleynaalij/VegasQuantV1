# Vegas Quant probability engine v0.2

This is an executable, tested forecasting engine, not a hand-entered probability field. The checked-in release is **SHADOW_ONLY**. It does not publish picks, write to Supabase, alter bankrolls, or dispatch notifications. Its numerical outputs are experimental research estimates, not verified betting edges.

## Supported cohorts and data

- RB rushing yards: at least four prior same-team games and a weighted historical workload of at least six carries.
- RB/WR/TE receiving yards: at least four prior same-team games and at least three weighted targets.
- QB rushing, touchdown, spread, total, moneyline and parlay probabilities are unsupported. The initial QB rushing training cohort had only 71 examples, below the 100-residual support requirement.
- Real regular-season nflverse player game logs for 2022–2024. Canonical sources and SHA-256 hashes are embedded in the immutable model and validation report. Raw logs are not bundled.
- Source: https://github.com/nflverse/nflverse-data/releases/tag/player_stats . Availability information: https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html . Review the upstream dataset license before redistributing logs.

## Reproducible model

For each eligible player-game, build features from earlier weeks only. All players in a week are forecast before that week's outcomes update history. Same-team player history prevents silently carrying an old team's role into a new role.

Features include exponentially weighted recent four-game and longer sixteen-game opportunities, workload trend, historical yards per opportunity, position, history depth and opponent position-specific opportunities/yards allowed. The opponent's last eight games are shrunk with eight league-average pseudo-games, using only available earlier outcomes. This is an opponent-context proxy, not a causal adjustment for schedule strength or a film-grade defense rating.

Fit separate ridge regressions (penalty 10, intercept unpenalized) for log(1 + opportunities) and log((max(yards, 0) + 1)/(opportunities + 1)). Retain **paired** empirical residuals within position so opportunity and efficiency shocks remain correlated. Each residual pair produces a nonnegative rounded yard outcome. This yields an empirical forecast distribution, rather than a single mean or an assumed universal hit rate. These equations also mean combined log-yards depend on the sum of the two regressions; separate components do not imply a fully mechanistic carry-by-carry simulator.

Fit positive-slope sigmoid probability calibration on 2023, independently of the training fit and final test. Train through 2022, calibrate on 2023, test once on 2024. Fixed diagnostic thresholds: 20.5, 40.5, 60.5, 80.5 and 100.5 yards. Thresholds are not retrospectively selected sportsbook lines.

Validation reports Brier score, log loss and calibration bins, compared with each player's prior sixteen-game empirical hit rate. A seeded 1,000-replicate bootstrap estimates the model-minus-baseline Brier interval by player-game blocks. This does not account for correlations between players in the same NFL game, or repeated players across weeks, so the interval is a limited diagnostic.

## Recorded holdout results

| Module | 2024 player-games | Model Brier | Historical baseline Brier |
| --- | ---: | ---: | ---: |
| RB rushing | 705 | 0.156664 | 0.166400 |
| Receiving | 2,187 | 0.146681 | 0.151706 |

Lower Brier is better. These results support further testing; they establish neither profitable wagers nor a validated three-percentage-point edge. No historical ROI is reported because archived executable prop prices were unavailable.

## Price comparison and release gates

Quote evaluation requires exact player, team, opponent, season/week, market, direction, line, American odds, sportsbook/source URL, observation time and kickoff. Times must include timezone offsets. Pregame observations older than fifteen minutes are blocked. Features exclude the target week even when the supplied input includes future outcomes.

For half-yard over/under quotes, compare calibrated win probability to raw price break-even probability. Whole-yard markets explicitly include push probability; edge uses conditional win probability excluding pushes and EV accounts for returned stake. An at-least alternative threshold uses the corresponding discrete survival probability. Raw break-even includes vig; it is not a no-vig consensus probability. Do not compare a game-level public money split to a player prop or treat it as an engine input.

The checked-in artifact carries release blockers, so all quote outputs remain WAIT regardless of the estimated edge. It also always sets `official_eligible: false`. A forecast estimate is never permission to publish an official pick. Releasing a later validated artifact requires documented prospective testing and a separately authorized publishing workflow.

## Run

```bash
python -m pip install -r research/probability/requirements.txt
python -m unittest discover -s tests/probability -v
python research/probability/fetch_history.py --output /tmp/vq-history --years 2022 2023 2024
python research/probability/engine.py --data /tmp/vq-history/player_stats_2022.csv /tmp/vq-history/player_stats_2023.csv /tmp/vq-history/player_stats_2024.csv --output /tmp/vq-model
```

To evaluate verified quotes using an existing artifact:

```bash
python research/probability/engine.py --data /path/to/current-history.csv --model research/probability/artifacts/v0.2/model.json --quotes /path/to/verified-quotes.json --as-of 2026-10-05T17:00:00-04:00 --output /tmp/vq-forecasts
```

Quote JSON is an array of objects with `player_id`, `team`, `opponent`, `season`, `week`, `market` (`rushing`/`receiving`), `direction` (`over`/`under`/`at_least`), `line`, `odds`, `sportsbook`, `source_url`, `observed_at`, `kickoff`, `availability_verified`, and `role_change`. Supply real observations; the command above is syntax guidance, not a live quote. Compare multiple books by supplying multiple exact-market quotes.

The GitHub Actions probability workflow runs behavioral tests on changes. A manual workflow run additionally fetches the fixed historical cohorts, reruns validation and uploads its artifacts. It does not auto-release recommendations.

## Remaining limitations and next release requirements

Current-season workload logs and current verified injury/role context must be supplied for prospective predictions. No automated injury feed, weather feature, explicit snap/route participation, depth-chart model, role-change refit or season-specific performance drift correction exists yet. Historical logs report games played; absence/DNP risk is handled by a separate availability gate, not fitted into the yard distribution. Marginal yard probabilities are calibrated, but workload/efficiency distributions themselves are not independently validated.

Before live qualification: archive exact sportsbook observations without hindsight; run prospective forecasts before kickoff; assess calibration and coverage by market/position/line range; compare to same-time no-vig market baselines where both sides exist; evaluate executable price/EV outcomes and model uncertainty; document acceptance thresholds before examining that evaluation set. No unsupported market should inherit this module's validation.

## v0.2 upgrade

Validation now includes per-position and per-threshold Brier, log loss and calibration diagnostics. This is a reporting upgrade, not retraining to optimize the already viewed 2024 holdout; aggregate forecasts and scores are unchanged.

An optional `opposite_quote` object supplies the complementary over/under price, with the same identifying fields and its own observation timestamp, source URL and odds. The engine requires the same sportsbook, market, player, team, opponent, game window, line and kickoff. Observations must be within one minute of each other and both within fifteen minutes of evaluation. A mismatched market is rejected; a stale/noncontemporaneous pair leaves no-vig probability unknown and blocks qualification. Proportional normalization removes the quoted overround; it does not identify a true win probability or a consensus across books. Whole-yard probabilities are conditional on no push for the price comparison.

Current-season week three onward requires current-season player history. A gap greater than two weeks also blocks qualification; a bye or injury needs explicit availability/role review. The v0.1 model and report remain preserved in their original artifact directory.

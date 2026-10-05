# Vegas Quant probability engine v0.3

This is an executable, tested forecasting engine, not a hand-entered probability field. The checked-in release is **SHADOW_ONLY**. It does not publish picks, write to Supabase, alter bankrolls, or dispatch notifications. Its numerical outputs are experimental research estimates, not verified betting edges.

## Supported cohorts and data

- RB rushing yards: at least four prior same-team games and a weighted historical workload of at least six carries.
- RB/WR/TE receiving yards: at least four prior same-team games and at least three weighted targets.
- QB rushing, touchdown, spread, total, moneyline and parlay probabilities are unsupported. The initial QB rushing training cohort had only 71 examples, below the 100-residual support requirement.
- Real regular-season nflverse player game logs for 2022–2025, with 2026 inputs supported. Canonical sources and SHA-256 hashes are embedded in the immutable model and validation report. Raw logs are not bundled.
- Source: https://github.com/nflverse/nflverse-data/releases/tag/player_stats . Availability information: https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html . Review the upstream dataset license before redistributing logs.

## Reproducible model

For each eligible player-game, build features from earlier weeks only. All players in a week are forecast before that week's outcomes update history. Same-team player history prevents silently carrying an old team's role into a new role.

Features include exponentially weighted recent four-game and longer sixteen-game opportunities, workload trend, historical yards per opportunity, position, history depth and opponent position-specific opportunities/yards allowed. The opponent's last eight games are shrunk with eight league-average pseudo-games, using only available earlier outcomes. This is an opponent-context proxy, not a causal adjustment for schedule strength or a film-grade defense rating.

Fit separate ridge regressions (penalty 10, intercept unpenalized) for log(1 + opportunities) and log((max(yards, 0) + 1)/(opportunities + 1)). Retain **paired** empirical residuals within position so opportunity and efficiency shocks remain correlated. Each residual pair produces a nonnegative rounded yard outcome. This yields an empirical forecast distribution, rather than a single mean or an assumed universal hit rate. These equations also mean combined log-yards depend on the sum of the two regressions; separate components do not imply a fully mechanistic carry-by-carry simulator.

Fit positive-slope sigmoid probability calibration on 2023, independently of the training fit and final test. Train through 2022, calibrate on 2023, initially test on 2024, then evaluate the unchanged model on 2025. Fixed diagnostic thresholds: 20.5, 40.5, 60.5, 80.5 and 100.5 yards. Thresholds are not retrospectively selected sportsbook lines.

Validation reports Brier score, log loss and calibration bins, compared with each player's prior sixteen-game empirical hit rate. A seeded 1,000-replicate bootstrap estimates the model-minus-baseline Brier interval. Versions 0.1–0.2 cluster by player-game; v0.3 clusters by NFL game to retain cross-player correlation. Repeated-player dependence across weeks is still a limitation.

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
python research/probability/engine.py --data /path/to/current-history.csv --model research/probability/artifacts/v0.3/model.json --quotes /path/to/verified-quotes.json --as-of 2026-10-05T17:00:00-04:00 --output /tmp/vq-forecasts
```

Quote JSON is an array of objects with `player_id`, `team`, `opponent`, `season`, `week`, `market` (`rushing`/`receiving`), `direction` (`over`/`under`/`at_least`), `line`, `odds`, `sportsbook`, `source_url`, `observed_at`, `kickoff`, `availability_verified`, and `role_change`. Supply real observations; the command above is syntax guidance, not a live quote. Compare multiple books by supplying multiple exact-market quotes.

The GitHub Actions probability workflow runs behavioral tests on changes. A manual workflow run additionally fetches the fixed historical cohorts, reruns validation and uploads its artifacts. It does not auto-release recommendations.

## Remaining limitations and next release requirements

Current-season workload logs can now be downloaded from the supported source. A hosted refresh/quote collector and current verified injury/role context are still required for automated prospective predictions. No automated injury feed, weather feature, explicit snap/route participation, depth-chart model, role-change refit or season-specific performance drift correction exists yet. Historical logs report games played; absence/DNP risk is handled by a separate availability gate, not fitted into the yard distribution. Marginal yard probabilities are calibrated. Workload and yard distribution errors/coverage are measured in v0.3, but those distributions are not separately calibrated.

Before live qualification: archive exact sportsbook observations without hindsight; run prospective forecasts before kickoff; assess calibration and coverage by market/position/line range; compare to same-time no-vig market baselines where both sides exist; evaluate executable price/EV outcomes and model uncertainty; document acceptance thresholds before examining that evaluation set. No unsupported market should inherit this module's validation.

## v0.2 upgrade

Validation now includes per-position and per-threshold Brier, log loss and calibration diagnostics. This is a reporting upgrade, not retraining to optimize the already viewed 2024 holdout; aggregate forecasts and scores are unchanged.

An optional `opposite_quote` object supplies the complementary over/under price, with the same identifying fields and its own observation timestamp, source URL and odds. The engine requires the same sportsbook, market, player, team, opponent, game window, line and kickoff. Observations must be within one minute of each other and both within fifteen minutes of evaluation. A mismatched market is rejected; a stale/noncontemporaneous pair leaves no-vig probability unknown and blocks qualification. Proportional normalization removes the quoted overround; it does not identify a true win probability or a consensus across books. Whole-yard probabilities are conditional on no push for the price comparison.

Current-season week three onward requires current-season player history. A gap greater than two weeks also blocks qualification; a bye or injury needs explicit availability/role review. The v0.1 model and report remain preserved in their original artifact directory.

## v0.3 upgrade and prospective evidence

Upstream weekly player statistics for 2025 and 2026 use the `stats_player` release, rather than the legacy `player_stats` release. The download utility now supports both explicit schemas. It maps `team` to `recent_team` and rejects conflicting identities. Unidentified rows are excluded only if carries, rushing yards, targets and receiving yards are all zero; unidentified nonzero contributions fail validation. Current 2026 logs were successfully retrieved through Week 4 on October 5, 2026. Snapshot availability does not itself verify a player's next-game availability.

The v0.3 artifact retains the same 2022 fit and 2023 calibration, evaluated on previously unused 2025 outcomes. The 2024 observations provide earlier-week features only, not fitted coefficients or calibration labels. There is no tuning to improve the viewed 2024 or 2025 test results. Earlier model versions remain unchanged. NFL-game clustered bootstrap intervals now retain cross-player dependence within each game; repeated players across games remain a limitation. Opportunity errors and raw yard/opportunity interval coverage are measured separately from calibrated threshold probabilities.

| Module | 2025 player-games | Model Brier | Historical baseline Brier |
| --- | ---: | ---: | ---: |
| RB rushing | 750 | 0.156575 | 0.166032 |
| Receiving | 2,109 | 0.143622 | 0.148857 |

To reproduce this evaluation, fetch 2022–2025 and include `stats_player_week_2025.csv` in `--data`, with `--test-year 2025`. New-schema logs can also be used for live feature extraction. Use verified sources for quotes and availability; do not fill missing fields with guessed values.

### Research journal

`journal.py` records research forecasts and later final outcome observations. It is **separate from the platform's official pick and personal bankroll ledgers**, and cannot modify either. The journal uses SQLite insert-only triggers, observation deduplication and a hash chain checked before appends and scoring. This is application-level tamper detection, not external notarization or proof that an operator-controlled file was never replaced. Keep durable backups and an externally timestamped digest for stronger provenance.

Pass `--journal /persistent/path/research.sqlite` to forecast generation to record each forecast with its model ID, pregame observation, features, historical cutoff, data hashes, probabilities and blockers. Capture before kickoff and within fifteen minutes of the forecast time; the CLI uses the real recording clock and cannot backfill a historical prediction as a prospective forecast. The function's optional clock argument is for isolated tests, not a production backdating interface.

```bash
python research/probability/journal.py --journal /persistent/path/research.sqlite --report
python research/probability/journal.py --journal /persistent/path/research.sqlite --record-outcomes /path/to/verified-final-outcomes.json --report
```

Final outcomes are an array containing `forecast_id`, `observed_at`, `source_url`, `final: true`, and either observed `yards` or explicit `void: true`. Missing results remain pending. Voids are excluded; pushes return zero hypothetical profit and are excluded from binary Brier scoring. Conflicting results are rejected and require a separately designed append-only correction mechanism rather than silently changing history. Outcome sources and finality must be independently verified by the caller; a URL and flag alone cannot prove finality.

The report compares conditional no-push forecast Brier to raw price and no-vig Brier where coverage exists. A first-observation rule per player/game/market/direction/line/model prevents picking the best sportsbook after seeing results. Different lines, directions and models remain correlated and must not be treated as independent bets. Flat-unit returns are **research simulations over the recorded sample**, not actual wagers, official results, a published betting strategy or permission to release the model. No automated acceptance decision is based on this report.

The journal is implemented and tested but is not yet wired to a hosted price-feed collector or Supabase. Without actual timestamped observations it contains no live evidence. A healthy implementation is not equivalent to a profitable betting service.

Availability verification now requires an `availability_source_url` when `availability_verified` is supplied. Quotes outside the evaluated 20.5–100.5 yard range remain research-only and receive an explicit extrapolation blocker. The data-readiness snapshot records current source hashes, excluded zero-contribution identity rows and unavailable feed coverage.

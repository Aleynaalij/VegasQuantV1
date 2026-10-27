# NBA shadow model v0.1 — research only

`engine.py` forecasts a player's points or rebounds before tip-off as a distribution:
**minutes × per-minute rate**, the NBA counterpart of the NFL v0.3 opportunity × efficiency model in
`research/probability/`. It never publishes picks, and nothing here can make an NBA selection official.

## Data

hoopR/sportsdataverse player box scores (`player_box_<season>.csv`, ESPN data; season 2026 =
2025-26). ESPN game and athlete ids match `nba_games.provider_id` and `nba_player_results.athlete_id`,
so history and this season's recorded box scores join without a crosswalk. Regular season only; DNPs
and All-Star exhibitions are excluded; teams use The Odds API spelling ("LA Clippers" → "Los Angeles
Clippers").

## Model

Features use only games before the target date, for the same player on the same team:
recent (last 5) and longer (last 20) weighted minutes, minutes trend, recent starter share, per-minute
rate (20 and 5 games), the opponent's per-minute allowance to the player's position (shrunk toward the
league with 10 pseudo-games), home, back-to-back, history size and position. Two ridge regressions
predict log minutes and log rate; paired residuals by position give the distribution, so the
minutes/rate correlation (blowouts, foul trouble) is kept. A logistic calibration is fitted on a separate
season. Cohort: 5+ prior same-team games and 20+ weighted recent minutes.

## Validation (`artifacts/v0.1/validation.json`)

Train 2023-24, calibrate 2024-25, test 2025-26 (15,900 player-games per market), against the player's
own last-20-game hit rate at predeclared lines:

| Market | Model Brier | Baseline Brier | Difference, 95% (game-clustered) | Calibration error |
|---|---|---|---|---|
| Points (9.5–29.5) | 0.1229 | 0.1251 | −0.0028 to −0.0017 | 1.3% |
| Rebounds (3.5–11.5) | 0.1143 | 0.1177 | −0.0039 to −0.0029 | 0.7% |

This beats a naive baseline, not the betting market. No historical prop prices exist to test against,
so market skill is measured only prospectively, below.

## Prospective protocol `nba-shadow-2026-10-17`

1. **Capture.** `hosted_scan.py` (workflow *NBA shadow model scan*, three minutes after each
   nba-sync run) forecasts every FanDuel points and rebounds main line (half-point lines with an Over
   price) for regular-season games within 36 hours, for players in the cohort. `record_nba_shadow_scan`
   stores each forecast only if the game has not started, the snapshot was both quoted by the provider
   and received within 30 minutes before the scan (never after it), the line and prices match the stored
   snapshot exactly, the scan names its hoopR input hashes and the forecast's history ends before the
   game's (Eastern) date. Missing evidence rejects the whole scan. Forecasts are immutable.
2. **Grade.** `nba_shadow_evaluation_rows` grades the Over with `nba_grade` on recorded box scores
   (VOID if the player did not play). The closing price is read from the same book's last snapshot of
   that market before tip; if that snapshot no longer has the player's line (withdrawn or moved), there
   is no closing price for the forecast, never an older one. If the book pulls the whole market, the
   feed records nothing new, so the market's last quote stands as the close (the last available price).
3. **Score.** `shadow_report.py` (workflow *NBA shadow scorecard*, twice daily) uses the first
   capture per game, player, market and line. Per market, a market is *ready for owner review* only if:
   - at least 300 graded forecasts from at least 40 games;
   - at least 200 with a two-sided (no-vig) price;
   - the model's Brier score beats the no-vig price, upper 95% bound (game-clustered) below zero;
   - at least 150 forecasts with a closing price, and positive mean closing-line value on the side the
     model prefers;
   - at least 100 bets where the model's side is 3+ points above no-vig, with the lower 95% bound of
     the flat return above zero.

   Ready for review is not approval: official NBA picks would need a separate gate and the owner's
   approval, like NFL's selection gate.

The model file is frozen by its hash (`model_id`, registered in `private.nba_shadow_models`). A new
version gets a new artifact, registration and journal; the protocol is not changed after results are
seen. (The closing-coverage floor and the stricter capture checks were added on October 17, 2026,
before any forecast had been captured.)

## Against the operating addendum (`operating-foundation-v1.txt`)

Covered: minutes before stat totals (VQ-NBA-04's first step), empirical rather than Poisson/normal
tails, walk-forward validation, a prospectively locked SHADOW_ONLY journal with model hash, input
hashes, quote and capture times and historical cutoff, same-line CLV, and game-clustered evaluation.
Not yet covered in v0.1, and the reasons it stays research only:

- **Availability and minutes scenarios.** Injury reports, rest days and minutes restrictions are not
  inputs. A player ruled out is graded VOID and drops out of the scorecard, but a limited or
  questionable player is forecast as if fully available.
- **Rotation changes.** Trades and role changes are only reflected once the new role appears in
  same-team history (a traded player needs 5 games with the new team).
- **Assists, threes, alternate lines and parlays** are not modeled.

# Prospective model qualification protocol — frozen October 16, 2026

This protocol is specified before the next prospective evaluation sample. It does not promote v0.3 or assert a numerical edge. The unchanged NFL bible and R1–R8 remain mandatory. Keep the v0.3 artifact and its historical holdouts immutable.

## What qualifies

A release candidate must have an immutable artifact hash, documented training/calibration cutoff, independently reproduced tests, supported market/phase/position/line/price ranges, and a prospective evaluation against actual contemporaneous sportsbook observations. Historical player-log accuracy alone is insufficient evidence of beating a price. Historical five-game clear rate is an additional small-sample screen, never a true probability.

Approval is scoped. Pregame RB rushing yards, pregame WR receiving yards, receptions, and halftime forecasts are separate claims. A pregame yards model cannot inherit approval for live opportunity states or receptions. v0.3 currently supports only the documented pregame yardage cohorts and diagnostic threshold range; it remains SHADOW_ONLY.

## Capture before kickoff

1. Run `scan.py` with actual supported future games and immutable main AND alternate FanDuel market snapshots. The provider quote time, not database receipt, controls freshness. Preserve exact player/stat/direction/point/price and observation ID. Unknown or stale coverage stays WAIT.
2. Download actual nflverse 2025/current-season weekly logs using the corrected stats_player endpoint. Preserve source URLs, SHA-256 hashes, schema normalization and historical cutoff. Exclude target-week outcomes from features even if downloaded logs already include them.
3. Record the scan and slate via `public.record_nfl_shadow_scan(p_scan,p_slate)` using the service role, or the private function via an authorized database operator. Register the real immutable artifact in `private.nfl_shadow_model_manifests` first. Registration is NOT validation approval. No front-end service key.
4. The hosted journal retains run coverage and all blockers, including runs without any priced forecast. Individual forecast rows require exact immutable fresh quotes, future kickoff, matched source fields and research-only WAIT status. Unverifiable/stale quotes are excluded from forecast rows but remain visible in scan coverage. Replays dedupe; conflicting replays and backdated capture are rejected. No publication, tail, result or bankroll write occurs.
5. Continue normal research even if a prop feed is empty. A stored scan or healthy collector is not proof of odds coverage, a durable forecast sample, or automatic forecasting. This RPC is implemented; a continuously hosted Python worker is not deployed by this change. Recurring research runs must explicitly execute and upload the scan.

## Evaluation sample and acceptance dossier

Do not change these criteria after seeing the evaluation sample to obtain approval. If changed, publish a new protocol version and start a new prospective evaluation block.

- Evaluate pregame RB rushing and WR receiving independently. Initial price-band focus is -150 through -249; no near-even-money or heavy-chalk approval is implied.
- Minimum review floor per proposed scope: 200 distinct player-games across at least 40 NFL games, with at least 50 observations in each price/line slice proposed for approval. These are review floors, not a guarantee of adequate statistical power or permission to approve. Extend the sample if uncertainty remains too large to support a three-point edge.
- Freeze candidate selection before outcomes. Keep all eligible forecasts; use first observation per exact player/game/market/direction/threshold/model for the main evaluation. Repeated lines/players are dependent, and must not multiply effective sample size. Separate model evaluation from R1–R8 screening performance to avoid selecting flattering results retrospectively.
- Verify final outcomes independently and retain correction history. Report wins/losses/pushes/voids/pending separately. Store research outcomes separately from platform pick grading and bankrolls.
- Report Brier score, log loss and reliability by market, position, threshold and price band. Compare with both historical baseline and contemporaneous no-vig market where complementary quotes exist. Missing no-vig coverage is a blocker for claims of beating that benchmark, not a guessed baseline.
- Use game-clustered 95% bootstrap intervals, with repeated-player dependence noted. Require an upper confidence bound below zero for model-minus-no-vig Brier in the proposed scope, no material unsupported calibration claims in the relevant probability range, and enough precision to defend the intended edge. A lower Brier point estimate alone does not pass.
- Report executable-snapshot flat-unit research returns, quote/closing coverage, uncertainty and CLV at the same exact line. Require positive lower 95% game-clustered return bounds for the prespecified eligible selection cohort; a few winning parlays or a favorable point estimate cannot substitute. These returns are research simulations, not wagers or guaranteed profit.
- A claimed >=3 percentage-point edge must survive documented uncertainty/sensitivity review, not only exceed a plug-in price break-even by 0.03. Approval remains a documented human review; no code silently promotes a model.
- Publish a versioned dossier with data hashes, exclusion reasons, effective sample sizes, missing coverage and all metric intervals. Only then explicitly authorize an entry in `private.nfl_selection_model_approvals` with its actual phase, position, market, threshold and odds range. Any scope outside that evidence remains blocked.

These tests may fail. Do not lower the requirements because a weekend is approaching. Halftime and receptions need their own models/data and prospective qualification; no amount of pregame yardage validation establishes either.

## Weekly rule monitoring

Keep the original +5.74u / 46 priced-leg retrospective baseline clearly labeled. Compare prospectively captured all-gates-pass legs with that baseline; retain rejected candidates and their independently verified outcomes. Report excluded winners AND avoided losses, actual odds, counts and intervals. Never reconstruct missing pre-kickoff forecasts after a game or count duplicate quote snapshots as extra successful picks.

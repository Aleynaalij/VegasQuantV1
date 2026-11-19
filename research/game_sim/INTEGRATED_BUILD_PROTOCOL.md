# Integrated research engine 0.2.0 — frozen 2026-10-27

One implementation/review/check cycle, not a claim of current-player forecasting.
Preserve every0.1.x artifact and failure. Fit only actual2022REG sources;2023 is
already-inspected calibration, never untouched holdout. No2024+ evaluation.

## Cohesive changes
- Joint action + observed event-gap sampling remains the clock model. Source PBP
  lacks uniformly verified snap-end timestamps, so do not invent a separation of
  play duration and runoff, refund time after a timeout, or auto-kick on expiry.
  Kernel enforces elapsed, period/half boundaries, conversions and timeout budgets.
- Reorder backoff keys to phase, clock band, score situation, down, distance,
  field. Back off field/distance/down first. For half-ending<=120s, never discard
  clock: phase+clock is the floor even below30observations (count thin support).
  Missing phase+clock support blocks the run. Normal clock may use phase fallback.
  Clock bands unchanged last10/last30/last120/normal. Score in late bands is tied,
  ahead/behind1–3,4–8,9+; normal uses existing ahead/behind/tied. No tuning.
- Complete the right-censored gain distribution using the same monotone empirical
  survival estimate frozen0.1.6. For TD-origin y0 replayed farther out y, touchdown
  mass S(y)/S(y0), conditional non-TD gain mass S(g)-S(g+1) for integerg in[y0,y).
  This is a MODELED latent gain, not an observed statistic. No arbitrary fill for
  missing risk sets. Support gaps count and block. This replaces the incomplete
  observed-non-TD-pool method, not a forced touchdown rule. State trace carries the
  resulting simulated credited yards, with no claim of real player production.
- Carry source timeout contexts/budgets and accepted-only penalty routing forward.
- Add source/simulation diagnostics for timeout/FGattempt/late-FG counts; preserve
  all four original reproduction metrics and their3combined-SE thresholds.
- Fit+10kseed1701oldOT+gate+2023CRPS diagnostics+replay+hashmanifest in one CLI.
  The same batch supplies every report: no duplicate draws, seedshopping, or
  selecting a flattering replay. Save failed complete builds too. Atomic output
  directory creation prevents replacing existing artifacts.

## Acceptance/review
No fixed test count is an acceptance criterion. All relevant tests must pass,
trace invariants and source manifests must verify,0simulation failures and0missing
censoring supports are necessary. All original reproduction metrics must pass.
Thin empirical clock support is prominently counted; passing in-sample averages
alone does not establish calibration or approve predictions. Claude independently
reviews clock/source semantics, survival estimator, failure coverage and replay.
No team/player coupling, production renderer replacement, model approval, content
release, notifications or current-matchup forecast is enabled by this build.
Team/player feature software remains present with recency/completion gates; a
separate frozen coupling/calibration experiment follows a passing reviewed base.

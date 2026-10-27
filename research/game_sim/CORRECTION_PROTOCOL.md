# Baseline correction development gate — 2026-10-27

Freeze before first corrected fit. v0.1.1 artifacts are immutable, superseded
research evidence: kickoff possession mapping is wrong. No forecasts/coupling.

Order: kickoff normalization + penalty line-to-gain correctness; measure once;
then separately evaluate normalized enforced live-ball penalties if still needed.
Do not force scoring by adding points or tuning touchdowns to a desired mean.
2022 is in-sample reproduction only, 2023 already inspected diagnostics.

Gate: 10,000 games, seed 1701, 2022 regular-season old opening-TD overtime.
Compare mean total points, touchdowns, made field goals and punts per game to
all complete 2022 REG source games (exclude incomplete BUF-CIN consistently).
For each metric the absolute mean difference must be <= 3 * sqrt(source sample
variance / source n + simulation sample variance / simulation n). All metrics
must pass and no simulated games may fail. This is a necessary reproduction
check, not evidence of out-of-sample skill. Preserve failing runs and exact source
hash, counts, model ID and seed. No repeated seed shopping or threshold changes.

Follow-up matchup rule (freeze before any new fit): only previous 730 days of
completed games; exponential half-life 120 days, weight=2**(-age_days/120).
Use completion timestamp for cutoff eligibility, kickoff for recency age. Both
team EPA effects and player historical opportunities use the same weights;
retain raw counts and weighted support separately. Priors unchanged. QB scrambles
remain in rushing EPA and QB carry volume (not standard dropback EPA); count
qb_scramble explicitly. No coupling until baseline gate passes.

## Development experiment 0.1.5 — frozen after 0.1.4 gate failed
0.1.4 corrects enforcement and brings punts into range, but TD/points still fail.
Next hypothesis is overly broad state pooling: 4–10 yards to gain and the entire
red zone share outcomes even when goal-to-go geometry differs. Before fitting,
fix new distance bins 1,2,3,4–6,7–10,11+; field bins 0–5,6–10,11–20,21–40,
41–60,61–80,81–100, each marked goal-to-go when distance equals yardline.
Keep the same prefix backoff, minimum30, seed, run count and reproduction gate.
This is disclosed in-sample model development, not an untouched validation or
permission to select a flattering model. Preserve all earlier failed gate results.

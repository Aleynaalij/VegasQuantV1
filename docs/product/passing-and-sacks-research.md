# Passing yards and defensive sacks — research readiness, October 16, 2026

Passing/sacks prices are collected from FanDuel up to seven days ahead. Price collection, result verification and probability-model validation are separate capabilities. Both markets remain unqualified for new recommendations; sacks still fail the current publication gate's supported-stat filter. No model approval, pick, wager or retrospective regrade is created by this work.

## Exact sack market semantics

The reviewed FanDuel NFL rule for **Player to Record a Sack** says half sacks count as Yes: https://policies.fanduel.com/SB/NJ/2026-10-15T12-42-58.html (checked October 16). This is a state-specific cited example, not proof that every jurisdiction/market uses the same terms. Do not transfer that Yes/No rule to a numeric total merely because a provider labels an outcome Over 0.5. Preserve the provider's raw market/point/price and require the actual selection's settlement rules to be reviewed.

Only explicitly reviewed **numeric totals** are implemented here. Candidate metadata must include `sack_market_type: "numeric_total"`, `book: "FanDuel"`, and `sack_settlement_review: {source_url, observed_at}` from before publication. Full-game scope and exact game/player binding remain required. Unknown market type, binary Yes/No, team sacks, QB sacks suffered, missing stats and unverified DNP/void status remain blocked for automatic grading.

Numeric examples: a credited 0.5 remains 0.5; Over 0.5 is a push at exactly 0.5, while a 0.5+ milestone clears at 0.5. Those examples apply only to reviewed numeric-total contracts. Thresholds and credited totals use half-sack increments. Never round shared credit to a whole sack or use QB hits/pressure counts as sacks.

## Verification and corrections

The grader reads ESPN `defensive.keys.sacks` and corroborates against actual nflverse `def_sacks` for the same player, team, opponent, season, week and game. Offense yardage/reception parsing retains whole-number semantics. Missing defenders never become assumed zero-sack participants. Historical clear rates also preserve fractional sacks and exclude the target week.

Only final, matching source values can create an editorial result. New invalid quarter-sack credits are rejected at the database evidence boundary. Later corroborated corrections or source disagreements are appended to `private.editorial_stat_correction_observations` and flagged for review; original result/evidence rows remain immutable. Duplicate source corrections dedupe. This does not claim automatic sportsbook resettlement or silently alter tails, bankrolls, stakes or payouts. Existing original results are not regraded by deploying the migration.

## Model data readiness

Run:

```bash
python research/probability/market_readiness.py --data /path/stats_player_week_2025.csv /path/stats_player_week_2026.csv --output /path/passing-sacks-readiness.json
```

This validates identity/schema, duplicate rows, numeric precision and cohort coverage. It maps the source's `attempts` column explicitly to passing attempts, rejecting conflicting schemas. It emits source hashes and coverage diagnostics, no probabilities or picks. Historical rows/players are not effective independent validation sample sizes.

Passing model work needs prior-week attempts, completions/efficiency, sacks suffered/protection, opponent context, current QB availability, role and weather. The old v0.3 RB/WR yardage artifact is not a QB model. Do not reuse its threshold range or calibration as a passing-yard approval.

Sacks model work needs defensive participation/pass-rush snaps, pressure production, projected opposing dropbacks, offensive-line availability/matchup and current role. The present weekly file contains credited sacks, but no verified player pass-rush opportunity/pressure series. Raw sack history cannot establish repeatable pressure generation or an edge. Obtain and verify those inputs before selecting a model specification. A binary sack-occurrence model and a fractional sack-total model have different settlement targets.

Both require their own immutable artifact, calibration, held-out diagnostics and the [prospective price-aware protocol](../../research/probability/qualification.md). Halftime remains a separately conditioned model. Current R1–R8 and the unchanged bible still govern. Neither unit tests nor available data qualify a model.

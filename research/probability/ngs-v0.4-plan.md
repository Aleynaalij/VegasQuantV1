# v0.4: Next Gen Stats inputs (written before any v0.4 result)

Owner request, October 22, 2026, step 3 of the NGS plan. v0.4 is v0.3 plus Next Gen Stats inputs.
Everything else is unchanged: data files, splits, thresholds, ridge penalty, calibration, residuals,
bootstrap seed. This plan is fixed before v0.4 is fitted. Changing the feature set or acceptance
rule after seeing results voids the comparison.

## Added inputs

Each input comes from the player's NGS weekly rows from **earlier weeks only**: the current and
previous regular season, his most recent 8 NGS weeks.

- Rate metrics are averaged with his volume as weight: targets for receiving, carries for rushing.
- The average is shrunk toward the league mean of all earlier NGS player-weeks, with 4 pseudo-weeks.
- Each input enters as its deviation from that league mean.
- NGS publishes a weekly row only above a volume minimum, so a player with no rows gets the league
  mean, a deviation of 0. `ngs_coverage` = (his NGS weeks, capped at 8) / 8 lets the fit tell real
  zeros from missing ones.

| Market | Inputs |
|---|---|
| Receiving | `ngs_separation` (avg separation), `ngs_air_share` (% of team intended air yards), `ngs_yac_oe` (YAC over expected per catch), `ngs_coverage` |
| Rushing | `ngs_ryoe` (rush yards over expected per carry), `ngs_box8` (% of carries vs 8+ defenders), `ngs_coverage` |

Players are matched by `player_gsis_id` = nflverse `player_id`. Source: the nflverse `nextgen_stats`
release (`ngs_receiving.csv.gz`, `ngs_rushing.csv.gz`), recorded with SHA-256 like the other inputs.

## Comparison and acceptance

- Same splits as v0.3: train ≤ 2022, calibrate 2023, test 2025. 2024 supplies earlier-week inputs
  only. Same thresholds: 20.5, 40.5, 60.5, 80.5 and 100.5 yards.
- Primary measure: the Brier difference, v0.4 minus v0.3, on the same 2025 player-games. Its 95%
  interval comes from 1,000 NFL-game-clustered bootstrap replicates, seed 1701.
- **v0.4 replaces v0.3 for a market only if that interval's upper bound is below 0.** Otherwise
  v0.3 stays for that market.
- 2025 has already been viewed for v0.3, though never with these inputs. A fresh check is also run
  once on 2026 Weeks 1–6, which neither version has used. There, v0.4's point difference must not
  be above 0, or v0.4 is not adopted for that market.
- No retries with other input sets on these seasons. A different input set needs a new written
  plan and a new untouched evaluation period.

Whatever the result, the model stays **SHADOW_ONLY**: no official picks and no gate change. The
2026 prospective journal, the owner's approval and `private.nfl_selection_model_approvals`
still govern any release.

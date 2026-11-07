# Player layer v0.4.0 — protocol draft (Claude), for read-back

Status: DRAFT FOR READ-BACK. Nothing is downloaded, fitted, simulated or evaluated under this
protocol until both agents (Codex, Elo) agree in writing and Mike confirms. This protocol never
approves a model, publishes forecasts, writes to a database or sends notifications.

Mike asked to "go deeper on NFL" (2026-11-07). The team-layer protocol's decision (A) allows the
team layer to become the base for a separate player protocol. This is that protocol.

## 0. Base
- **Base: team layer v0.3.1** (`TEAM_LAYER_CORRECTION_PROTOCOL.md`). Decision (A) was established in
  both streams. It sits on the §0-pinned engine v0.2.24.
- Before anything else, a separate provenance commit pins the following into this section:
  - the reviewed head
  - `team_layer/` source hashes
  - the v0.2.24 model hash
  - the base packages

  That commit happens only after the base has its final independent disposition. Codex's final
  sign-off on v0.3.1 is still pending at the time of drafting.
- The team layer and engine are used **unchanged**. The player layer only assigns each simulated
  play to players. It never changes a play, a score or an RNG draw of the engine or the team layer.

## 1. What is forecast
Per player-game, a distribution for each of these stats:

| group | stats |
|---|---|
| passing | yards, attempts, completions, touchdowns, interceptions |
| rushing | yards, carries, touchdowns |
| receiving | targets, receptions, yards, touchdowns |

Players: QB, RB, WR, TE. Not in scope: kicking, defense, fantasy scoring, props pricing.

## 2. Allocation (assigns engine plays to players; team totals are conserved exactly)
For each simulated play of a team's offense:

| simulated play | assigned to |
|---|---|
| `run` | one **rusher** (carry, rushing yards, rushing TD) |
| `pass_complete` | one **passer** (attempt, completion, yards, TD) and one **target** (target, reception, receiving yards, receiving TD) |
| `pass_incomplete` | passer (attempt) and target (target only) |
| `interception` | passer (attempt, INT) and target (target only) |
| `sack`, `kneel`, `spike` | passer only (no target; sacks count against neither passing nor rushing totals, per nflverse box scores) |

This fixes the scenario allocator's omission of targets on incompletions. `workload.py` is not
modified; the player layer has its own allocator.

- **Draws:** each assignment is a categorical draw over the team's **active eligible** players for
  that role, weighted by that player's role **share** (§3).
- **Separate RNG:** the allocator uses its own RNG, seeded `(run seed) XOR 0x9E3779B9`, so engine
  and team-layer draws are bit-identical with or without allocation. A test checks full engine
  traces with and without the allocator for 1,000 seeds.
- **Known simplification (disclosed):** yardage comes from the engine's play, not from the player.
  Receivers differ only through share, so catch rate and yards per target are equal within a
  team-play. Player efficiency is out of scope for v0.4.0.

## 3. Shares (cutoff-safe, fixed rules; nothing tuned)
- **Evidence:** the team layer's rule 1, unchanged. Games kicked off at least 24 hours before the
  target, at most 730 days old, recency weight `2^(-age/120)`.
- **Player identity:** nflverse `gsis_id`, from play-by-play `passer_player_id`,
  `rusher_player_id` and `receiver_player_id`.
- **Raw role share:** a player's recency-weighted count of role events for **his current team**
  divided by the team's weighted total for that role. Roles are pass attempts plus sacks for the
  passer, carries for the rusher, targets for the receiver.
  - Only games with the target team count. A player's history with another team informs nothing
    in v0.4.0, and this is disclosed.
- **Shrinkage:** `share = (w_player + K · prior_pos) / (W_team + K)`, then renormalised over the
  active eligible players.
  - `K = 20` weighted events for every role.
  - `prior_pos` is the league-wide recency-weighted share for that player's position and role
    rank, computed in the same evidence window.
- **Eligible positions per role:**
  - passer: QB
  - rusher: QB, RB, WR, TE, FB
  - target: RB, WR, TE, FB
- **No history:** an active eligible player with no evidence gets `prior_pos` only.
- **Zero eligible:** if a team has zero eligible active players for a role, the engine's play still
  counts in team totals, but the event is attributed to `unassigned:<role>`. It is counted and
  reported, never dropped silently.

## 4. Availability (who can receive a share)
- **Source:** the active list per game is nflverse weekly rosters with `status == "ACT"` for that
  team and week.
- **Scenario:** this is the gameday active list, made public about 90 minutes before kickoff. The
  forecasts are therefore labelled **"inactives-known"**, not early-week forecasts. This is
  disclosed in every report.
- **Unknown players:** a player missing from the roster source is not eligible, and is counted
  when they appear in the play-by-play.

## 5. Data, exposure and splits
- **Sources:** nflverse play-by-play 2022–2025 and weekly rosters 2022–2025.
  - Each is recorded with an immutable URL, SHA256 and `retrieved_at`.
  - Downloads happen only after this protocol is agreed.
- **2025 regular season (272 games) is the decision set.** It has never been downloaded or
  inspected by Claude.
  - The `games.csv` already fetched for v0.3.x (`9150a9d8…`) contains 2025 schedule and result
    rows. They were not analysed: the loader filters to 2022–2024.
  - Codex and Elo should state their own 2025 exposure in their read-backs.
- **2024 player outcomes:** these are a development and diagnostic set only. They may be reported,
  but nothing in §3 or §6 is fixed or changed from them; `K`, the priors and the eligibility rules
  are frozen here.
- **2025 team effects:** these use the unchanged team-layer code, with evidence from 2023–2025
  under rule 1.

## 6. Arms, runs and metrics (frozen before any 2025 outcome is read)
**Arms** (all on the same simulated plays):

| arm | allocation shares |
|---|---|
| **P** (player layer) | team layer D plus §3 shares |
| **A** (control) | team layer D plus position-prior shares only (`prior_pos`, renormalised over active players) |
| **H** (historical player baseline) | not simulated: the recency-weighted empirical distribution of the player's own prior per-game stat values with that team (rule-1 evidence). Fewer than 4 prior games falls back to the position-level weighted empirical distribution. |

**Runs.**
- 2,000 runs per game for arms P and A, which share every engine seed and allocator seed.
- Disjoint per-game streams: run j of game i uses seed `1701 + 2000·i + j`, with games ordered by
  `game_id`.
- Old opening-TD OT does **not** apply to 2025, which used the both-possessions regular-season
  rule. 2025 runs use `both_possessions=True`. This is the one engine setting that differs from
  v0.3.x, and it is disclosed.
- 34-game shards with SHA256 checkpoints; every completed shard is recomputed on resume. The
  scorer fails closed, as in v0.3.1.

**Evaluated population (fixed before the game, never on outcomes).** Active players whose
pre-game §3 share is at least 5% in at least one of their roles. Each stat is scored only for
players eligible for that stat's role.

**Metrics.**
- CRPS per stat per player-game.
- 80% interval coverage per stat.
- Mean per stat across the evaluated population.
- **Uncertainty:** a paired bootstrap that resamples **games**, so players in a game stay together.
  10,000 resamples, seed 20261108, 95% percentile intervals.
- Monte Carlo SE per metric, from run-level resamples as in v0.3.1.

**Decision (A): "the player layer adds value". All must hold on 2025:**
1. P−A mean CRPS < 0, with a CI excluding 0, for **receiving yards** and **rushing yards**.
2. P−H mean CRPS < 0, with a CI excluding 0, for **receiving yards** and **rushing yards**.
3. P−A and P−H CIs include 0 or lie below 0 for **passing yards**, **receptions** and **carries**
   (not shown worse).
4. P's 80% coverage is within ±5 points for receiving, rushing and passing yards.

**Decision (B): member or market use is not evaluable under this protocol.** No verified historical
player-prop prices are among the sources. Any (B) would need a separate protocol with a price
source, plus the owner's approval.

A CI that includes 0 is a screening rule, not equivalence. If (A) fails, the result is preserved.
Nothing is tuned on 2025, and no metric or threshold is added after outcomes are read.

**Secondary, reported but not part of any decision:** team layer D versus league-only A on 2025
margin, total and Brier, under the v0.3.x metrics. This is an out-of-sample check of the team layer.

## 7. Tests before any 2025 run
- The allocator conserves team totals exactly.
- Every engine kind maps per §2, including targets on incompletions and interceptions.
- The allocator RNG is independent: full traces are identical with and without allocation over
  1,000 seeds.
- Share shrinkage and renormalisation behave as specified, including zero-history players and a
  team with no eligible player.
- Cutoff: no evidence row breaks rule 1 for any target.
- Arm H's empirical distribution uses only prior games and falls back as specified.

## 8. Not in scope
- player efficiency (yards per target or carry)
- cross-team player history
- early-week (pre-inactives) forecasts
- injuries beyond the active list
- props markets, kicking, defense, weather
- member UI, database writes, notifications

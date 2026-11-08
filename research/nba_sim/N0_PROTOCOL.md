# N0: sources, feasibility and exposure (Claude), revised for read-back

Responds to Elo's review (#65 comment 6720498997) of `SCOPING_PLAN.md` and `N0_FEASIBILITY.md` at
`eb22ede`. It supersedes `N0_FEASIBILITY.md` as the N0 record; that note is kept unchanged as history.

Nothing here is fitted, simulated or forecast. Labels used:
- **[verified]**: checked in this session, with the evidence stated.
- **[pending]**: a check defined here, with its pass rule, that has not been run yet.
- **[Mike]**: needs Mike's decision.

## 1. Source availability
Release `espn_nba_pbp` in `sportsdataverse/sportsdataverse-data`. Files are named
`play_by_play_<end year>.csv`, alongside `espn_nba_player_boxscores/player_box_<end year>.csv`.

| season | file | status (probed 2026-11-08 10:53Z) |
|---|---|---|
| 2022-23 | `play_by_play_2023.csv` | **[verified]** available (HTTP 206 on a byte-range request) |
| 2023-24 | `play_by_play_2024.csv` | **[verified]** available (206) |
| 2024-25 | `play_by_play_2025.csv` | **[verified]** downloaded in full: 278,232,752 bytes, sha256 `9b89f85cda34d983cdaa6080317f054c5b210ad82aa48446cf201b2152d6c307`; `player_box_2025.csv` also downloaded (17,909,380 bytes) |
| 2025-26 | `play_by_play_2026.csv` | **[verified]** the asset exists (github.com answers 302 to release-asset 609614414/ff25a0c1…). The earlier 504 was this session's proxy timing out on a full transfer, not absence. Contents not retrieved. |
| 2026-27 | `play_by_play_2027.csv` | **[verified]** the asset exists (302 to 609614414/1b25988b…). **Contents deliberately not retrieved** (see §6). |

The earlier note's suggestion to switch to ESPN per-game summaries for 2026-27 is **withdrawn**. The
season asset exists. How fresh it is during the season is **[pending]**: before N3, record the asset's
update cadence from a later probe, without reading game rows. A per-game source would only be added
through its own validation.

## 2. Game population (2024-25)
**[verified]** 1,234 game IDs have `season_type` 2:
- 1,230 standard regular-season games: 28 teams with 82 games, plus MIL and OKC with 83 each.
- 1 NBA Cup championship: `401734908`, MIL @ OKC, 2024-12-17, played at a neutral site and not
  counted in the standings. That is why MIL and OKC show 83.
- 3 All-Star exhibition games, with team codes CHK, KEN, SHQ and CAN (2, 1, 2 and 1 appearances).

**Rule:** the All-Star codes are always excluded. The Cup championship is kept for engine fitting
(it's a real NBA game) and flagged `neutral_site`, with no home-court term applied to it. It is excluded
from any standings-based check.

**[pending]** The same reconciliation for 2022-23 and 2023-24, run against the schedule before N1.
Any unexplained ID blocks N1.

## 3. Possession and accounting validation
**[verified]** on the 1,231 kept 2024-25 games:
- **Final scores:** the last row in `game_play_number` order matches the summed box-score points for
  both teams in **1,231 of 1,231** games.
- **Ordering:** `game_play_number` strictly increases within every game. `sequence_number` does not
  (4,510 inversions across 1,151 games), so ordering must use `game_play_number`.
- **Rows without a team:** 7,424, all of which are period or game boundaries and reviews:
  - End Period 4,988; End Game 1,231;
  - referee reviews or challenges 1,198;
  - Jumpball 6; "Not Available" 1.

**[pending]** These are N0 pass rules. Each must be run and reported before N1 is frozen.

1. **Possession reconstruction:**
   - A possession ends on a made field goal (and an "and-one" closes only after its free throw), a
     defensive rebound, a turnover, the final free throw of a trip when made, or the end of a period.
   - It is retained after an offensive rebound, a team rebound to the shooting side, or a
     technical/flagrant free throw where possession stays.
   - Jump balls are resolved by the next team action.
2. **Pass rules:**
   - Reconstructed points per team equal the final score in every game.
   - The two teams' possession counts differ by at most 2 in at least 99% of games.
   - Free-throw sequences ("n of m") are complete. Missing items are counted per game.
3. **Fail closed:** any event that can't be assigned is counted by `type_text` and kept in the report,
   never dropped silently. A game with unassigned scoring events is excluded from fitting **and
   listed**. If more than 1% of games are excluded, N0 is blocked.
4. **Overtime:** 59 overtime games in 2024-25. Each OT period is treated as a 5:00 period. Period
   boundaries reset possession by the regulation arrow rule, taken from the first event of the period.

## 4. Prospective decision set (2026-27)
These are proposed rules. Each is to be frozen in N3, but stated now so N1/N2 can't drift.
- **Cohort:** regular-season games (`season_type` 2, excluding All-Star and the Cup championship)
  tipping at or after **T0 = 7 days after the N3 freeze commit**, through the last regular-season
  game. Games played before T0 are never prospective tests, including every 2026-27 game already
  played.
- **Forecast deadline:** stored at least 60 minutes before tip. The stored row is immutable and carries:
  - game ID and forecast time;
  - model artifact hash, source file hashes and the evidence cutoff;
  - the full distribution summary.
- **Missing or late forecasts** count against coverage and are never imputed. Decision (A) requires at
  least 95% coverage of the cohort; below that, no decision is made and the shortfall is reported.
- **Horizon:** one final evaluation after the regular season. **[Mike]** Set a minimum of 300 cohort
  games; below that, report only, with no decision.
- **No interim looks:** before the final evaluation, only operational completeness is checked (forecast
  stored, sources present). No metrics are computed, and nothing is tuned after T0.

## 5. Market comparator (B, prospective only)
**[verified]**, read-only, from `public.nba_observations` (kind `odds`, provider "The Odds API NBA")
for the 139 regular-season games played up to this check:
- **Coverage:** all 139 have pre-tip quotes. The quotes span 6 books (BetMGM, BetRivers, Caesars,
  DraftKings, Fanatics, FanDuel) and the h2h, spreads and totals markets.
- **Timestamps:** every observation has both the provider's update time (`observed_at`) and our
  receipt time (`recorded_at`). The average receipt lag is 22–61 s depending on the book.
- **Staleness:** for FanDuel spreads, the last pre-tip quote was within 60 minutes of tip in **14 of
  42** games (week of Oct 19), **9 of 48** (Oct 26) and **49 of 49** (Nov 2, after the 10-minute
  pre-tip refresh). Early-season quotes were up to 17 hours old.

**Rules, proposed for N3:**
- **Comparator:** FanDuel spreads and totals, plus FanDuel h2h for win probability. Use the last quote
  with `observed_at < tip` and `observed_at ≥ tip − 60 min`.
- **Fair probabilities:** no-vig, from the two-sided prices. For the margin and total distributions,
  use a normal centered on the line, with an SD fixed from the development seasons before T0.
- **Exclusions:** a game without a valid quote is excluded from (B) and counted. (B) requires a valid
  quote for at least 90% of the cohort.
- **What this is:** a recorded observation is a quoted price, not a fill. (B) measures forecast
  quality against that quote and claims no tradable edge.

## 6. Exposure ledger

| data | who | when | depth |
|---|---|---|---|
| 2022-23, 2023-24 play-by-play | Claude | 2026-11-08 | availability probe only (byte range) |
| 2024-25 play-by-play and box scores | Claude | 2026-11-08 | downloaded and parsed; field coverage, game reconciliation and final-score reconciliation. No model or outcome analysis beyond those counts. |
| 2025-26 player box scores | Claude (NBA shadow model) | Oct 2026 | **used as the shadow model's test season**, so its outcomes have been seen |
| 2025-26 play-by-play | — | — | asset existence only |
| 2026-27 schedule, results, odds (`nba_games`, `nba_game_results`, `nba_observations`) | Claude, Codex and the platform | season to date | the app shows schedules and finals; for N0 only odds coverage and timestamps were counted. No game outcomes were analysed. |
| 2026-27 play-by-play | — | — | asset existence only; contents not retrieved |

Codex and Elo should add their own rows in read-back. `SCOPING_PLAN.md`'s "nothing has been downloaded"
line is corrected to point here.

## 7. N0 disposition
**Not yet passed.** Sources (§1), the 2024-25 population (§2) and the market feed facts (§5) are
verified. **The minimum next step** is to run the §3 possession reconstruction and the §2 population
reconciliation for 2022-23 and 2023-24, report them, and only then freeze N1. Two items need Mike: the
§4 minimum sample, and confirmation of the §5 comparator. No feed, spending, credential, permission,
database, workflow or shared-app change is needed.

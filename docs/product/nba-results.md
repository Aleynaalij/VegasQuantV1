# NBA results — October 17, 2026

Step 2 of the NBA build: final scores and player box scores, recorded once and never changed, and a
grader for game lines and player props. No NBA picks, publishing or UI yet; nothing here touches NFL
tables or the NFL result sync.

**Tables** (migration `20261018070000_nba_results.sql`, all public read like `nba_games`):

- `nba_game_results`: final score, overtime flag, stat fingerprint, ESPN box score URL and the hash
  of the summary it was read from. Immutable.
- `nba_player_results`: one row per listed player: played, minutes, points, rebounds, assists,
  threes, steals, blocks, turnovers, and a `name_key` for matching sportsbook player names.
  Immutable.
- `nba_result_progress`: why each game is or is not recorded yet (`AWAITING_FINAL`, `CONFIRMING`,
  `FINAL`, `INCONSISTENT`, `CONFLICT`, `NO_RESULT` for postponed or cancelled games).
- `private.nba_result_corrections`: append-only journal of box scores ESPN changed after a game
  was recorded.

**How a game becomes final.** The `nba-results` edge function (cron `nba-results-refresh`, :09 and
:39) reads ESPN's game summary for games that tipped 2+ hours ago, up to 20 a run, and passes it
to `record_nba_result`. The database, not the function, decides:

1. ESPN must mark the game completed (`STATUS_FINAL`).
2. The box score must add up for both teams: player points equal the final score, and player
   rebounds, assists and threes equal ESPN's team totals. At least five players per team played.
   Otherwise the game is `INCONSISTENT` and nothing is staged.
3. The same stat fingerprint must be read again at least 3 hours after the first final read. A
   different read restarts the clock.

NFL results are corroborated by a second provider (nflverse). NBA.com, the obvious second source for
the NBA, refuses requests from Supabase's network (HTTP 403, tested October 17, 2026), so NBA
relies on these internal checks and the 3-hour confirmation instead.

**Corrections.** Recorded games are re-read every 6 hours for 3 days. A changed box score is
journaled once in `nba_result_corrections` and the game is flagged `CONFLICT`; the recorded result
stays as it is and grading for that game returns `REVIEW` until someone looks at it.

**Grading.** `nba_grade(game_id, market, side, point, player)` uses The Odds API's market keys:

| Market | Side | Rule |
|---|---|---|
| `h2h` | team name | the team won |
| `spreads` | team name | team score + point vs opponent; equal is a push |
| `totals` | Over / Under | combined score vs point |
| `player_points`, `_rebounds`, `_assists`, `_threes` | Over / Under | the player's stat vs point |
| `player_points_rebounds_assists`, `_points_rebounds`, `_points_assists`, `_rebounds_assists` | Over / Under | sum of the stats |

Overtime counts. Results: `WIN`, `LOSS`, `PUSH`; `VOID` when the player was listed but did not
play; `PENDING` until the game is recorded; `REVIEW` when the game is in `CONFLICT` or the player
name does not match exactly one box score line. Names match after folding case and accents and
dropping punctuation and Jr/Sr/II–IV suffixes.

Since migration `20261018080000_nba_shadow.sql`, player rows also store `starter` and `position`
(rows recorded before it have nulls); the NBA shadow model uses them as live inputs.

**Not yet:** NBA research board (step 3) and a results view in the app. The NBA shadow model and
scorecard (step 4) are in [research/nba/MODEL.md](../../research/nba/MODEL.md).

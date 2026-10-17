# NBA source feed — October 17, 2026

Step 1 of the NBA build: data only. No NBA picks, projections, research board or grading yet.

**Separate tables.** NBA games and provider facts live in `public.nba_games` and
`public.nba_observations` (migration `20261018060000_nba_source_feed.sql`), never in `games` /
`source_observations`. NFL pages, the NFL selection gate, the research board, the shadow model and
result sync all read `games` and assume NFL, so keeping NBA apart means none of them can pick up an
NBA game by accident. The schedule is public; prices and injuries are members only, like NFL.
Observations are append-only and deduplicated by fingerprint.

**What the `nba-sync` edge function collects** (cron `nba-source-refresh`, every 15 minutes, same
feed credential as `source-sync`):

- ESPN scoreboard, yesterday through a week ahead: schedule, tip-off, venue, status, and scores once
  a game starts. Teams use The Odds API's names (ESPN's "LA Clippers" is stored as "Los Angeles
  Clippers") so price matching is exact.
- ESPN injury report for teams playing in the next 48 hours. Missing from the report is not
  clearance.
- The Odds API game lines (moneyline, spread, total) from FanDuel, DraftKings, BetMGM, Caesars,
  BetRivers and Fanatics (one region's cost): every 3 hours while a game is within 36 hours, every
  30 minutes within 2 hours of tip. About 3 credits a call.
- The Odds API player props (points, rebounds, assists, threes main lines by default) per game:
  every 6 hours until 8 hours out, every 2 hours, then every 30 minutes in the last 2 hours; at most
  15 games a run. About 4 credits per game per call. The events list is free.

**Credit switches.** `private.nba_feed_settings` holds `lines_enabled` (on), `props_enabled` (off),
`prop_markets` and `max_prop_events`, so spending can change with one SQL update and no redeploy.
Every paid call records The Odds API's `x-requests-remaining` / `x-requests-used` headers in
`feed_runs.details` (`credits_remaining`, `credits_used`). Rough monthly cost at a full schedule:
game lines about 2,000 credits; props about 10,000 with the default four markets.

**Not yet:** NBA results grading (step 2), the NBA research board (step 3), the NBA model and
scorecard (step 4), and NBA feed health alerts.

# Claude · Shaq
Updated: 2026-10-17T16:35:00Z
Mailbox: https://github.com/Aleynaalij/VegasQuantV1/issues/65

## Current task
NBA-001: NBA source feed (step 1 of the NBA build). PR #64 merged (6cbb005); ledger state `deployed`, `verified` after the first game-line pull.

Claimed files:
- `supabase/migrations/20261018060000_nba_source_feed.sql`
- `supabase/functions/nba-sync/**`
- `tests/nba-feed.test.ts`, `tests/nba-source-feed.test.ts`, `tests/sql/nba-source-feed.mjs`
- `docs/product/nba-source-feed.md`
- this page

## State (prepared / deployed / verified)
- **Migration `20261018060000`:** applied live (owner approved in chat). Tables `nba_games` and `nba_observations`, `private.nba_feed_settings` (lines on, props off), cron `nba-source-refresh` at :02/:17/:32/:47.
- **nba-sync v1:** deployed. First run at 15:02Z FAILED with "Provider returned 400". Diagnosed with a direct request: ESPN's NBA scoreboard rejects date ranges (400) and accepts single dates (200). Nothing ingested; no Odds API credits spent.
- **Fix on PR #64 (6ff8ebe):** scoreboard fetched day by day (9 dates). It also addresses Codex's P2: a prop fetch time is cached only after ingest succeeds. Deployed as nba-sync v2 at ~15:53Z.
- **Verified live at 16:02Z:** 48 games (12 preseason, 36 regular season through Oct 25) and 96 observations. Lines "not due", since there's no game within 36 h; they start ~Oct 19 07:00Z. Props off. Evidence: https://github.com/Aleynaalij/VegasQuantV1/issues/65#issuecomment-6236375001
- **16:17Z re-check:** ESPN ok, 48 games, 0 new rows (unchanged games are skipped, so `updated_at` means last changed).
- **NBA-002 / PR #66 (Codex):** reviewed, wording fix confirmed, merged as b73c8b1 at ~16:30Z; production deploy READY. As anon, 48 games are visible and observations are 0 (member-only, as designed). I couldn't load the rendered page from this container (the proxy blocks vegasquant.app), so a browser check on the live page is still open.

## Interface for NBA UI (Codex)
- `public.nba_games`: public read. Columns: id, provider_id, slug, away_team/home_team (Odds API spelling), abbreviations, tipoff, tipoff_tbd, venue, season, season_type, status (ESPN `STATUS_*`), away_score/home_score.
- `public.nba_observations`: members only, kind ∈ schedule|score|injury|odds|prop.
- `feed_runs`: admin read. Providers `ESPN NBA`, `ESPN NBA injuries`, `The Odds API NBA`, `The Odds API NBA props`, `nba-sync`.

## Next
1. ~Oct 19 07:00Z: verify the first NBA game-line pull and the credits_remaining header.
2. Proposed next claim: NBA results grading (step 2). Not started.

NFL check-ins scheduled at 15:35Z and 20:30Z (shadow evaluation run, evening prop capture). No other background monitoring.

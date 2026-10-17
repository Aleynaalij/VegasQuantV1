# Claude · Shaq
Updated: 2026-10-17T19:40:00Z
Mailbox: https://github.com/Aleynaalij/VegasQuantV1/issues/65

## Current task
NBA-004: NBA shadow model and scorecard (step 4), owner-approved ("do what you recommend"). Branch `ccr-a76c413a-pumo6p`. Claim: https://github.com/Aleynaalij/VegasQuantV1/issues/65#issuecomment-6238944472

Claimed files: `research/nba/engine.py`, `hosted_scan.py`, `shadow_report.py`, `MODEL.md`, `requirements.txt`, `artifacts/**` (and one line appended to `research/nba/README.md`); `supabase/migrations/20261018080000_nba_shadow.sql`; workflows `nba-shadow-scan.yml`, `nba-shadow-report.yml`, `nba-model.yml`; `tests/nba_model/**`, `tests/nba-shadow.test.ts`, `tests/sql/nba-shadow.mjs`; this page.

- **Model v0.1** (hoopR/ESPN box scores, minutes x per-minute rate): beats the player's own recent history on the held-out 2025-26 season for points and rebounds (game-clustered 95% intervals below zero). Not tested against the market yet; that is what the shadow journal is for.
- **Prepared, not live:** migration and the nba-results redeploy (starter/position) need owner approval.
- **NBA props:** owner approved limited capture (points + rebounds, 8 games a run); the settings update is with the owner to run.

Also open: NBA-003 (results) is merged and deployed; 12 preseason finals confirming, check-in 22:50Z. NBA-001 game-line check ~Oct 19 07:00Z. Codex owns NBA-005 (research board, `src/**`).

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
2. NBA-003: PR, owner approval, apply + deploy, verify the preseason finals record after the 3-hour confirmation.

NFL check-ins scheduled at 15:35Z and 20:30Z (shadow evaluation run, evening prop capture). No other background monitoring.

# Sportradar NFL live-data connection

Owner requested NFL halftime support on October 22, 2026. The connection supports manual verification and scheduled private research collection. See automatic collection below for cadence, limits and remaining gaps.

## Initial setup state (superseded by activation below)

- No Sportradar secret name was found in Supabase Vault or Vercel project environment metadata during setup.
- Server adapter uses documented NFL v7 statistics and play-by-play endpoints.
- Admin → Feeds shows configuration blockers and a manual one-request preview.
- Requests require the existing verified administrator check (including two-step verification) and same-origin POST.
- No automatic polling, paid subscription, signup, public data display, database source persistence, player mapping, pick publication or grading is enabled.
- A trial response is not evidence of a production license. No provider quote has been received.

## Connect securely

1. Create or select a Sportradar account in [Marketplace](https://marketplace.sportradar.com/) and add the **NFL league-based API v7** product/trial. Confirm actual trial coverage, expiry, QPS and rolling quota in that account. Sportradar advertises a 30-day trial; terms and entitlement must be checked.
2. Add server-only Vercel production environment variables to the existing Vegas Quant project:
   - `SPORTRADAR_API_KEY` — sensitive secret, never `NEXT_PUBLIC_*`, never paste in chat or commit.
   - `SPORTRADAR_ACCESS_LEVEL` — `trial` or `production`, matching the key.
   - `SPORTRADAR_NFL_ENABLED` — `true` only when ready for manual verification.
3. Redeploy the approved main commit to load the new environment. A configured status means **ready to verify**, not connected/live verified.
4. Obtain the provider's game UUID from its NFL weekly schedule. Do not use Vegas Quant, ESPN or GSIS IDs interchangeably.
5. In Admin → Feeds, fetch one private statistics or play-by-play preview. Verify game/team IDs, kickoff, status, clock, current-period completeness, corrections, hashes, source URL and timestamps. Provider `Date` / `Last-Modified` are stored separately from receipt time; a provider generation timestamp remains unknown.
6. Ask sales for a production quote covering NFL live play-by-play, team/player stats, PWA/web display, commercial editorial analysis, retained evidence/archives, derived analysis and any betting-adjacent restrictions. Confirm setup fees, minimum term, quotas, SLA/latency, overages and historical/replay rights. Exact cost is **quote required**; no published price is assumed.

## Before public halftime integration

Build a reviewed immutable observation schema and retention policy matching the license; explicit provider game/player ID mapping; correction-aware ingestion; freshness and partial-feed indicators; and replay tests against recorded games. Confirm a polling cadence within the account quota (the API's live 3-second cache TTL is not a latency guarantee or permission for unlimited polling).

Only then connect the live context to current, separately verified sportsbook quotes and human editorial review. Missing opportunities/role/availability stay unknown. Never infer live routes, snap counts, injuries, NGS tracking, model edges or executable prices from this connector. Existing publication gates and NFL official rules remain in force.

## Sources checked October 22, 2026

- [Authentication](https://developer.sportradar.com/getting-started/docs/authentication): server-side `x-api-key` header.
- [NFL API basics](https://developer.sportradar.com/football/docs/nfl-ig-api-basics): v7, trial/production, provider IDs.
- [Game statistics](https://developer.sportradar.com/football/reference/nfl-game-statistics).
- [Play-by-play](https://developer.sportradar.com/football/reference/nfl-play-by-play).
- [Live workflow](https://developer.sportradar.com/football/docs/nfl-ig-live-game-retrieval).
- [Trial and quote](https://sportradar.com/media-tech/data-content/sports-data-api/).

## Branding and reinstall notice

NFL Next Gen Stats technology is powered by AWS; Vegas Quant receives historical summaries via nflverse. The opening retains those separate statements. It does not claim a direct AWS feed or partnership.

Legacy icon URLs have matching gold artwork. Android/iOS may cache an installed splash independently of the site. A per-account/device required acknowledgement at the next signed-in visit explains removal/reinstallation; browser-only users can acknowledge the refreshed website. Websites cannot uninstall an app, force OS icon refresh, or prove that a reinstall took place. Acknowledgement is local UI state, never authentication/authorization or verified reinstall evidence.

## Activation check

The connector also accepts `SPORTSRADAR_API_KEY`, the owner's existing sensitive secret name. The canonical `SPORTRADAR_API_KEY` takes precedence. No secret is read back, copied or printed.

Run `node --import tsx scripts/sportradar-verify.ts` only in an authorized server environment. It makes at most three calls: current-week schedule, then one selected game's statistics and play-by-play. It prints hashes, source/receipt metadata and sanitized statuses, never keys or raw payloads. It is not a build hook or scheduled poll. A one-off deployment build-command override may run it after `npm run build` for setup verification. Receipt success does not prove live freshness or grant public display rights.

## Automatic private collection — October 22 activation

The owner verified a statistics preview for NE–CHI and authorized unattended collection. `private.dispatch_sportradar_collection()` calls the token-authenticated production `/api/internal/sportradar` route from Supabase Cron every five minutes. The owner does not need to open the app. Only the new dispatcher secret is shared through Vault; the provider key stays in Vercel.

Schedule discovery is cached for twelve hours. Game feeds start ten minutes before scheduled kickoff and stop after six hours or a stored `closed` statistics response. Each run rotates at most two eligible games, least recently checked first; overlapping games can therefore have intervals longer than five minutes. Both statistics and play-by-play are attempted independently; ID and home/away team identity must match the provider schedule. Postponed/canceled games are excluded. Later corrections within the collection window append new snapshots; this does not implement long-term postgame correction reconciliation.

`sportradar_runs` retains attempts, failures, missed rotations and interrupted workers. `sportradar_snapshots` retains private payloads, access level, exact source URL/hash and separate receipt/provider HTTP times. Anonymous/member reads and writes are denied; server service-role reads and inserts only for snapshots. No public display, grading, published selections, inferred availability, derived odds or model approval is added. Admin → Feeds reports the latest stored run and snapshots. Snapshot receipt is not live freshness validation. The public research-publishing agent can inspect the durable hosted evidence through its supported administrative connector, with timestamps and freshness limitations.

Safety budgets are **150 attempted calls per rolling 24 hours and 500 per rolling 30 days**, including failures (five maximum per run). These are our local limits, not the account's verified quota. Manual previews also consume provider quota and are not counted in these automatic budgets. Provider 429/401/403 and schema/identity/storage failures remain visible; no automatic purchases or upgrades occur. Five-minute polling is a research sampling cadence, not a real-time trading or delivery guarantee. In a large slate the budget/rotation can leave coverage gaps. Trial expiry from the owner's receipt is November 21, 2026; commercial display/retention rights remain unverified. Raw trial collection stays private.

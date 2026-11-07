# Research lounge — draft review packet

## Product and routes

The event ledger replaces image-first browsing at `/research`. The lobby's existing
`/feed?view=latest` entry routes to it in the browser, after preserving legacy `#release-…`
fragments. `release=`, `view=selection`, contributor redirects, bare `/feed` → Zone and historical
publication browsing remain intact. PR #139 was inspected; its broad older feed/Slots changes
are not reapplied or closed. This draft starts from main `647787a52a05f2dd08a98784288a7fbdcd34ce43`.

Evergreen/champagne surfaces, serif event headings, compact source metadata and restrained sport
accents match the lounge. There are no hero pick images. Event cards open a dossier with the
original sport + game ID, schedule, topic evidence, sources and existing matchup/lay journeys.
Sport, topic, ET date, search and dossier identity live in the URL, including Back and reload.
The working horizon is the next seven days (plus ongoing/recent schedule entries); it is stated
in the UI. Topic filtering retains events with unknown coverage, with explicit gaps rather
than implying a complete injury/lineup search. Search covers loaded research, not the entire web
or names only present in the separately loaded live lineup response. Long ledgers page in 24 rows.

## Coverage and source matrix

These are existing stores/readers; no ingestion, provider subscriptions, live settings, schema or
publication writes are added. Protected reads retain membership checks and database RLS.

| Sport | Schedule and identity | Dossier inputs | Provenance / actual limits |
| --- | --- | --- | --- |
| NFL | `games`: canonical ID, slug, kickoff/TBD, venue/roof, schedule source and observation | Exact `game_id` in `analysis_versions`, `research_feed_posts`, `market_snapshots`, collector `source_observations` (injuries/news/weather and FanDuel odds), and `published_legs`; both prose sections and structured injuries/weather/teams | Original topic publication dates retained, including inherited structured fields. Explicit issued/observed source times are separate from publication. No inferred starters; missing weather/availability is unknown. |
| NBA | `nba_games`: canonical ID, ordered teams, start/TBD, venue/status, source URL | Exact `game_id` in `nba_observations` injury/odds/prop; existing protected `/api/nba/lineups` reader | Observation vs receipt times distinct. Schedule `updated_at` is NOT labelled source freshness. Existing RotoWire lineup reader requires exact ordered teams, ET date/time, distinct complete confirmed fives and current report. Expected is not confirmed. |
| NHL | Existing `sports_slate(nhl,7)` contract with canonical ID/sport | Same-ID protected facts, markets and selections; existing `nhl_game_context` component inside lineup section | Quoted markets retain original observed time/source. Injuries from existing fact parser. Context reader includes goalie/source status and missing-source states. No roster-to-starter inference. |
| NCAAB | Existing `sports_slate(ncaab,7)` contract | Same-ID protected context facts, reported injuries and ML/spread observations, editorial selections | Availability may be absent. No college props or totals added. No invented lineup or outdoor weather coverage. |

Source links are HTTPS-only without embedded credentials. Missing links/times stay visibly unknown.
Collected time never substitutes for source observation. Quotes use a 30-minute display-age warning;
other explicit source times use a one-hour display warning. These are age labels, not a claim that
the upstream provider has updated. No validated probability, hidden-liability or sharp-money claim
is generated. Existing source text/interpretation is labelled separately from provider reports.

### Read-only live inventory (November 6, 2026, 23:25 UTC)

This is a coverage count, not validation of every report. In the upcoming seven-day window:
15 NFL events had collector injury observations, 51 NBA events included 18 with injury rows in the
last 48 hours; NHL had 48 events / 15 with facts, NCAAB 387 / 128 with facts. NFL had zero analysis
versions/weather briefings for the upcoming games in the inspected stores, but 71 exact game-linked
published legs. The adapter includes collector observations separately so an absent analyst version
cannot hide actual injury/news collection. No weather briefing is fabricated to fill that gap.

## Failure and privacy behavior

Schedule/research failures appear as partial coverage with retry, rather than “no games”. A successful
empty schedule, no filter matches, missing topic, event outside the horizon, signed-out and access-denied
states are distinct. Query display caps are disclosed. Viewer changes invalidate pending reads and clear
protected content before refetching; stale responses cannot repopulate a previous account's findings.
No source data is saved in browser storage. NBA lineup and NHL context readers retain their own gates.

## Vegas Fear — bounded feasibility, no implementation activated

`research/nfl/Sportsbook_Fear_Index.txt` asks for public/sharp side, liability, trap risk and an exposure
rating. Those are desired outputs, not evidence that VQ has the required inputs. The current app has
historical `pick-card` Fear display, `lobby-intelligence` Coming soon, and `intelligence.ts` market/quote/
split/news/model types. Existing `market_snapshots`, `intelligence_quotes` (book, line, odds, observed vs
created/time basis), NBA observations and sport markets provide potential descriptive movement inputs.
No new score or lobby activation is part of this draft.

Proposed first display: **Market pressure**, per exact sport/game/market/book/period, showing actual
first vs latest eligible observations, elapsed interval, source/time, number of books and missing coverage.
Compute movement only across the same exact selection/threshold contract. Show book dispersion only
when contemporaneous comparable quotes really exist. Attach injury/weather/lineup changes only through
exact event identities and actual source dates. Do not call descriptive movement predictive or low
movement low risk. Public ticket/handle splits need verified source, sample/window and time basis.
No hidden liability, “sharp money”, trap or composite Fear number follows from current gaps. Elo owns
the final method and separate accepted release; Coming soon remains unchanged.

## Simulator handoff

Ownership was explicitly released to Claude in issue #65 comment `6698272320`. Accessible package
`f5d1bc023fa1bd9dd730ed16d6d0760981e636bf` was fetched; its 220 scoped files were individually hashed
and inventoried in that comment. Tree `4f3a28ae24b7d3187d93ceb1f5035ba50aac7b4d`. The newer reported
`3d984999…` recovery package is absent from both relevant accessible checkouts checked; transfer is
not claimed. Source/artifact failures and frozen-protocol gates remain; no model qualification implied.

## Verification / release boundary

- 44 relevant local unit tests passed (hub, game research, research facts, lineup identity, sport adapters,
  feed timeline); TypeScript passed.
- Production build passed with structured fields and legacy-fragment preservation. Remote exact-head
  CI results must still be attached before acceptance.
- Local Chromium launch fails before page load: `socket() failed: Operation not permitted`, SIGABRT.
  No local browser pass or screenshots are claimed.
- Dedicated `Research hub draft acceptance` workflow covers 360/390/1280 in both themes, screenshots,
  filters, dossier Back/reload, identity/time checks, source failures/retry, missing/empty/denied and account
  clearing. Negative controls deliberately break identity rejection, unknown freshness and failure display.
  Until that actual job succeeds, browser evidence remains pending; fixtures are synthetic, not live coverage.
- No merge, deploy, hosted migration, provider-budget/access change, real-member write, notification,
  wager, simulator change or model approval is included. Final release requires Elo review, remote UI
  evidence and explicit production acceptance. Existing open records/Dealer/Kalshi drafts remain separate.

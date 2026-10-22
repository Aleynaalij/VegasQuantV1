# NFL NGS integration and official-feed procurement

Owner authorization: October 22, 2026. NFL is the priority; the NBA pause remains unchanged.

## What is connected

Public weekly passing, rushing and receiving summaries from NFL Next Gen Stats via nflverse.
`research/ngs/collect.py` discovers the current release assets, preferring compressed CSV, validates
identity/schema/timestamps and imports the current and previous NFL seasons. The aggregate `.csv`
URLs in older loader documentation returned HTTP 404 during verification; the release's actual
`ngs_passing.csv.gz`, `ngs_rushing.csv.gz` and `ngs_receiving.csv.gz` were reachable and current.

`nfl_ngs_snapshots` keeps immutable file-level source hashes, source update and actual retrieval
times, selected seasons and normalized player-week rows. The SHA-256 identifies the downloaded
compressed bytes. Original metric values and source team abbreviations are retained; legacy team
codes are normalized for matching. Unchanged source hashes dedupe; changed sources append snapshots.
The original compressed public source stays linked. No GSIS credentials or paid feed are connected.

The game research page has an expandable **Next Gen Stats · historical player context** panel.
The member/age-protected `nfl_ngs_game_context` RPC returns the latest reported row per player/team
from the three regular-season weeks before that matchup, with source metadata and attribution.
Season-total week 0, current/future matchup weeks and snapshots retrieved after a selected historical
research version are excluded. Historical team labels do not prove current roster/availability.
Missing players/metrics are unknown, never zero. Minimum-attempt qualifications limit coverage.

This is descriptive research context, not live tracking, a calibrated forecast or validation of the
existing SHADOW_ONLY model. It does not change gates, probabilities, selections, grades or bankrolls.
Researchers may read stored snapshots for deeper prior-season review while preserving their cutoff.

## Collection and operation

`.github/workflows/nfl-ngs.yml` uses the existing repository database secrets, stdlib Python and
the service-only `ingest_nfl_ngs` RPC. It runs once daily at 10:20 UTC (6:20 AM Eastern daylight time /
5:20 AM Eastern standard time), after the documented 3–5 AM Eastern upstream update window. It also
runs on relevant main-branch changes and supports manual workflow dispatch. GitHub may delay jobs;
the UI shows source and retrieval times rather than promising a freshness SLA. Each category fails
independently; failures do not replace an existing good snapshot. Public job output contains counts
and sanitized error classes only. Check `feed_runs` provider `nflverse NGS` and stored snapshots.

`python3 research/ngs/collect.py --output /tmp/ngs` validates/downloads without hosted writes.
`python3 research/ngs/collect.py --publish` imports with server credentials. Never put those secrets
in a browser, source file, public log or procurement request. Collection makes no sportsbook calls.

## Verified costs and rights — October 22, 2026

| Option | Verified access cost | Remaining requirement |
|---|---|---|
| nflverse public NGS summaries | No paid API subscription or key required for these public release downloads | Attribution to NFL Next Gen Stats via nflverse; CC BY 4.0. Existing Actions/hosting/database usage still applies. |
| Official live NFL play-by-play plus proprietary NGS | **Price unknown: vendor quote required.** No applicable public rate card was found on the official product/contact pages. | Genius Sports must confirm dataset entitlement, commercial use rights, price, contract, credentials and exact API/schema. |
| Direct GSIS | **Price and eligibility unknown.** No verified public self-service commercial plan. | NFL-authorized access and usage rights. The public GSIS terms restrict unauthorized commercial transmission/display. A login alone is not a redistribution license. |

nflverse's licensing statement permits commercial use of its CC BY 4.0 datasets with attribution
and notes that provider-specific licenses can differ. This integration uses the NGS summary release,
not the separately licensed FTN participation/route dataset. Attribution does not imply endorsement.

Genius Sports' official June 11, 2025 announcement identifies it as the exclusive distributor of the
NFL's real-time official play-by-play, proprietary NGS and official betting data feeds. Its public
API product page covers technology/media companies and includes NGS. This is the relevant commercial
inquiry route; an AWS account does not itself provide NFL dataset entitlements.

## Ready-to-send vendor inquiry

Destination: https://www.geniussports.com/contact-sales/

Subject: NFL official play-by-play and Next Gen Stats API quote — Vegas Quant / JourneyBuilt, LLC

We operate Vegas Quant (https://vegasquant.app), an NFL research and community website/PWA owned by
JourneyBuilt, LLC. We publish analyst research and player-stat selections; we do not accept or place
wagers. We are evaluating licensed official NFL live play-by-play and Next Gen Stats for pregame
and halftime analysis, historical research and sourced player/game statistics.

Please confirm:

1. The suitable media/analytics product and eligibility for this use case; whether official
   play-by-play, player box scores and NGS are one package or separately priced entitlements.
2. Exact NGS fields supplied: derived passing/rushing/receiving metrics versus raw player/ball
   coordinates; coverage of routes, participation, coverage assignments and pressure metrics.
3. Setup fees, monthly/seasonal/annual prices, minimum commitments, history/backfill fees, usage
   tiers/overages and separate charges for development, staging and production environments.
4. Rights to display attributed stats in our website/PWA, generate and publish derived analysis,
   retain an immutable historical evidence archive and use the data for internal model evaluation.
   Please distinguish permitted model inference from training, and any betting-content restrictions.
5. Documented latency, quarter/halftime availability, stat corrections, reconnect/replay support,
   uptime/support SLA, rate limits and technical delivery (REST/push), schemas and ID mappings.
6. Sandbox/sample NFL payloads and trial terms before a paid commitment, required company details,
   attribution/branding obligations and onboarding steps.

Please provide an itemized written quote and the applicable license/technical documents.

**Status:** Prepared only; no inquiry, signup, contract or purchase has been submitted. Company
contact details, a vendor response and owner acceptance of a specific price/license are still needed.

## Proposed live-feed build after entitlement

Confirm the written license and fields first; obtain sandbox credentials privately; validate
sample payloads and game/player identifiers; implement a separate source adapter with provider and
receipt timestamps, immutable source hashes and correction handling; replay/test score, clock and
player-stat reconciliation; test halftime latency and disconnect recovery; add stale/missing-source
UI states; deploy production only with the agreed entitlement and credentials. Keep the public NGS
summary collector as independently attributed background context. Do not guess live endpoints or
represent the public weekly dataset as the licensed tracking feed.

## Primary sources checked

- https://github.com/nflverse — licensing statement, commercial use and attribution.
- https://github.com/nflverse/nflverse-data/releases/tag/nextgen_stats — actual assets and update times.
- https://nflreadr.nflverse.com/reference/load_nextgen_stats.html — weekly summaries and qualifications.
- https://nflreadr.nflverse.com/articles/dictionary_nextgen_stats.html — metric definitions.
- https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html — source update window.
- https://www.geniussports.com/engage/official-sports-data-api/ — NFL/NGS API product.
- https://www.geniussports.com/newsroom/the-national-football-league-expands-and-extends-strategic-partnership-with-genius-sports-in-multi-year-deal/ — official distribution announcement.
- https://www.geniussports.com/contact-sales/ — commercial inquiry route.
- https://www.nflgsis.com/GameStatsLive/Auth/TermsAndConditions/ — GSIS distribution restrictions.

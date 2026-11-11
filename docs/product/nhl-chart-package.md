# NHL visual research package

Batch 1: three native 1080 × 1350 evergreen/gold pages per eligible game, posted by TheDealer in The Zone. These are research, not picks. The exact displayed PNG is downloaded. The shared NFL frame is extracted without changing its output (Sunday card 1 SHA256 regression checked).

## Metric inventory

| Requested input / chart | State | Current source / precise gap |
|---|---|---|
| Matchup, start, home/road, recent GF/GA | Available | Existing schedule payload + verified NHL.com regular-season final boxes; last five completed team games, dates printed |
| Player SOG, goals, points, rolling TOI | Available | Source-matched NHL.com final boxes; actual positive TOI; four leading shot-volume players on image, all available roster-matched rows in expanded table |
| Goalie status and recent GAA | Available, source-reported | Existing RotoWire report plus verified goalie boxes. Confirmed/expected/unknown and source retrieval time retained; does not establish final lineup clearance |
| Projected PP1 | Available, projected | Existing timestamped RotoWire source; historical team label does not establish activation |
| Full line combinations, injury/late-scratch updates | Being built | No reliable structured injury/5-on-5 line fields in current context. First daily snapshot does not automatically revise with late news; linked immutable revisions are next batch |
| Calendar rest, back-to-back, home/road | Available | Calculated from exact prior/current game dates. Off-days are not elapsed recovery hours |
| Game density / travel distance | Being built | Schedule-derived density and venue-coordinate calculation required; no verified travel itinerary; do not label calculated distance actual team travel |
| +1.5 puck line / price movement | Being built | Some existing moneyline/totals/player market snapshots exist; exact puck-line market, sportsbook timestamps and comparable observations not yet integrated. No odds displayed in batch 1. FanDuel Sports Network is not assumed to provide odds or account wagers |
| Shot-location rink maps | Being built | Current context cache excludes play-by-play. Add official PBP event coordinates, attacking-direction normalization, shot/attempt classification and tests first; define danger zones explicitly |
| Blocks / 60 | Available, limited context | Actual box-score blocks / summed verified positive TOI × 3600; top three historical defensemen per side, common chart scale. Recent all-opponent exposure; no claimed matchup floor |
| Opponent-specific blocks context | Being built | Need consistently sourced opponent shot-attempt/style sample and adequate per-opponent exposure |
| 32-team prop-defense matrix | Being built | Need all 32 teams' uniform event/position-at-game samples, ties, missing coverage and documented percentile denominator. Existing two-team last-five cache is insufficient |
| Corsi / Fenwick | Being built | Official event feed derivation not implemented: CF = SOG + missed + blocked attempts; FF excludes blocked; strength/game-state filters and event deduplication required |
| On-ice shot-attempt share | Blocked by missing joined coverage | Need verified on-ice players/shift joins at event time, valid TOI/strength samples; box-score possession cannot substitute |
| Individual xG | Blocked by missing validated method/source | No approved usable external xG dataset or documented fitted/validated shot-quality model integrated. Never rename danger-zone counts xG |
| Controlled entries / exits | Blocked by missing source coverage | Current NHL boxes/context do not identify controlled entries/exits. Need legitimate tagged source with usable terms; no new paid source authorized |
| Speed / shot velocity / shift duration | Being built / partial | NHL EDGE has public tracking information; supported machine-readable coverage and use terms need verification. Boxes expose shift counts, not actual shift-duration series or speed. TOI / shifts is not actual individual shift duration |

Missing statistics stay null, not zero. A missing game appearance is a dash. Top-player ranking is descriptive, not a selection. Goals/points are observed counts. No numerical edge or future scoring claim.

## Snapshot and publication

`private.nhl_chart_capture(uuid)` validates today's still-upcoming scheduled game, fresh context, exact game/cutoff, NHL/RotoWire HTTPS URLs and SHA256/retrieval provenance. It source-matches official final regular-season boxes, verifies body hashes and roster/player identities, and freezes public research only. Private favorites are excluded. Current-roster matching is source-bound and is not active-lineup confirmation. Each game/day has one stable immutable snapshot and one stable post ID. Failed/stale context remains blocked; no post-kickoff capture or backfill. Postponed, suspended, cancelled or completed games are excluded.

`public.nhl_chart_snapshot(uuid)` returns only published Dealer research snapshots. Private snapshot writes, captures and publication are not granted to client roles. Posts have `nhl-charts:<uuid>`, empty legs and null stake. Existing age/profile/authorship/automation guards and notification triggers remain in effect. Advisory locks plus at least 35 seconds after the latest Dealer post govern manual/retry calls. One post per tick avoids flooding.

The second migration installs an append-only run journal and appends the chart call to the **existing** `nhl-context-refresh` job. Its `5,15,25,35,45,55 * * * *` schedule, postgres author and original context HTTP invocation remain unchanged. Charts begin after 08:00 Eastern. All games on the ET calendar slate are examined each tick; the collector still processes two per refresh, so incomplete contexts retry across later ticks. Full coverage must be read from actual per-game outcomes and posts, never inferred from collector deployment. Large slates may take multiple morning ticks to publish. No-game days record an empty coverage list; partial failures are durable. No changes to NBA/NFL jobs or provider budgets.

Activate the integration only after the frontend renderer is deployed. Old snapshots never silently refresh with new cache data. Material late-news revisions and source-confirmed starting-lineup refresh are the next batch, not claimed as shipped.

## Validation and next batches

Tests cover actual statistic extraction, weighted blocks denominators, missing/null vs zero, private/unpublished access, timestamp/source matching, frozen retries, Dealer claims/flag, duplicate calls and postponed-game exclusion. Browser acceptance covers 360/390/1280 px, three real server-rendered PNGs, swipe/buttons, byte-identical downloads, source timestamps, missing rows, source failure/retry and no page overflow. The synthetic smoke fixture is isolated from production research.

Release requires tests, typecheck, production build, deployed commit confirmation and actual published-row/image readback. Run IDs and post IDs belong in the release handoff. Advanced data is not readiness approval for recommendations.

Next: (2) full-slate event/position ingestion, rink maps and opponent matrix; (3) injuries/lineups, late immutable updates, schedule density and verified market history; (4) Corsi/Fenwick and tracking extensions with documented source/method. Any paid source or license decision returns to the owner for approval.

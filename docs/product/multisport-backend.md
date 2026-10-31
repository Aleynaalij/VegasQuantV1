# NHL and college basketball backend — contract v1

Owner: Codex C1–C6, coordination issue #166. Simulator paused. Claude owns routes/layouts/Zone sport constraints/NBA pause flag/Slots UI. This package does not approve a model or generate model probabilities.

## Scope and boundaries

- NHL: full-game FanDuel moneyline and goal totals; skater points/goals O/U and anytime goal, when actually offered. Two-way moneyline includes OT/SO; skater props include OT but exclude shootout credit. Three-way/regulation-only quotes are excluded rather than relabelled.
- Men's D-I college basketball: full-game moneyline and spreads only, including overtime. A schedule may include a D-I team's non-D-I opponent; the ESPN D-I group filter is used. No college props or totals.
- NBA retains its current tables, editorial paths, original daily 3-point card renderer and MikeQ author. The separate NBA migration restores live source/result cadence and fixes premature daily-card publication.
- NFL stores/selection gates/immutable records are unchanged.

## Read interface for Claude

Canonical types: `src/lib/sport-contract.ts`. Explicit synthetic UI data: `tests/fixtures/sports/{nhl,ncaab}/page.json`; never ingest those fixtures into production.

| RPC | Parameters | Result |
|---|---|---|
| sports_slate | p_sport: nhl/ncaab, p_days: 1–14 (default 7) | SportPage v1 |
| sports_game | p_sport, p_slug | SportPage v1 with zero/one game |
| sports_records | p_sport | selections / win / loss / push / void / pending counts |
| sports_grade_market | p_market UUID | WIN / LOSS / PUSH / VOID / PENDING |
| sports_publish_selection | p_market, p_title, p_why, p_risk | Admin-only publication ID |

Schedule and result-progress are public; quoted markets, facts, editorial rows and confirmed results follow existing membership and age rules. Public facts contain source metadata, never the archived raw body. Read APIs return the latest unexpired market timestamp per game/market and latest context per game/kind/team. Historical exact quotes remain immutable.

`SportTeam` provides canonical sport/provider ID, name, short name, abbreviation. No logo files or headshots are imported. `SportMarket` supplies settlement enum/note for UI display; direction/threshold/book/player identity are not inferred by the UI.

Admin publication binds an exact still-open stored quote, records qualitative reasoning/risk, and inserts into the ONE existing Community/Zone. Claude's additive Zone-sport migration must be installed first. This does not publish official/model-approved forecasts or create payouts. No sample pick is manufactured to populate an empty screen.

## Collectors and storage

- `sports-sync`: authenticated via existing feed token digest RPC; POST only. ESPN schedule, score/status, matchup context, rosters and team season statistics; exact FanDuel quotes through existing ODDS_API_KEY. Same public factual source families as the NBA adapter, no private feeds/paid assets.
- `sports-results`: same authentication; up to 24 due games per run, up to four concurrent summary reads. Stores only internally consistent finals after a second unchanged read at least three hours later. Subsequent source changes create immutable correction evidence and CONFLICT, never overwrite the final.
- Source JSON is archived privately with its raw-byte SHA256 and retrieval time. Client metadata omits raw bodies. Source identity/dedupe, explicit RLS/grants and service-only mutation wrappers are included.
- New records collect current/previous-day regular/postseason schedule plus the next seven days. This is not a completed historical season backfill. Live roster/availability/goalie facts are provider-described context; omissions do not establish clearance or a confirmed starter.
- Team statistics stay factual provider data. Opponent-adjusted ratings, projected starting goalies, proprietary line combinations and forecasting models are not invented when absent. Such coverage gaps remain visible.
- Context is bounded to four imminent games per invocation, rotating past games with fresh context; the collector works through that queue over successive invocations. Quotes have 30-minute freshness. Near-game lines refresh after 25 minutes; farther-out lines after three hours. NHL props are considered only in the six-hour pregame window (two-hour cadence outside last two hours; 25-minute cadence inside).

## Budget and concurrency

Only FanDuel is queried. Atomic daily reservations cap NEW usage at 150 credits/day NHL and 50/day college; both stop when last observed account balance is <=1,000. This is a maximum 6,000 new credits over 30 days, not a promise that all markets fit or that the shared account has room after NFL/NBA. Failed paid requests keep their reservation. Credit cap/reserve hits are logged as gaps. No paid tier is purchased. Five-minute per-sport leases prevent overlapping collector runs; an interrupted lease expires automatically. Existing NBA usage remains governed by its existing settings.

## Settlement rules

Game grading uses confirmed final score including applicable OT/SO. College exact spread ties push. Hockey skater goals exclude shootout goals; player points = goals + assists; actual zero ice time is not proof of participation. Missing/ambiguous player identity stays pending. An explicitly non-participating listed player is void. No DNP-as-zero, no inferred cancellation settlement, no bankroll mutations. Corrected/conflicting finals stop grading until reviewed. Slots is random entertainment and never assigns an edge, recommended status or unverified combined payout.

## Slots integration

Existing `marketSlotPool(games, observations, now?, sport='nfl')` preserves NFL and supports NBA's exact h2h/spread/total/points/rebounds/assists/threes snapshots. New `sportSlotPool(SportPage, 'nhl'|'ncaab', now?)` adapts the new stores. `spinSportTicket(sport, rows, previous, random?, now?)` enforces sport at the draw boundary; legacy rows without a sport are NFL-only. `SlotLeg` adds optional sport and observed_odds. Existing machine needs eight distinct eligible conflict groups; insufficient pool returns an explicit error, never fabricated legs. Opposing team sides and alternative thresholds for one player cannot occupy the same ticket.

## Production deployment — October 31, 2026

Mike explicitly approved the concrete backend deployment request with “I Approve”; approval is recorded in issue #166 comment 6545279698. PR #167 contains source; it remains unmerged pending the full-package peer handoff. Hosted backend deployment is complete, not a claim that Claude's frontend is live.

Applied migrations: `20261031145407_multisport_backend.sql`, `20261031150209_nba_live_readiness.sql`, `20261031150619_multisport_schedule.sql`, and `20261031152818_multisport_publishing_access.sql`. The last moves privileged editorial code into private and exposes an authenticated-only invoker wrapper, retaining admin/age/exact-quote checks. Anonymous publication and ingestion EXECUTE are false.

Active collectors: sports-sync v4 (bundle SHA256 `9c4d72fa9291379fe122551c244bdc697a29e93c7341784753d277afaa55a6d3`); sports-results v2 (`a18222cd06975cd609a975838632d1c6aff6faaee46ebb18ed0a818ea9ba6167`). Both authenticate the existing source token inside the handler. Actual unauthenticated POST returns 401; GET returns 405. Vault dispatch never prints credentials.

Active UTC schedules: source at minutes 8/23/38/53; results at 11/26/41/56. NBA source restored to 2/17/32/47 and results to 5/20/35/50. NFL and the existing NBA 3-point posting job are unchanged. Oct 31's original card was already POSTED (post c68adf08-90d0-4ae8-a520-a599f7cf9154); idempotent invocation returned ALREADY_POSTED.

Actual hosted readback at 15:33 UTC:

| Evidence | NHL | College basketball |
|---|---:|---:|
| Stored fixtures (includes past day) | 63 | 438 |
| Public upcoming slate fixtures | 48 | 377 |
| Immutable moneyline quote rows | 30 | 8 |
| Immutable game-total quote rows | 30 | excluded |
| Immutable spread quote rows | excluded | 8 |
| Skater goals O/U quote rows | 98 | excluded |
| Anytime-goal quote rows | 203 | excluded |
| Player-points quote rows | 0 (provider coverage gap) | excluded |

These are collected snapshots, not a promise every quote remains fresh or every fixture has odds. Quote expiry remains enforced. Both anonymous slate/detail RPCs returned schedule data, access=false and zero protected quotes. Three actual NHL finals are CONFIRMING; the three-hour second-read gate remains intact. No fake publications or settlements were created.

Live fixes included identifying ESPN request headers (initial anonymous fetches returned 403); no paid props for empty/unmatched slates; exact pair/time matching for provider-reversed home/away ONLY on confirmed neutral courts; quote outcomes bound to canonical game teams; and an explicitly labelled prior-season statistics fallback for pre-season college 404s. Two real college prior-season team-stat records were read back. Context completion requires both teams' stats so a partial summary cannot suppress missing-team retry.

Remaining integration: Claude's `20261031160000_zone_all_sports.sql` and app/UI package are separate and were not applied here. New-sport editorial publication depends on that migration. NHL player-points markets remain unavailable until the actual provider supplies them. Starting-goalie/line-combination confirmation and opponent-adjusted ratings are not asserted from missing provider facts. Membership/browser/phone/desktop integration belongs to the full frontend package review. NBA has supported editorial APIs but no automatic editorial-selection publisher; an empty published-picks list is honest and is not filled using an unvalidated model. Simulator stays paused.

## Self-validation

Validation: all 359 repository tests, TypeScript and the production webpack build pass, including both SQL suites and a neutral-court outcome-identity regression. Commands: `npm test`, `npm run typecheck`, `npm run build`, `node tests/sql/sports-backend.mjs`, `node tests/sql/sports-nba-live.mjs`. Deno check performed with the same pinned npm dependencies and local node_modules resolution because this executor's direct Deno registry request was refused; both deployed handlers also passed actual authenticated execution and 401/405 rejection checks.

Actual source probe: ESPN NHL Oct29 scoreboard normalized 11 games; one real final summary parsed 36 skaters, score 4–6, with scoring consistency. NHL Oct30 scoreboard returned 3 games; college Nov2 D-I scoreboard returned 182 games. These are probe results, not hosted ingestion or universal availability. Account-specific hosted FanDuel coverage was then verified as recorded above.

Primary references: https://the-odds-api.com/sports/nhl-odds.html ; https://the-odds-api.com/sports/ncaab-odds.html ; https://the-odds-api.com/sports-odds-data/betting-markets.html ; FanDuel MD terms https://policies.fanduel.com/SB/MD/2026-10-29T12-02-28.html . Provider entitlement and source-use terms still apply; this package imports no proprietary tracking or newly licensed service.

# NBA confirmed starters and availability

Source: https://www.rotowire.com/basketball/nba-lineups.php (public NBA lineup/availability fields only). No projected-minutes subscription data, paywall bypass, odds-credit requests, picks, database writes or migration.

NBA Home displays explicit Out names in each collapsed game row. Opening a game shows independent away/home confirmation states, exactly five confirmed starters with positions, and availability statuses (Out, Out for season, Questionable, Doubtful, Probable, etc.). Expected names are not presented as confirmed starters. Matchup detail, source board and Analysis use the same report. Existing ESPN missing-observation copy is no longer described as injury clearance.

## Data and access

`GET /api/nba/lineups` requires the existing confirmed sign-in, research membership and applicable age verification before the public source is fetched. Auth/access errors fail closed. Responses are private/no-store; no service credential or user identity is returned. The only upstream URL is the fixed public RotoWire URL; redirects are refused. HTML is bounded to 1 MB / 60k tokens / 100 nesting levels, scripts stripped, never executed/rendered. Only typed facts are returned.

One pending fetch is shared and successful reports cached up to 60 seconds per server instance. Upstream HTTP Date is required and bounds cached-source age; missing/invalid/future/stale Date is rejected. failed fetches never refresh an older report's receipt time. A date rollover requires today's new page. UI polls once per minute while visible and resyncs on focus/pageshow/visibility change, with request/account generations guarding delayed responses. Existing memberships/age policies are preserved.

A report matches only the ET calendar day, ordered away/home team abbreviations (explicit aliases only), and exact ET tip time. Missing, duplicate, TBD, wrong-date/team/time identities are unavailable. RotoWire player IDs and full-name titles identify players; abbreviated names never serve as IDs. Duplicate starters, malformed/missing positions, incomplete fives, a listed Out starter, or a player simultaneously starting for both teams cannot produce a confirmed lineup.

Source freshness expires at 180 seconds. Client freshness uses server epoch plus monotonic elapsed time, independent of device Date.now changes. The response is validated; unknown/malformed/stale/mismatched reports show unavailable, never inferred availability or prior confirmed starters. Hidden/account changes discard the report. Missing injury flags are explicitly not clearance. A provider's later expected/unavailable revision replaces prior confirmed state.

## Verification

13 deterministic parser/loader/route tests cover expected vs confirmed, explicit Out before confirmation, complete fives, conflicts, aliases/exact identity, duplicate games, stale/future/invalid clocks, UTC/ET boundary, source failures/size limits, single-flight caching, same-player Out/Questionable conflicts in either order, missing/invalid HTTP Date, date rollover, confirmed member/age gates and private/no-store headers. TypeScript passes locally. Public-page parser smoke read 14 current-day games and recognized Boston's explicit Out entry. This is source-read evidence, not a claim that all 14 starting fives were confirmed.

Dedicated `NBA lineup acceptance` CI uses locked dependencies, production build and synthetic Playwright scenarios at 360/390/1280px: collapsed Out warnings, expected vs confirmed, provider updates/withdrawal, wrong-game/stale/malformed/failure responses, sign-out, detail-page integration and Analysis schedule-column mapping. Positive and negative screenshots use separate folders. `missing-out` control must fail with the specific collapsed-game assertion. Evidence contains synthetic users/players only. Browser execution results remain pending until terminal logs are read. Local cached Next version differs from the lockfile; CI npm ci/build is authoritative. Local Chromium is not claimed working in this sandbox.

No release, production data mutation or hosted auth changes performed by this draft. Provider markup changes can cause honest unavailable states; the source link remains available for a manual check. No automatic NBA recommendation publication is enabled.

Final review corrections: Analysis selects/passes authoritative away_abbreviation/home_abbreviation/tipoff_tbd; it never feeds full team names to a logo-code helper. Conflicting same-ID availability flags make the team report incomplete and retain explicit Out irrespective of row order. Missing HTTP Date is unavailable, never replaced with a new local receipt timestamp.

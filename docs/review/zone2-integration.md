# Zone 2.0 integration track

Base: PR #293 at 2770a8b08. This track does not change any entry route or production settings.

Integration export: `Zone2Experience({ basePath })` from `src/components/zone2/zone2-experience.tsx`. Mount inside Suspense on the integration branch's guarded Zone route. The caller owns route guards and legacy build/saved redirect compatibility. Tabs and sport filters retain the supplied path; published shares keep canonical `/community` references for stable existing deep links.

## Implemented
- Opt-in presentation on the existing CommunityFeed engine, whose default remains legacy.
- Research-first filter and text search over already authorized loaded posts. No invented global historical search.
- Existing stories viewer, expiration and authorization.
- Compact publication excerpt, original publication reference and publication timestamp, explicitly not claiming source freshness.
- On-demand original chart/publication renderers and downloads. Closing a disclosure unmounts chart readers; re-opening revalidates through original component contracts.
- Existing following/community/Dealer tabs, sport filters, posting, polls, comments, reactions, sharing, block/report/moderation, profiles and My Lays remain backed by original code and permissions.
- Explicit saved-picks destination; no pretend research-bookmark or game-follow API.
- Targeted post/lay deep links bypass research/search filtering. Legacy `view=vip` remains a Dealer alias.

## Verification / remaining
- TypeScript passed.
- Five focused data/source regression tests pass. They are not browser acceptance.
- Parent integration must verify protected route mounting, real-account social flows, download access, mobile/touch/screen reader and rendered contrast, Back/Forward and exact candidate CI.
- Search only sees loaded feed; more posts remain available using the original pagination. Historical traceability uses original persistent post IDs, not an invented immutable change log.
- Publication recognition uses existing marker contracts; unidentified posts stay visible in Community/Dealer mode, never silently relabeled research.
- No database, authorization, publishing schedule, account, proxy or production changes.

# Codex · Kobe
Updated: 2026-10-17, NBA Home cleanup and NBA-007 handoff
Mailbox: https://github.com/Aleynaalij/VegasQuantV1/issues/65

## Current task · NFL-GAME-LOAD
Owner reports NFL game pages showing an access prompt instead of published research and requests the fix for every matchup. Branch `codex/nfl-game-loading`, base f701035. Shared MatchupIntelligence now resolves the browser session and access explicitly, loads only the selected game's analysis/version history, market rows and official picks under existing RLS, and keeps same-account token events from clearing the page. Pending, denied, failed and unexpectedly empty published research have distinct states with retry. Requests time out instead of waiting indefinitely. No membership grants, policy changes, publication/record changes or NBA changes.

Live database read: all 14 upcoming NFL games have research (1–6 versions each), including six Houston–Jacksonville versions. This verifies stored data, not the owner's browser session. Local validation: 248 tests and TypeScript passed; production webpack build passed. Browser fixtures cover two matchup routes at 390/1280 widths, delayed access, same-user token refresh, failed access/research, unexpected empty research, retry and denied access. Synthetic fixtures do not prove live member authorization. The new browser test is included in existing CI. Prepared for review; no production deployment claimed.

## Current integration state
- NBA-002: #66 merged b73c8b1875371973a5bc9a3fa748c0468f361dc6.
- NBA-005: #69 merged 103634de6abc223781d3ac71cdc1b79f2595c6c0. Claude review: PR #69 comment 6240163768; current-head CI run 39065691787 passed.
- Home cleanup #73 and flicker fix #75 merged. Preserved the compact hero, recent live-game ticket window, loading skeleton and session cache.
- NBA-007: clean replacement #76 from main e37b2c8eebc537ba3fd15a5425d5118eb279be12. #74 closed as superseded, not merged. Handoff: issue #65 comment 6240350392. Claude approved and merged #76 as ed0b8114c0214bc589c4277950e05b19e013787b; first production attempt was blocked by Vercel daily deployment quota.

## NBA-007 implementation
Home matchup and tickets link to /nba/games/[slug]. Public matchup header shows team logos, schedule/venue and source-backed live/final status. Member research reuses the board's available-book exact-line comparisons (stale quotes never win best observed), lazy confirmed player form and existing RLS. Final observed selections can be checked through the read-only nba_grade function, without creating picks or modifying result records. Denied access, absent quotes, unknown game and refresh failures are visible. No migration, paid-feed setting, public shadow forecast, model approval, NFL gate, immutable ticket or record classification changes.

## Verification and integration
247 local tests, TypeScript and production build passed. Dedicated 390/1280 browser fixtures passed ticket-to-game navigation, six-book comparison/stale exclusion, lazy empty form, final-result RPC, denied member access, missing/error states and no page overflow. These are synthetic fixtures; they are not live provider evidence. Actual lines/props remain dependent on ingestion.
After refreshing against merged #69/#73/#75, all 247 tests, typecheck/build and 390/1280 Home/game fixtures passed, including a delayed-schedule loading-skeleton assertion. Public production /nba/analysis rendered the actual Boston–Detroit 3 PM schedule and signed-out member gate. Evidence: issue #65 comment 6240350392. Live member comparisons/form remain unverified; no live game-page deployment claimed. Claude review approved #76 (PR comment 6240374116). Production deployment was blocked by quota, not marked live. Owner reported plan upgrade October 17 at 5:09 PM ET and authorized retry. This release-status commit triggers the existing Git-connected production deployment; direct Vercel connector team access remains unavailable. Verify deployment status and live game navigation before declaring deployed.

Codex is idle after this task turn. GitHub comments do not wake an assistant; no background monitor is running.

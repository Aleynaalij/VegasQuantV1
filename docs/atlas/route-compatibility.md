# Route compatibility inventory

Production deployment source: `df5e5f010a19a2a14f009b94c43db033b499d077`. Source-file inventory, not hosted navigation acceptance.

All baseline page/handler files are compared with the candidate. Explicit staging consumer routes are separately tested against actual page patterns. Legacy service APIs are included in the build but intentionally denied by the combined staging proxy. Their presence is not functional parity.

| Production route | Candidate file | Combined policy | Classification / limit |
|---|---|---|---|
| `/about` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/account/recovery` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/account/verify-age` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/admin/accounts` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/admin/engagement` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/admin/feeds` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/admin/intelligence` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/admin/matchups` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/admin/nhl-feedback` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/admin/operations` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/admin` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/api/account/delete` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/api/admin/accounts/delete` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/api/admin/sportradar` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/api/age/start` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/api/age/status` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/api/age/webhook` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/api/billing/account` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/api/billing/quote` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/api/billing/readiness` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/api/checkout` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/api/community/photo` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/api/community/posts/[id]` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/api/internal/sportradar` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/api/kalshi` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/api/live/alerts` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/api/live/box` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/api/live` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/api/nba/lineups` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/api/nba/matchup-sheet/[id]` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/api/nba/threes-card/[day]` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/api/nfl/weekly-card/[card]` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/api/nhl/chart/[id]/[page]` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/api/notifications/channels` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/api/notifications/dispatch` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/api/notifications/social-dispatch` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/api/notifications/test` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/api/operations` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/api/scores` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/api/simulator/research` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/api/stripe/webhook` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/api/track-record` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/community/[username]` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/community` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/faq` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/feed` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/games/[slug]` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/games` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/history` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/matchups/[slug]` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/matchups/[slug]/picks` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/matchups/game/[id]` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/matchups` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/membership` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/methodology` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/nba-research` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/nba/analysis` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/nba/games/[slug]` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/nba/matchup-sheet/[id]` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/nba` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/nba/records` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/nba/rules` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/nba/zone` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/ncaab/games/[slug]` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/ncaab` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/ncaab/records` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/nfl` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/nhl/games/[slug]` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/nhl` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/nhl/records` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/notifications` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/parlays` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/parlays/tailed` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/performance` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/picks/[id]/image` | Present | Intentional authorization denial | Hosted side-effect/API/download contract not admitted |
| `/picks/[id]/share` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/privacy` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/research` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/responsible-play` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/saved` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/simulator` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/slots` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/support` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/support/report` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/sweat/[id]` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/terms` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |
| `/vegas-fear` | Present | Owner/MFA gate, existing page retained | No build exclusion; live data/feature acceptance still required |

## Diagnosed failures

- `/membership`, `/notifications`, `/slots`, `/vegas-fear`, `/privacy`, `/support`: prior unexpected 404 was an authorization allowlist omission, not build exclusion. Explicit real-page patterns now admitted after live owner authorization.
- `/account`: no such production page file. Existing account navigation opens the account shell; supported deep links are `/account/recovery` and `/account/verify-age`. No fabricated destination is added.
- Unknown IDs/slugs may still produce real missing-record errors/404s. Do not rewrite them into success or placeholder research.
- Admin, billing, collectors, dispatchers, account mutations, legacy server image/download handlers and service worker remain intentionally denied in combined staging. The gate's own login/logout endpoints are separately origin checked.
- Client-rendered publication PNG remains existing code; gated hosted download acceptance and legacy download routes remain open.
- Game Rooms preserve sport + stored game ID + optional Eastern day; current reader retains its existing upcoming window, not a permanent archive.

# Consumer replacement feature-preservation register

Audit baseline: Phase 1 PR #293 (`2770a8b`); initial integrated candidate PR #296 (`c0ffe0e`). This is a source-level destination and contract audit, **not a full functional-parity certification**. Every existing page route remains present. Only root and community page selection changed, behind a non-production-only default-off switch. No API, database migration, publishing job or proxy changes are in this candidate.

| Existing capability                            | Destination in integrated experience                                                              | Evidence / remaining acceptance                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Visitor and returning-member Home              | `/`, same Home2 as `/staging/discovery/home` when enabled                                         | Real reader, explicit denied/unavailable state; real-session switching and mobile acceptance outstanding      |
| Tonight's games and sport navigation           | Home sport filters, existing `/nfl`, `/nba`, `/nhl`, `/ncaab`, new date-aware Game Rooms          | Existing schedule contracts retained; 4-sport Room unit coverage, real data acceptance outstanding            |
| Full research                                  | Home research cards, `/research`, original game/matchup destinations                              | Research provenance and timestamps retained; current reader is not a complete historical archive              |
| Dealer posts and publishing                    | Zone existing composer and publication renderer, `/community`                                     | Existing mutation and authorization functions retained; real authorized publish/edit flows unverified         |
| NBA cheat sheets and three-point volume        | Existing NBA research/matchup routes, original publication cards in Zone                          | Original renderer/download path retained; not all charts embedded in initial Rooms candidate                  |
| NHL chart packages                             | Existing NHL matchup routes and original Zone publications                                        | Original package path retained; real package access/download acceptance outstanding                           |
| NFL and NCAAB research                         | Existing sport/research routes and Room dossier links                                             | Existing reader contracts; historical limitations explicitly labelled                                         |
| Picks, grading, outcomes and corrections       | Existing `/feed`, `/picks/[id]/share`, `/performance`, records and matchup destinations           | No grading or outcomes store changed; not claiming complete embedded Room outcome history                     |
| Stories                                        | Home lobby placement, single existing Zone Shell placement                                        | Duplicate Zone mount corrected and regression test added; posting/reaction end-to-end unverified              |
| Comments, reactions, follows, community search | Zone reused CommunityFeed; existing `/community/[username]`                                       | Mutations/auth unchanged; bounded loaded-feed research search is not a server-wide index                      |
| Saved picks and My Lays                        | `/saved`, `/parlays`, `/parlays?build=1`                                                          | Actual supported storage only; research saves/followed games not invented                                     |
| Research cards and downloads                   | Existing full publication renderers and canonical research links                                  | Compact discovery does not delete the full card; authorized download acceptance outstanding                   |
| Notifications and account/profile              | `/notifications`, existing AccountLink, membership and profiles                                   | Invalid `/account` shortcut corrected; real unread/session/profile flows outstanding                          |
| Fear Index and Simulator                       | `/vegas-fear`; Simulator accurately labelled unavailable to members                               | Existing `/simulator` remains internal authorized preview, not promoted as member feature                     |
| Legal, support and methodology                 | Existing Shell footer links                                                                       | Routes retained                                                                                               |
| Existing deep links                            | `/?game`, `/#home-games`, Zone post/comment/sport/view/ruby and `#post-ID`, saved/build redirects | Query preservation unit/HTTP evidence; browser post loading/focus and mutation assertions not yet established |
| Security boundaries                            | Existing auth/RLS and Codex's separate #295 security track                                        | No `src/proxy.ts` delta; no claim of combined-gate authorization parity                                       |

## Release-blocking evidence

- A protected preview with **verified isolated credentials/data**, not merely a successful Vercel build. Do not treat automatic previews as safe staging without independent evidence.
- Required hosted CI and synthetic browser/mobile/accessibility results on the final exact candidate SHA.
- Authenticated session switch/revocation, unauthorized access denial, social mutations, publication focus, original links/downloads and Dealer publication workflows in that verified staging environment.
- Performance findings with the tested viewport, device/network assumptions and data volume recorded.
- Candidate-to-legacy rollback exercised against the same isolated data, with original content still accessible and no destructive writes.
- Final gaps classified release-blocking or explicitly accepted by the CEO; separate exact-SHA production go/no-go. Production activation is deliberately excluded from current code.

## Current verification boundary

Initial candidate's identical local tree passed 769 unit tests, TypeScript and a synthetic build. Local HTTP smoke passed both flag settings for page status and legacy game/saved redirects. Chromium could not launch under the local socket sandbox, so no local rendered-browser or accessibility pass is asserted. Hosted results must be recorded separately and must not be transferred to a later changed SHA without rerunning affected checks.

## Follow-on implementation awaiting final combined verification

- Home now reads a bounded maximum of three actual Dealer publications from existing authenticated `community_dealer_feed`, retaining RLS, original timestamps and direct post references. A display name is not treated as Dealer identity.
- Rooms can opt in to existing `game_zone_posts` with `STAGING_DISCOVERY_LINKED_PUBLICATIONS=true`; only an authorized resolved room mounts it, and synthetic fixture mode never does. Existing lazy NHL/NBA/NFL/publication renderers preserve full text/chart/download paths. Unsupported attachments, incomplete history and unavailable permissions remain explicit.
- These improvements close initial CTA-only/link-only implementation gaps where existing contracts support data. They do not establish real-session parity or release readiness.

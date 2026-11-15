# Unified Home + Zone 2.0: integration decision record

## Source of truth and scope
Audited main `97f76928ee62aa73c6e580d1d2f1a2c31bc64b80`, not assumed roadmap completeness. Code presence below is implemented-code evidence, not proof of production health. No data or publishing mutations were used for this design. The source audit is read-only. Existing Home is already a neutral lobby, not NFL-first.

## Existing capability → proposed destination
| Existing evidence | New destination / protection |
| --- | --- |
| VqLobby, VQ Tonight, sport rooms, spinning skybox | Home orientation + Tonight directory. Preserve arena identity, existing return/legacy links; optional spin remains nonessential. Prototype uses static compact box. |
| community-feed.tsx, lib/zone-feed.ts: merged newest-first member posts and Ruby lays, For you/Following/Dealer only | Community with explicit filter; Dealer research also indexed into game rooms. Not a replacement for publishing records. |
| /community post/comment/ruby/sport/view query links; memberProfileLink | Preserve old links and map to new context, never orphan historical discussions. |
| /research ResearchHub and lib/research-hub[-reader].ts | Reuse existing sport/topic/date/query/event filters, dossiers, injury/lineup/weather/context/market content, source/timestamps/staleness. Do not build a parallel data system. |
| nhl-chart-preview / NBA matchup sheet / NBA threes / NFL WR/DvP/weekly renderers | Compact previews into full research. Keep original chart assets, pagination, captions, sources and downloads. NHL currently has nine package pages and frozen snapshot provenance. |
| game-zone-posts RPC / GameZonePosts | Room index adapter. Distinguish no research from failed/blocked access; currently component can render null for errors/no posts. |
| Replies, likes/typed reactions, polls/votes, following, block/report/moderation | Community and contextual room discussion, same access controls. Prototype demonstrates only a subset, with remaining operations explicitly non-live. |
| Stories in Shell, 24-hour viewer and navigation | Home/Community story row, same expiry/privacy/seen state and return path. Prototype does not implement expiry. |
| /saved saved published legs | Retain Saved picks; new research bookmarks/followed games are proposed new contracts, not existing features. |
| Profiles/posts/media/follower counts/edit | Member identity remains; advanced research history is proposed aggregation. Popularity is not verification. |
| Sport record pages, /performance, /history, /sweat/{gameId} | Verified records from game/pick/member contexts and game discussion. No fabricated outcomes or confidence. |
| /slots, /parlays, Fear, Simulator, account/notifications/legal | Home tools, stable routes and entitlement checks. Simulator currently Coming soon; Fear supported sport availability must remain explicit. |

## Information architecture
Home answers what VQ is and where to begin. Tonight is the complete daily directory. A game room is the persistent hub for its research, Dealer records and conversation. Research supports cross-game discovery; Community supports relationships. Saved/Profile collects personal context. Live changes and verified records belong to the object they describe, not new feed-sized duplicates. Five concise primary tabs in the unified concept: Home / Tonight / Research / Community / Collection.

## Before → after journeys
- Find a buried NHL chart: scroll chronological feed → sport/game directory → room Research → full original package.
- Check NBA research without losing lineup: expand one competing card → persistent room retains lineup status beside research and Dealer history.
- Assess a corrected pick: reconcile separate posts → one original record with append-only correction timeline and grading evidence.
- New visitor: repeated CTAs and long mixed page → clear value sentence, compact Tonight, choose sport/game, research/community entry.
- Return visitor: newest posts regardless of intent → explicitly labeled followed game/saved research/change summary, only after backend support.

## Phased engineering plan (not approved for production)
1. **Low-risk discovery polish.** Compact existing previews, consistent research CTAs, preserve full card dialogs/downloads. Acceptance: all old deep links work; no asset/data loss; 360/390/desktop readability and keyboard regression tests. Rollback: presentation flag only.
2. **Read-only game room pilot.** Add canonical game IDs and read adapters over existing readers. Pilot NBA/NHL; preserve old routes. Acceptance: game/date/sport exact matching; no mixing snapshots; distinguish missing/stale/blocked/error; chart and lineup coexist; existing publishing unchanged. Rollback: revert entry links, records untouched.
3. **Contextual social and permanent records.** Written API/schema proposal reviewed by engineering/security before changes. Append-only publication/update/grading/correction event contract; game/research-linked discussion, migration of links. Acceptance: original evidence immutable, permissions server-enforced, corrections auditable, reply and moderation parity. Rollback: legacy reader/UI remains available.
4. **Personal relevance.** Only then add followed games/research bookmarks/changed-since-last-visit using approved contracts, not inferred preferences. Acceptance: privacy, per-user isolation, unfollow/removal, fresh/empty states, deterministic counts.
5. **Measured rollout.** Compare research discovery time, navigation completion and abandoned rooms; no betting-success promises. Staged pilot, performance budget, monitoring and separate CEO release authorization. MLB remains February 2027, no new league pipeline in this work.

## Required data contract fields
Game identity/sport/start/timezone/status; research asset ID/type/game links/source snapshot/version/published/observed/updated timestamps/coverage/missing reasons/entitlement; publication ID/original selection/original price observation/source/method version and immutable event IDs; grades with source/verified_at; room discussion IDs with existing permission envelope. All statuses server-derived. Null is not zero. Frozen snapshots may differ from current lineups. No claim of NHL tracking, xG, heatmaps or zone entries unless source licensing and measurements actually exist.

## Boundaries and acceptance gaps
The prototype uses browser memory and explanatory placeholders, not production parity. Research search is synthetic and limited. No actual login/entitlement/publishing/saved-data integration. Baseline tests: 736 pass, TypeScript pass, production build pass, 5 focused isolation tests included. These do not constitute browser/axe/touch/screen-reader verification. Keep draft, no merge or production deployment. Blackbox, Admin Operations, independent review, research reliability and February MLB commitment are unaffected.

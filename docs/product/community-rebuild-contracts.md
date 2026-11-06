# Community rebuild — contract and dependency packet

Baseline `4140a05216cbf891719d17bc2a7d42baecc92f49`. Claims/ACK: issue #65 6611359742; assignments 6611197017, 6611219339, 6611262163. Prepared contract/helper package, not completed UI or release. Existing access policies are unchanged. No hosted reads/writes performed.

## Existing capability map (Z-X1)

| Capability | Actual implementation | Limit / ownership |
| --- | --- | --- |
| Feed / exact post | `community_feed`, `community_post(uuid)`, invoker reads under post RLS; `community-feed.tsx` | Authenticated; exact lookup avoids first-page starvation; preserve unavailable/error distinction |
| Story hints | `community_activity`, private definer narrowly projects visible/confirmed/non-banned authors with block checks | Only newest post per author, 24 authors; no full payload or author UUID in rail result |
| Author identity | Feed/detail `user_id`, `author_name`; `community_avatars(p_users)` trusted `staff` metadata | Username is mutable display snapshot; group by returned UUID; caller-supplied name/card label is not official proof |
| Profile | Own `community_profiles`; public community directory/profile functions have separate policies | Never query another account’s private profile to fill a visitor card |
| Photos | Private `community-photos`; owner/post identity; `/api/community/photo` authorization/sanitization | Use existing authorized retrieval, never public bucket URLs or reuse another account’s cached signed URLs |
| Like | `community_reactions(post_id,user_id)` PK, insert/delete + safety/rate guards | One binary heart per actor/post; no emoji field; optimistic rollback already implemented |
| Comment / reply | `community_comments`, `community_post_comments`, parent ID validation; `community_comment_reactions` | Existing content/rate/owner/permission rules; no emoji type |
| Follow/report/block | `member_follows`, `community_reports`, `member_blocks`, `restrict_community_member` | Preserve own-only writes/MFA moderation, both-direction block enforcement and reporting feedback |
| Game room | Existing `game_comments`, NFL `/sweat/[UUID]`, matchup discussion links | No verified universal NHL/NBA/college room identity in this inventory; never join by team display names |
| Official cards | Stored publication marker / explicit publisher paths, `ZonePublicationCard`; separate original NBA threes design | A presentation marker is not alone an authorization or verified performance claim |
| Contributor uploads | `ruby_cards`/revisions; screenshot-driven presentation | Unverified member content; do not parse a screenshot into transferable bets |
| Notifications | `notification_preferences`, `alert_preferences`, `topic_follows`, inbox/dispatch helpers | #200 contract correction remains separate; no default opt-in/live sends here |
| Measurement | Admin `engagement_metrics`, current-state milestones and first-completion events | Existing milestones are not a story/discussion conversion funnel; no baseline invented |

Claude retains all community UI/CSS and newly claimed viewer component ownership. Codex edits only the isolated contract/helper/tests/spec. No edits to shared navigation, current smoke scripts, CI or migrations in this packet. New claims required before expanding files.

## Visitor-preview contract (Z-X2)

**No explicitly public member-content source found.** `community_activity`, `community_post` and `community_feed` EXECUTE are authenticated-only. Signed-out entry uses explanatory UI/sign-in and an empty member preview. Do not call private feed server-side and then hide it with CSS. Counts, author names/IDs/avatars, photos, excerpts and story rings are content too; omit them from visitor payloads, images, derived counts and prefetched responses.

Existing official/public proof (`public_research_status`, public schedules) may be linked through its current public projection. It is not a public community feed and must not be blended with private social counts. Missing approved public social content is a supported empty state; no policy expansion is proposed.

Re-use `tests/sql/community-activity.mjs` for visible-author filtering, blocked exact-post lookup and anon denial; photo and social suites cover their own policy fixtures. These fixtures stub some prerequisite helpers and do NOT establish a comprehensive composed production-policy audit. Need dedicated composed preview/deep-link/image/count tests before Z-X2 can close; private/restricted/deleted/blocked negative cases are not claimed newly complete here.

## Routing and context (Z-X3)

- Research `/feed?view=latest`; bare `/feed` redirects to Zone. Game-specific research uses actual slug routes. Keep general research and member conversation explicitly named.
- Zone `/community?sport=<canonical key>&post=<UUID>#post-<UUID>`; `all` filters one combined feed. Never identify a game/post by a title or player/team name.
- Legacy `/community?build` and `/community?saved=ID` redirect to canonical `/parlays`, retaining saved ID/anchor. #203 CI executes that contract at 360/390/1280.
- Return context is sport/date/game plus opener focus/scroll. Keep context locally/in safe existing routes; do not add arbitrary external `returnTo` destinations. A closed/missing game stays closed/missing; no replacement with a similarly named fixture.

## Story contract and dependencies (Z-X9)

### Retrieval and sequence

1. Rail hint supplies post ID. On explicit click, fetch existing `community_post(p_id)` under current session. Ignore responses from an older account/generation or a different ID. Null/error does not mark read or expose fallback content.
2. Returned detail supplies stable `user_id`; group only viewer-authorized feed/detail rows by that UUID, never username. Existing `community_feed('all',100,false)` can provide a bounded authorized set including multiple posts per author; it is not an exhaustive per-author history. The rail itself cannot provide multiple stories. Do not claim unlimited author history or invent a 24-hour expiry. If exhaustive per-author pagination is desired, propose that bounded reader separately.
3. Recommended deterministic order: authors newest eligible activity first, UUID tie-break; posts within author oldest first, timestamp then post ID tie-break. Ring opens its selected post, not automatically an unrelated first item. Within-author Next moves to its next post, then next author; Previous reverses. Boundaries stop, never loop. Visible progress represents the loaded authorized set only.
4. `community-story-contracts.ts` is a pure presentation helper over already-authorized rows, not a permission boundary. It strips extra metadata, rejects wrong IDs/account generations, groups deterministically, handles removed cursor boundaries and guards read updates. Not mounted in UI yet.
5. Re-fetch detail on entry/re-entry and when authorization changes. Clear payloads/photos immediately at account switch/sign-out, cancel pending work, close viewer and restore a safe Home state. Do not retain another account’s content in a reusable global cache.
6. Mark read only after meaningful text/play/photo is actually displayed (photo requires successful load); never on ring click, loading skeleton, failed detail or removed/blocked item. Read keys stay account-scoped. CTA/dialog input must stop progression; Escape/back closes once and restores focus/scroll. Keyboard Left/Right follows visible sequence; reduced motion avoids auto-animation. No automatic story timer proposed.

### Actual Gambly integration

`GamblyLink` validates HTTPS `gambly.com`/`www.gambly.com`, opens a local modal, obtains explicit age confirmation, copies supplied text/image only on user action, then offers an external link for manual paste. Nothing arrives in Gambly automatically. Reuse it unchanged; no direct slip-import API, bet placement or new data disclosure.

**Current dependency:** community post `legs` are user strings; posts lack exact published-leg keys and reliable per-leg expiry/identity mapping. A `card` string or screenshot is not such mapping. Existing `share_member_parlay` projects text selections into community posts but does not return a trusted exact-market map in `community_post`. Therefore the story viewer cannot safely certify current transferable supported play content from arbitrary post text/photos alone. Keep CTA unavailable with an explanation for these cases. Do not parse odds or infer a slip from pixels.

Proposed next contract (not implemented): a viewer-authorized, exact post→existing immutable selection snapshot mapping, with canonical sport/game/market/player IDs, current availability/expiry check and explicit supported-copy result. Reuse existing stored published/private-parlay source when verifiably linked; do not accept a caller-asserted linkage. If a new RPC/schema is needed, deliver a minimal separate draft and reviewed policy tests before UI wiring. This proposal does not authorize expanded read access. The story can still show authorized content and discussion without an eligible transfer.

## Templates and trusted provenance (Z-X4)

| Template | Inputs / identity | Missing/unknown behavior | Publication |
| --- | --- | --- | --- |
| Daily slate discussion | Canonical sport/day + sourced scheduled game IDs/times | No-game or unavailable schedule message; no manufactured games/activity | Composer draft only |
| Featured game | User-selected exact game + existing research/room link | No invented featured rank/confidence; missing room uses labelled general sport discussion | Explicit optional post by author |
| Postgame recap | Stored final status/result evidence + source time | Partial/conflict/unconfirmed results remain pending/review; never fabricate scores or performance | Draft, not records or auto-published recap |

Official authorship must come from server-trusted publisher/`community_avatars.staff` or an existing immutable publication association, never `author_name`, post body, avatar, `card` string alone or user metadata. Member opinion and uploaded results stay explicitly unverified. A template, saved draft and successful stored post are three separate states. No schedules or automatic posts in this batch.

## Emoji proposal (Z-X5, not applied)

Existing PK `(post_id,user_id)` has no type and no UPDATE grant/policy. Keep one reaction per actor/post: heart is the existing Like; bounded alternatives `celebrate`, `fire`, `thinking` are proposed keys. Same choice removes it; different choice replaces it. Total reaction count counts actors, not accumulated taps. Display per-type counts plus the current actor’s selection; old rows and old clients mean `heart`. Comments retain existing hearts initially unless a separate comment-type extension is explicitly included.

Minimal backward-compatible draft design: `reaction_type text not null default 'heart'` with allowlist check; preserve existing insert/delete clients, ownership/RLS/rate/block/restriction guards. Replacement must be an atomic authorized operation, not UI-only state or delete-then-insert that loses a previous reaction on failure. A bounded RPC could perform change/remove with a row lock and execute all existing safety checks; never add broad table UPDATE grants to simplify it. Existing notification trigger emits a Like on INSERT: decide whether alternatives use the existing neutral reaction label or stay silent, and ensure change/remove cannot generate duplicate notifications. #200 consent/exception contracts remain the floor. Return canonical counts after commit; roll back UI on failure and ignore stale account responses.

Required local SQL tests before shipping a migration: old-client heart compatibility, enum rejection, forged actor, blocked/denied/restricted/absent/deleted target, duplicate taps, choose/change/remove, concurrency, count truth and rollback, no repeated notification/default enrollment. No migration file or schema change included yet; this is the requested scoped proposal for Elo, not implemented persistence.

## Contribution / notification acceptance (Z-X5–Z-X6)

Retain current profile/age/access validation, publication sanitization, rate limits, duplicate-submission protections and comment-parent validation. Test failed publish/upload keeps drafts, retry creates one post, old-account async callbacks cannot replace new-account state, optional sharing stays off, failed likes restore counts, report/block errors remain retryable. Use local fixtures only; no real posts/reports/blocks/preferences changed.

Re-use #200 notification correction rather than duplicate it: declined preference/no permission/blocked social actors must prevent social delivery; existing security/account exceptions remain separately scoped. Inbox availability is not external-delivery consent. Pending #200 release/application status must be read before claiming enforcement live. No new topic ranking or default subscriptions.

## Measurement / pilot / rollback (Z-X7)

No new tracker or live collection. Existing admin milestones are independent counts, not an ordered funnel. Proposed definitions for a later opt-in, privacy-reviewed aggregate pilot:

- Find discussion: authorized member successfully displays an existing relevant conversation after game/research navigation; denominator eligible pilot visits, not all accounts.
- First meaningful contribution: first successful nonempty permitted comment/post in the pilot window, excluding failed/duplicate attempts. “Meaningful” is operational here, not text-content scoring.
- Return engagement: a later-day authorized return with a displayed conversation or successful interaction; define window and eligible denominator before collecting.

Do not record post text, photos, user IDs/emails, private selections, exact story/post/game IDs or clipboard/outbound payloads in analytics. No baseline or percentage claimed. For the present pilot, use consenting owner/tester walkthrough feedback and synthetic screenshots; any new aggregate instrument requires a separately scoped privacy/retention decision.

Pilot gates: exact combined head, composed access tests, actual browser/negative-control logs, 360/390/desktop screenshots, account-switch/unread tests, failure/retry and no external auto-navigation. Explicitly mark real-device/auth checks not run. Release only after Elo’s consolidated review and owner decision. Roll back the UI/application commit on content leakage, false reads, lost drafts, incorrect reaction counts or broken return navigation; preserve stored posts/selections and unrelated migrations. Any future schema rollout needs its own compatible rollback plan.

## Current delivery status (Z-X8)

- Source/file map, no-public-member-preview conclusion, templates/provenance rules, transfer/emoji dependency proposals and pilot plan: prepared in this packet.
- Local verification: 12/12 targeted story/activity/photo/Gambly checks PASS; TypeScript PASS. Three temporary mutation controls (removed account-generation isolation, false read before display, wrap-around navigation) each fail the intended assertion. No integrated viewer/browser claim.
- #203 prerequisite: both CI workflows green on `0115907811ad95c3e11c498f2e1960b0c9b3c468`; dedicated run 41684317345 executes all three widths and rejects false success at the intended assertion.
- Pending: composed preview/storage/count negative tests; contribution/emoji SQL and new browser acceptance; Claude’s final UX/community heads/screenshots; full independent combined review. No full community completion, real-auth acceptance or production readiness claimed.

# Feature preservation and protected acceptance continuation

Baseline: PR #303, `5693e070dba1527dbd900db5fcc0e2a8f634feae`; current main `cc87ddc42c544a2e45340fc53c86565e57791f1e`. November 18, 2026 audit. This is a partial engineering package, **not feature parity or hosted acceptance**. Exact candidate and results belong in the draft PR ledger. Reviewed source branches remain unchanged.

## Actual contract inventory

Same destinations below means the original page is retained in combined mode; it does not mean its backend works. Original production implementations and defaults are unchanged. All combined reads require the one HttpOnly session, live private-access authorization, independently verified synthetic age and entitlement, and isolated credentials. Every request remains server-authorized. Read failures must remain unavailable rather than empty-success. Mutations are denied, not queued for later production replay.

| Capability | Production destination / contract | Combined candidate destination / contract | Actual status / required positive evidence |
|---|---|---|---|
| Home Dealer research | `/`; `community_dealer_feed` | `/`; `/staging/discovery/read/dealer`, namespaced invoker projection | Working only in connected synthetic tests on baseline; original IDs/body/times retained. Current head must rerun browsers; real authorship/content unverified. |
| Room research | Existing sport/game routes; existing sport readers | `/staging/discovery/rooms/[sport]/[id]`; guarded research reader | Working synthetic on baseline, current-head browser results required. Real source coverage/history unverified. |
| Game discussion and publication links | `/community?post=…&comment=…#comment-…`; `game_zone_posts` | Links retained; read RPC allowlisted, linked-publication switch false | Intentionally restricted until full original-post/source authorization and renderers are accepted; not functional discussion. |
| Stories | `/community`; `community_activity`, `community_feed`, `community_post`, story state | Same route and verified viewer; unsupported RPCs rejected | Unavailable. Need isolated reviewed profile/post/activity and clock contracts, visible/expired stories, own actions, blocked members, cross-user denial and no outbound triggers. |
| Comments / reactions / follows | `/community`, `/community/[username]`; `community_comments`, `community_post_comments`, `community_reactions`, `community_comment_reactions`, `member_follows` | Same pages; browser read/mutation bridge rejects these paths | Unavailable. Need positive own-author mutation + reread and negative foreign-author, blocked/restricted and revoked-session controls. An unavailable screenshot is not a pass. |
| Saved picks | `/saved`; `saved_legs` joined to immutable `published_legs` | Same route and viewer, table reads unavailable | Unavailable. Preserve leg keys, original quote/publication timestamps and corrected-result references. Test save, reload, unsave, other-user isolation and missing original publication. |
| Saved research | Existing supported selection saves and research destinations | Existing destinations retained | Unverified; no generic research bookmark store was found in this bounded audit. Do not invent one or claim saved research parity from saved picks. |
| My Lays / Build a Lay | `/parlays`, `/parlays?build=1`; **`member_parlays`**, `published_leg_catalog`, `create_member_parlay`, `share_member_parlay` | Same routes, unsupported contracts rejected | Unavailable. Prior ledger's `saved_parlays` is not the actual workshop table. Preserve existing catalog/age/entitlement rules, own drafts, share visibility and provenance. No fake saved success. |
| Account / profiles | `/membership`, `/community/[username]`; `community_profile`, `community_profiles` | Same routes, token-free viewer identity | Identity works synthetic; profile setup/editing unavailable. No second SDK identity, MFA enrollment or production account editing. Need own-profile round trip and foreign-user denial. |
| Notifications | `/notifications`; `notification_counts`, `notification_inbox`, `notification_view`, `notification_action`, `notification_preferences` | Same route; unread state unknown, unsupported contracts rejected | Unavailable. Counts/inbox/preferences/read actions need reviewed isolated contracts. Never enable `notification_sync_updates`, pulse, dispatch, push or email simply to make inbox tests pass. |
| Full NBA research / charts | `/nba/games/[slug]`, `/nba/matchup-sheet/[id]`, `/api/nba/matchup-sheet/[id]` | Original routes retained; legacy bearer handler intentionally denied | Unavailable under combined session. Need same-session server handler, original post ID/title/source/history and membership/age checks, then actual nonempty download verification. No fabricated replacement card. |
| Native publication PNG | Zone original publication renderer | Source retained | Unverified authenticated journey; successful fixture rendering is not a verified full-research download. |
| Legal / support / historical deep links | Existing footer and original routes, Zone query/hash targets, selection share links | Files retained; see route-compatibility inventory | Source preservation only; exact-head hosted navigation remains unverified. |

The bridge still forwards only four reviewed read RPCs. This package deliberately does not expose any missing table or mutation through a generic proxy. Production policies, notification triggers and data are not copied into staging to fill these gaps.

## Security defect reproduced and fixed

Initial eligibility checks plus a final private-gate check could return data after independent age eligibility changed while the read was in flight. The viewer identity endpoint, data gateway and actual Home/Room consumer reader now repeat independent age and entitlement checks before their final live-gate check and response. Failure/outage returns no protected payload. This narrows a race; it is not a claim of atomic cross-request revocation or hosted security certification.

New negative controls change age/entitlement after a research read, fail the final backend read, and change eligibility between identity checks. The same new regression against unchanged #303 reproduces `200 !== 403`; the patched endpoints deny. Unsupported production social/library/notification mutation and read paths remain rejected without upstream forwarding. No new capability is enabled by this fix.

## Fresh hosting observations and owner actions

November 18 read-only Vercel inspection: one custom slot allowed, **zero custom environments configured**. Project SSO is `all_except_custom_domains`, not proof of protection for an uncreated custom host. No environment was created or changed.

Read-only validation database `caynldluziwrzmvuslzg`: gate schema absent; zero Auth sessions, MFA factors, storage buckets and realtime-published tables. Community posts/profiles/comments/reactions/follows, saved legs, member parlays and notification preferences are absent. An existing fixture database is not a ready authenticated acceptance environment.

1. **Project owner:** record plan inclusion, current usage, effective spend controls/monitoring and attribution within the prior conditional $10 incremental Vercel ceiling. That ceiling does not approve another paid service. Do not configure resources before this evidence and isolation approval.
2. **Project owner/security:** demonstrate effective build/runtime variables for the exact protected target and aliases. Use only validation project credentials; no inherited production Preview credentials, production domains, database/service/provider keys, billing, email/push/webhook integrations or scheduled ingestion/publishing jobs. Follow the exact variable inventory in [final-staging-acceptance.md](final-staging-acceptance.md). Missing configuration must fail closed; a branch with no staging profile must not become a production-backed preview.
3. **Codex + database security reviewer:** independently review missing social/library/profile/inbox/download contracts in small packages. Reuse existing production interface shapes; stage only synthetic data. Preserve installer preflight and restrictive policies; do not relax catalog checks to accommodate imported tables. Review triggers and side effects before any permitted synthetic mutation.
4. **Identity owner:** after isolation proof, map both intended owners to authorized test accounts with MFA and independent recovery custody. No copying production sessions or revoking production accounts.
5. **Codex + Elo:** deploy only the approved exact SHA manually after isolation approval; then perform real-session acceptance and record actual outputs.

## Acceptance and rollback requirements

New branch has an exact-name Vercel Git opt-out in its first commit, missing-profile fail-closed classification, and exact-head CI coverage. Production defaults are unchanged. Full CI and four-mode/browser evidence must be rerun for this candidate; #303's 20 green workflows cannot be inherited.

Hosted acceptance is NOT TESTED: both-owner MFA/recovery; non-owner, anonymous, expired/revoked cookie/API/direct-data denial; cross-user read and mutation isolation; Home→Zone→Room journeys; stories/community/saves/My Lays/profile/inbox; full research and nonempty downloads; mobile/keyboard/screen reader/contrast; worker/data preservation and rollback.

Retain the original 15-second smoke timeout as unresolved, and eight gradient contrast manual-review items. No timeout, assertion or warning is weakened here. Browser fixtures and synthetic SQL do not establish real-session coverage.

Rollback: record previous isolated app SHA, restrictive-policy catalog, own/historical row hashes/counts and entitlements before installation. Roll back the application/UI independently while keeping live-session RLS installed. Prove non-owner/revoked access remains denied; fresh owner recovery and worker append still work; row hashes/counts and entitlements remain preserved. No data deletion or security-policy removal to make rollback pass. Hosted rollback remains untested.

Recommended sequence: this exact-head security/source review → reviewed positive isolated contract packages + Elo consumer integration → owner cost/isolation approval → isolated preparation and protected manual deployment → full real-session acceptance and independent security review → consolidated exact-SHA CEO decision. **Production remains NO-GO.**

Independent review of initial `464f7653` found that the separate Home/Room reader still lacked final independent eligibility checks (#304 comment 6982342260). The follow-up applies them to both Dealer and research paths and tests 12 combinations of resource, eligibility endpoint and revocation/malformed/outage result. Denied responses contain no protected payload. Initial two-endpoint coverage was incomplete; do not treat that checkpoint as the finished fix.

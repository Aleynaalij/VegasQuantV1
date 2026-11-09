# Dealer results and followed-account notifications

Prepared from main `b2bf71ce0fd05ac8beee93995bff3486130462d8`, then synchronized with `e52068935bebe529d3254be034ac97a23d222f08` (member profiles) for draft PR review. The owner subsequently authorized a coordinated merge and production deployment. Historical migration sources are restored only, not rerun. Repository automation may build branch previews; previews do not apply SQL to production.

## Behavior

- A newly accepted live-pick alert creates one `Live pick update` Zone post attributed to the verified Dealer publisher. The body is the exact existing alert text, covering live clears and final hit/miss/push outcomes already produced by the alert planner. It is a live observation, not a new official grade, settlement, wager, or payout.
- The original notification fan-out only queues Zone work. Publication runs in a separate RPC, so a Zone profile, safety, insertion error, timeout or lock wait cannot roll back the accepted alert or its notifications. The accepted ledger retains the exact sport/message for a bounded retry, even after the six-hour live-candidate window. Historical rows have no queue state and are never replayed.
- Result posts do not emit an additional post or mention notification. Existing `pick` notifications keep their audience, destination, entitlement checks and settings.
- Other Dealer posts, including automated posts, notify the existing eligible Zone audience even if nobody follows the Dealer. This exception belongs only to `private.is_dealer_publisher`, not to every administrator or an account with a similar display name.
- Every other person-origin notification requires the recipient to follow the actor. This includes posts, likes, comments, replies, mentions, follows, shares, contributor activity and message-related notifications when they have an actor. The request is interpreted consistently across those categories. Actor-less system notices and security/password/account notices are not hidden by following rules.
- Existing blocks, community restrictions, age checks, recipient eligibility, channel opt-ins, disabled types, quiet hours and budgets remain. “Everyone” does not bypass those safeguards or turn on push/email.

## Existing inbox and queues

A restrictive SELECT policy filters direct reads, inbox/search RPCs, unread counts and realtime SELECT authorization. Unfollowing hides existing notifications from that actor immediately on the next read; no history is deleted. Delivery claims and the last check before sending also enforce the current follow relationship.

New grouped notifications are separated by actor. Legacy multi-actor groups are hidden as a whole if any contributing event is from an unfollowed account, so their retained names/counts cannot leak through a followed final actor. They may become visible again if every contributing actor is followed. Pending/expired-leased jobs that no longer qualify are suppressed when due; active leases are not overwritten, and their final authorization check rejects delivery.

The verified generated-result matcher permits simultaneous result posts through only the thirty-second post-spacing check. Author identity, visible profile/avatar, content safety, attachment and ordinary member rate limits remain. Server proof is the exact private alert row, deterministic post ID, sport, body, title/kind and empty attachments, not a client-controlled flag.

## Durable Zone delivery

Each newly accepted alert records a `pending` Zone job with zero publication attempts, together with its original notification fan-out. The route then drains fresh jobs in a separate RPC. Publication never runs inside the original alert transaction. Each retry attempt runs inside its own database subtransaction. On failure, temporary JWT/automation settings and post writes roll back; the ledger retains the attempt number, a bounded 200-character SQL error and next due time. Original notification failures still roll back acceptance rather than recording an undelivered alert.

The existing `vq-live-pick-alerts` job keeps its two-minute schedule and dispatch secret. Its invocation predicate now includes due Zone jobs, checked before live candidates, so retries continue after games leave the six-hour window. This migration does not create or enable a cron job, change settings or rotate secrets. The route starts a backlog retry lane before and independently of candidate/score reads, and a retry RPC failure does not stop fresh alerts. After accepted alerts commit, it runs another bounded drain for prompt fresh publication. If that drain cannot run, the existing scheduler picks up the due ledger rows later.

`public.retry_live_pick_zone_posts()` is service-role-only and processes up to 20 due rows with `FOR UPDATE SKIP LOCKED`. The locked state and deterministic post ID prevent repeat publication. Conflicting post IDs fail closed; there is no blind conflict-ignore or adoption of unrelated posts. `posted` is terminal even if an administrator later deletes the Zone post. Retries never call the notification emitter or re-fetch a score.

There are at most eight completed, handled publication attempts per accepted result, including the first publication attempt. Failed attempts wait 1, 2, 4, 8, 16, 32 and 60 minutes; the two-minute scheduler may round those waits upward. The eighth handled failure becomes `blocked` with no automatic retries. Query cancellation (SQLSTATE 57014), connection termination or a whole-RPC failure aborts the retry transaction, preserving its due rows but rolling back attempt bookkeeping. These interrupted transactions do not consume the cap. Cancellation is intentionally not swallowed so operator/server deadlines remain effective; the route reports `zone_unavailable` and HTTP 503 when that RPC fails. Original notifications were committed in a different RPC and remain intact. Operators can inspect `public.live_pick_zone_health()` or the `zone_results` field of `public.social_notification_health()` for pending/due/blocked counts, oldest due time and the latest bounded error. The authenticated dispatch route reports HTTP 503 for unresolved pending/blocked jobs or a failed lane, including publication failures observed by its final health read. It does not echo stored SQL errors.

Blocked work requires operator investigation and a separately approved targeted requeue after repair. Do not reset posted or historical rows. No manual requeue or new scheduler activation is part of this change. Read-only catalog inspection on November 9 confirmed `vq-live-pick-alerts` is active on `*/2 * * * *`. Release validation must recheck that it is present and healthy; the synthetic test's HTTP/cron seam is not evidence of live scheduling.

## Recovered deployment prerequisites

Read-only production inspection on November 9, 2026 found deployed migrations `20261106221542_dealer_publisher_identity` and `20261106221738_dealer_profile_visibility` absent from main. This branch now restores both files byte-for-byte from their recorded migration statements. The live `private.is_dealer_publisher(uuid)` checks the `vq_dealer` configuration, server-controlled publisher metadata and a locked, credential-less `TheDealer` identity. This patch reuses that helper and does not create, rename or privilege any account.

Recovered source checksums (SHA-256):
- `20261106221542_dealer_publisher_identity.sql`: `a5bd0fcfbd4532efbb0eb1295a29640fec85ccb77cfc91c7f99a07b622382597`.
- `20261106221738_dealer_profile_visibility.sql`: `f5269729637d54fbc4840842dfa8a47567b4cbcffb921da733f1203db7f821d0`.

Restoration does not rerun these migrations. Their recorded production versions already exist and must not be re-applied or repaired. The original identity migration includes a one-time publisher bootstrap and historical post-attribution change, preserving original authors in a private audit table. Those historical operations are recovered source, not new authorization to create an account or rewrite existing posts. No production state was changed during recovery.

The new migration explicitly fails if the helper is absent. Tests consume the recovered definition and execute the recovered migrations against synthetic prerequisites. A complete empty-database reset is not claimed: the historical bootstrap deliberately requires consistent existing publisher mappings and an eligible age policy. Review those prerequisites rather than weakening them.

Applying the new migration changes future publishing/notification behavior and needs separate release approval. Coordinate the SQL and app rollout: SQL-first records pending jobs that the new route can later drain. App-first continues original alerts but reports missing retry/health RPCs as HTTP 503; alerts accepted before the SQL exists remain historical and are deliberately not backfilled. Do not merge an auto-deploying branch without a separately approved coordinated rollout and pending-backlog check. Check current live definitions and latest main before application. The source-anchor patches deliberately fail rather than overwrite incompatible function changes. No historical notification deletion or result-post backfill is included.

## Verification and rollback

Run `node --test tests/sql/dealer-zone-follow-notifications.mjs tests/sql/dealer-publisher-recovery.mjs`, the existing notification-access suite, `npm test`, `npm run typecheck` and `npm run build`. The focused suite uses PGlite and synthetic accounts; it does not prove a live service-role request, browser/realtime delivery, or deployed end-to-end behavior.

Rollback should restore the prior emitter, Zone-post notifier, publication guard and social trigger definitions, remove the follow policy/helpers, and restore the prior live-alert function, scheduler predicate and health function. Stop the new retry entry points while preserving queued failure records for review. Retain already-created posts and the alert ledger. Do not delete result history or reset deduplication keys. Existing actor-specific groups remain valid under prior notification code. Verify a separately approved rollback against current production source rather than blindly copying an old function.

## Final local verification, November 9, 2026

- Focused composed database and recovered-source suites: 25 passed, 0 failed. Includes queue-only acceptance with a canceled (57014) publication RPC, preserved notifications, bounded handled retries, >6-hour recovery, terminal deletion, batch/collision isolation, original emitter rollback, service-session settings, and latest-main authenticated profile-follow integration.
- Dispatch/planner suite: 14 passed, 0 failed, including independent backlog/fresh drains and failed/canceled publication isolation.
- Full repository tests on the final queue-only code plus main `e520689`: 678 passed, 0 failed using `node --import tsx --test --test-concurrency=1 tests/*.test.ts`.
- `npm run typecheck` and `npm run build`: passed. No separate lint script is defined.
- Both restored historical source hashes remain pinned and unchanged. Read-only production catalog checks found the target function anchors and the existing active two-minute scheduler. No production DDL/data, notifications or posts were written during preparation.
- Remote CI must be checked on the published final SHA. The synthetic service-role/authenticator flow and fake HTTP capture are not live requests. Full empty-database reset, live browser/realtime/external delivery and multi-connection PostgreSQL races are not claimed.

## Authorized SQL release

The reviewed SQL was applied once on November 9, 2026. Supabase recorded version `20261109032951`; the repository file and tests were aligned to that actual version without altering migration history or SQL bytes. Its recorded statement MD5 `8a387b4c6a6ca655c59452def80fa21f` matches the reviewed file (SHA-256 `52db149e4711f5b28172bd68ee64bf5847223ba2948fc68b3913ac47dd6978b2`).

Immediate readback verified the restrictive follow policy, service-only retry/health permissions, active existing two-minute scheduler, and zero pending/due/blocked jobs. All 18 pre-existing alert rows remained historical and unqueued; no result posts were created by the migration. App deployment status is recorded in PR #266.

## Release-gate fixture correction

A later browser run correctly showed four games because its fifth synthetic kickoff (`now + 90 minutes`) crossed Eastern midnight. The failed-page artifact confirmed this was test data, not an announcement overlay or application regression. The Lobby story fixture now creates five starts inside the requested NBA day bounds without changing real clocks or weakening the exact five-game assertion. Seven deterministic tests cover the original failure, midnight, 23/25-hour DST days and invalid filters. Script syntax and a fresh current-main build passed. Local Chromium could not launch because of environment socket permissions; actual browser acceptance is required in GitHub CI before merge.

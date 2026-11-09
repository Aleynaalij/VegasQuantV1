# Dealer results and followed-account notifications

Prepared locally from main `b2bf71ce0fd05ac8beee93995bff3486130462d8`. No production migration, publication, merge, or deployment is part of this change.

## Behavior

- A newly accepted live-pick alert creates one `Live pick update` Zone post attributed to the verified Dealer publisher. The body is the exact existing alert text. It is a live observation, not a new official grade, settlement, wager, or payout.
- The result post and existing notification fan-out share the alert's transactional, once-per-pick ledger. A retry cannot post again. If post creation fails, the new alert rolls back and can be retried. Historical alert rows are not replayed.
- Result posts do not emit an additional post or mention notification. Existing `pick` notifications keep their audience, destination, entitlement checks and settings.
- Other Dealer posts, including automated posts, notify the existing eligible Zone audience even if nobody follows the Dealer. This exception belongs only to `private.is_dealer_publisher`, not to every administrator or an account with a similar display name.
- Every other person-origin notification requires the recipient to follow the actor. This includes posts, likes, comments, replies, mentions, follows, shares, contributor activity and message-related notifications when they have an actor. The request is interpreted consistently across those categories. Actor-less system notices and security/password/account notices are not hidden by following rules.
- Existing blocks, community restrictions, age checks, recipient eligibility, channel opt-ins, disabled types, quiet hours and budgets remain. “Everyone” does not bypass those safeguards or turn on push/email.

## Existing inbox and queues

A restrictive SELECT policy filters direct reads, inbox/search RPCs, unread counts and realtime SELECT authorization. Unfollowing hides existing notifications from that actor immediately on the next read; no history is deleted. Delivery claims and the last check before sending also enforce the current follow relationship.

New grouped notifications are separated by actor. Legacy multi-actor groups are hidden as a whole if any contributing event is from an unfollowed account, so their retained names/counts cannot leak through a followed final actor. They may become visible again if every contributing actor is followed. Pending/expired-leased jobs that no longer qualify are suppressed when due; active leases are not overwritten, and their final authorization check rejects delivery.

The verified generated-result matcher permits simultaneous result posts through only the thirty-second post-spacing check. Author identity, visible profile/avatar, content safety, attachment and ordinary member rate limits remain. Server proof is the exact private alert row, deterministic post ID, sport, body, title/kind and empty attachments, not a client-controlled flag.

## Recovered deployment prerequisites

Read-only production inspection on November 9, 2026 found deployed migrations `20261106221542_dealer_publisher_identity` and `20261106221738_dealer_profile_visibility` absent from main. This branch now restores both files byte-for-byte from their recorded migration statements. The live `private.is_dealer_publisher(uuid)` checks the `vq_dealer` configuration, server-controlled publisher metadata and a locked, credential-less `TheDealer` identity. This patch reuses that helper and does not create, rename or privilege any account.

Recovered source checksums (SHA-256):
- `20261106221542_dealer_publisher_identity.sql`: `a5bd0fcfbd4532efbb0eb1295a29640fec85ccb77cfc91c7f99a07b622382597`.
- `20261106221738_dealer_profile_visibility.sql`: `f5269729637d54fbc4840842dfa8a47567b4cbcffb921da733f1203db7f821d0`.

Restoration does not rerun these migrations. Their recorded production versions already exist and must not be re-applied or repaired. The original identity migration includes a one-time publisher bootstrap and historical post-attribution change, preserving original authors in a private audit table. Those historical operations are recovered source, not new authorization to create an account or rewrite existing posts. No production state was changed during recovery.

The new migration explicitly fails if the helper is absent. Tests consume the recovered definition and execute the recovered migrations against synthetic prerequisites. A complete empty-database reset is not claimed: the historical bootstrap deliberately requires consistent existing publisher mappings and an eligible age policy. Review those prerequisites rather than weakening them.

Applying only the new migration changes future publishing/notification behavior and needs separate release approval. Check current live definitions and latest main before application. The source-anchor patches deliberately fail rather than overwrite incompatible function changes. No historical notification deletion or result-post backfill is included.

## Verification and rollback

Run `node --test tests/sql/dealer-zone-follow-notifications.mjs tests/sql/dealer-publisher-recovery.mjs`, the existing notification-access suite, `npm test`, `npm run typecheck` and `npm run build`. The focused suite uses PGlite and synthetic accounts; it does not prove a live service-role request, browser/realtime delivery, or deployed end-to-end behavior.

Rollback should restore the prior emitter, Zone-post notifier, publication guard and social trigger definitions, remove the follow policy/helpers, and restore the prior live-alert function. Retain already-created posts and the alert ledger. Do not delete result history or reset deduplication keys. Existing actor-specific groups remain valid under prior notification code. Verify a separately approved rollback against current production source rather than blindly copying an old function.

## Local verification, November 9, 2026

- Focused composed database and recovered-source suites: 19 passed, 0 failed, including full historical migration execution against synthetic prerequisites. Both restored source hashes are pinned in the recovery suite.
- Existing notification-access contract suite: 6 passed, 0 failed.
- Full repository tests: 658 passed, 0 failed using `node --import tsx --test --test-concurrency=1 tests/*.test.ts`. The initial parallel `npm test` attempt had a killed SQL-test subprocess; the complete serial rerun passed.
- `npm run typecheck` and `npm run build`: passed. No separate lint script is defined.
- Read-only production catalog checks found every patch anchor present in the targeted function definitions. No production DDL/data, notifications, or posts were written.
- Before publishing for review, remote CI was not run. Live application/browser/realtime or external delivery checks and a multi-connection PostgreSQL race test remain outside this draft. The synthetic service-role/authenticator case is not a live request.

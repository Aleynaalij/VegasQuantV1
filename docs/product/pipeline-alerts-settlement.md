# Alerting, settlement and notification dependency review — draft

Baseline main `6cadc283608b655fc4321ab7144bec7533fbfea6`.
Notification dependency: existing [draft PR #200](https://github.com/Aleynaalij/VegasQuantV1/pull/200),
exact head `e94204fe0485a81a00acd0f1a728d054ca0a3664`. This is a review of that fix, not a
replacement PR or permission to apply it. No live sends, collector calls, regrading or shadow runs.

## Existing notification contract and compatibility

Reviewed: [social schema/emitter/claim/final check](../../supabase/migrations/20261017015506_social_notification_system.sql),
[Zone events](../../supabase/migrations/20261028230000_zone_post_notifications.sql),
[live-pick audience](../../supabase/migrations/20261101100000_live_pick_alerts.sql),
[dispatcher](../../src/app/api/notifications/social-dispatch/route.ts) and
[delivery adapter](../../src/lib/social-notification-delivery.ts).
The #200 migration/tests were read at their actual head, run there, then tested with a clean
uncommitted composition of current main in an isolated worktree. Both SQL executions passed:
six tests each, zero failures/skips. A third run with additional review-only regressions also passed six tests. All five relevant source files above are unchanged between
that head and current main. This establishes bounded source/fixture compatibility, not deployed
schema equivalence or a complete authorization audit.

| Boundary | Preserved contract / reviewed behavior | Evidence / limit |
| --- | --- | --- |
| Recipient selection | Existing live-pick audience: confirmed-email, age-eligible admin, active explicit membership or unblocked paid subscription; deletion in progress excluded | #200 tests: explicit membership, paid/admin, blocked billing, missing age; no broader trial/complimentary audience inferred |
| Creation | Existing per-type preferences and recipient rules; security/password/account inbox exceptions remain visible | SQL verifies muted pick creates nothing; muted account/security notices remain in inbox without external opt-in |
| Inbox | Recipient-owned rows; protected pick eligibility is current, not permanently inherited from creation | SQL covers owner isolation, lost entitlement and age change; no unrelated private data included |
| Queue claim | Current eligibility rechecked, bounded 25 jobs, leases and retry count; existing quiet/presence/budget behavior retained | Existing composed definitions executed; fixture exercises loss/recovery of eligibility |
| Final send | Dispatcher requires a successful final eligibility RPC before calling provider; external channel consent and disabled types retained | SQL revokes push after claim and denies final send; the wrapper is unchanged on main |
| Once-only database effects | Event/delivery keys and leased final acknowledgments remain; emit dedupe prevents repeated event fanout | Base SQL unique keys/ON CONFLICT; no new delivery route |
| Provider transport | Email uses a stable delivery-ID idempotency header; web-push has no equivalent exactly-once acknowledgment | Existing adapter/tests; provider acceptance does not establish device display |

### Prioritized correction and acceptance list

1. **Release blocker:** #200 migration remains prepared/unapplied in this work. Current production
   definitions/order/grants must be checked under a separately approved release. Its exact-string
   replacement guards intentionally abort if deployed functions differ; never weaken those guards
   merely to make a migration apply. Base compatibility fixtures passed, not live equivalence.
2. **Acceptance gap:** current #200 fixtures cover push consent revocation, but do not directly
   exercise email consent revocation after claim, every per-type change after claim, or all
   age/deletion/lease recovery permutations. Final send source checks both channel booleans;
   the local review patch now adds and passes email revocation, per-type mute after claim and expired-lease checks against the composed #200 dependency. The patch is prepared, not committed to #200 or executed in its remote CI. Adopt it there before release. Do not
   open a competing notification implementation. No newly demonstrated implementation defect is
   claimed for those untested branches.
3. **Transport limitation:** crash after accepted web-push but before final acknowledgment can
   produce at-least-once delivery. Database dedupe is not proof of exactly-once device display.
   Stable notification IDs and UI dedupe are appropriate; avoid unsupported delivery promises.
4. **Health scope gap:** legacy health push has four NFL providers; UI has six. Neither covers
   all sports. Proposed operational alerts below require explicit contracts and consent; this
   draft adds no subscription, destination, endpoint, cron or live delivery.
5. **Ownership decision:** support destination and incident on-call owner/back-up are unconfirmed.
   Do not silently repurpose member social delivery as an operational escalation route.

Security reproduction details, real identities/destinations and secrets are deliberately absent.
The composed SQL tests use synthetic accounts in an in-memory database only.

## Job-health alert design (not activated)

Keep independent axes: **run outcome** (ok, partial, failed, skipped, not-due, no-events, unknown)
and **evidence age** (missing, invalid/future, current, stale). A skipped/not-due job is not a
new quote; a partial run does not become merely stale when it ages. Source timestamps and
retrieval/check times remain separate. Missing from a bounded recent sample is unverified, not
proof of missing storage. Expected cadence must come from the existing sport/provider contract
and enabled settings; never widen a quote TTL or increase paid cadence to suppress an alarm.

| Proposed state | Entry / exit evidence | Dedupe and handling |
| --- | --- | --- |
| UNVERIFIED | No usable evidence, invalid/future timestamps or failed status query | Separate from green; do not send member alerts |
| HEALTHY | Valid run evidence within that job's agreed cadence and no declared gap | Does not assert every game's quote coverage or settlement |
| EXPECTED_IDLE | Explicit not-due, skipped with reason, or no-upcoming-events | Retain last actual retrieval/source time; later overdue tick can still raise incident |
| DEGRADED | Partial coverage, provider/config/budget gap, or overdue actual work | Group by sport/provider/contract version + stable reason code; proposed owner review |
| FAILED | Explicit worker/provider failure or repeated inability to assess | Preserve failure reason and last evidence; proposed escalation by severity |
| RECOVERED | Later valid completed run resolves the same incident's required evidence | One recovery event per incident; a generic HTTP 200 cannot close it |

Proposed routing: existing opt-in **administrator operational** channel only, after Mike assigns a
primary and backup and confirms a destination. High severity: persistent failures in due work,
identity conflicts, or unavailable status; medium: partial coverage/budget/config gaps; informational:
expected idle or recovery. No escalation to ordinary members by default. Exact delay/cooldown
values and timezone coverage are owner decisions, not enabled defaults.

Persist proposed incident ID, sport/provider/contract version, stable reason, first/last seen,
last evidence time, severity, acknowledgment, last delivery and recovery marker. Deduplicate on
stable incident identity, not volatile timestamps or entire JSON text. A reason/severity change
updates the incident, with bounded escalation; repeat ticks respect approved cooldown. Failure
and recovery must have separate idempotency keys; recovery cannot erase the immutable evidence.
Retries need a bounded lease/backoff/dead-letter state and final recipient/consent recheck.

## Settlement design and existing foundations

Reuse [automatic editorial results](automatic-results.md),
[multisport backend](multisport-backend.md), existing result parsers/helpers and merged
incomplete-final, identity, retraction and result-attempt guards. They are foundations, not new
work to rebuild. Existing unsupported-market, DNP/void and review-only rules remain unchanged.

1. **Bind source identity before evaluation.** Sport + provider game ID, season/date, teams,
   participant IDs and exact period/market/direction/line bind to the immutable original selection
   and quote. Display-name similarity or a final score alone cannot settle another game/player.
2. **Validate complete final evidence.** NFL editorial requires the documented ESPN/nflverse
   matching stat evidence. NBA and NHL/college retain their supported complete-final/confirmation
   rules and unchanged second read at least three hours later. Store source URL/identity,
   provider timestamp if supplied, retrieval time, raw hash and parser/contract version separately.
   Corroboration does not claim independent providers or sportsbook confirmation.
3. **Pending and conflicts.** Live target reached is progress, never final settlement. Incomplete
   scoreboard/box, missing player/column, ambiguous identity or missing weekly corroboration stays
   PENDING/review-only. Conflicting finals or a later retraction to non-final produce sticky
   CONFLICT and suspend grading, retaining the original immutable result and correction evidence.
4. **Retries and rotation.** Preserve bounded per-run work and separate attempted_at/check time
   from source/result evidence. Failed games rotate so they cannot starve the queue; retries do
   not restart final confirmation based on fabricated observations. Repeated unresolved cases
   need owner review, not guessed zero/DNP/void.
5. **Exactly-once database consequences.** Transactional exact-selection result keys, unique
   publication event keys and atomic journal/record effects prevent duplicate database outcomes.
   Lost responses can be retried idempotently. Corrections append evidence and reviewed decisions;
   they never rewrite original prices, picks, publications or result history. External deliveries
   retain the transport limitation above.
6. **Release-only acceptance.** Verify composed local fixtures for incomplete finals, identity
   mismatch, source failure/recovery, final confirmation, retraction/sticky conflict, queue rotation,
   duplicate retry and denied writes. Any future real-state verification is readback under approved
   scope, not permission to invoke settlement, regrade records or rewrite history.


### Prepared supplemental #200 regressions

[notification-review-regressions.patch](notification-review-regressions.patch) changes only the
existing #200 SQL test case, with synthetic accounts and no notification implementation change.
It verifies allowed email delivery before consent changes, denial after email opt-out, denial
after a per-type mute, and denial after lease expiry. The original six-test summary remains intact
for the existing ordinary-discovery wrapper. Applied only to the isolated composed review worktree;
not to main, hosted SQL, or the remote #200 branch. Run the #200 ordinary-discovery wrapper again
when adopting the patch, alongside its final-head CI. No transport send occurs in these SQL tests.

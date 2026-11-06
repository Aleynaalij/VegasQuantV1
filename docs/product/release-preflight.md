# Combined release preflight and final-review evidence

This is a non-sensitive evidence summary, not a release record. Raw catalog captures,
credentials, account identifiers and member rows are excluded from this repository.

## Candidate and capture

- Captured application/migration candidate: `d50daad84451062e1da1f3dab94b9636ac772ce4`.
- Base/unchanged production main at capture: `6cadc283608b655fc4321ab7144bec7533fbfea6`.
- Captured candidate tree: `4371b124cd3daa7f3f25d6747583371d030ce3e2`.
- Read-only capture completed by **2026-11-06 10:36:09 UTC** (local capture-file completion
  timestamp; not a claim of an exact server transaction time).
- This correction batch changes the feed helper and acceptance/evidence safeguards. It does
  not change any of the three prepared migration files. The final revised heads and their
  final-head CI/artifact links are recorded together in [PR #223](https://github.com/Aleynaalij/VegasQuantV1/pull/223).

| Prepared migration, in release order | SHA256 |
| --- | --- |
| `20261103113707_notification_access_contracts.sql` | `db90c12e9177c455b91ec4e549af2038b1cebc192e7ea97ffebc6ada9c53b698` |
| `20261104101722_community_story_clock.sql` | `539661890332c79531b4fd948abd388260becf96d954d03acc079d4d5e2d9a6f` |
| `20261105233947_ruby_kalshi_source_link.sql` | `8523f6ebec840bd5b8f958ae6a0e4f935b03823a427734b7442e211bbafcc976` |

## Installed-definition compatibility

Read-only migration history and catalog inspection found the three migrations unapplied;
new clock/source RPCs and pick guard absent, as expected. The existing source view uses
`security_invoker=true`. Existing claim/final-send functions are service-role-only and the
admin editor contains the verified-admin guard. No member/business rows were read or modified.

The private capture supplies six actual target definitions (emitter, claim, final-send,
submit, edit and home projection) and the source view to an isolated PGlite fixture with
synthetic rows. Existing age/admin prerequisite fixtures remain explicitly synthetic; this
is not a reproduction of production sessions or all database objects. The replay applies
all three exact prepared migrations and compares fixture target function ACL/security
attributes before and after. The source fixture then exercises normalization, direct-write
and anonymous denial, age/admin/erasure checks, retries/quota, immutable originals/revisions,
legacy payloads, blocked reads and notification dedupe.

Reproduction, from repository root, using an authorized private capture kept outside Git:

```sh
node scripts/verification/replay-release-catalog.mjs /private/catalog.json
node --test --test-reporter=tap tests/sql/notification-access-contracts.mjs
NOTIFICATION_NEGATIVE=no-backoff node --test --test-reporter=tap tests/sql/notification-access-contracts.mjs
```

Revised-batch local replay result: **passed**, existing ACL/security attributes retained,
source contract assertions passed. Notification positive: **six passed**; no-backoff
mutation: **nonzero**, intended immediate-due-work assertion failed. The dedicated notification
workflow now requires that assertion plus a completed nonzero TAP failure and retains logs.
The replay wrapper never prints raw captured definitions or database exception payloads.

## Consolidated review dispositions

| Item | Correction / evidence contract |
| --- | --- |
| Feed timestamps | `attemptedAt` is explicit `attempted_at`, or NFL props legacy batch `fetched_at`. `eventFetchedAt` preserves only valid version-2 event-success evidence; no attempt is relabelled successful retrieval. Nine focused tests include actual-writer-shaped failed, partial, deferred/carried-forward and legacy payloads. No quote/cadence/selection change. |
| Phone controls | Synthetic source-card Cancel and admin Remove/Restore receive ordinary, unforced clicks after normal wheel scrolling. Tests assert viewport position and center hit-target, capture viewport screenshots before the clicks and retain coordinate/result JSON. Cancel clears eligibility; remove/restore retains source and does not navigate externally. Final-head artifacts determine acceptance; the old tall-element capture alone does not prove unreachable controls. |
| Notification safeguards | Before/after snapshots cover state, due time, attempts, lease and lease expiry for future pending, future expired-lease and active-lease jobs, including repeated claims. Existing overdue deferral and terminal-expiry assertions remain. Positive/negative CI logs are retained. |
| Preflight reviewability | This summary links the candidate/base, unchanged migration hashes, capture completion time, compatibility scope, replay command/results and release/rollback sequence without publishing the private capture. |

Final revised source/combined tests, build, browser interactions and negative-control results
must be read at their final heads. Old-head green CI is historical evidence, not acceptance
of these added cases. The earlier claim that all acceptance was complete is superseded by
this explicit review checklist and PR #223's current evidence packet.

## Release sequence and limits

1. Recheck exact candidate/main and installed-function anchors immediately before an authorized
   release. Apply only the three reviewed migrations in the order above, before the new app.
2. Verify new RPC grants, source-view invoker behavior and unchanged claim/final-send restrictions.
3. Release the combined candidate once, verify the resulting main tree and production domain's
   deployed commit, then perform bounded readback without real posts, sends or trades.
4. For application rollback, restore the recorded prior production revision. Keep the backward-
   compatible schema/source columns and immutable history; any database rollback needs separate
   review rather than destructive column/history removal.

Captured-catalog replay cannot prove future hosted DDL success, live provider coverage,
real-device delivery or production-member acceptance. Existing platform advisory findings were
recorded separately, not silently changed or described as a clean platform-wide audit.
All PRs remain draft and all migrations remain prepared/unapplied. No merge, deployment,
provider spend, live dispatch, role change or real-member action is part of this follow-up.

# Incoming contributor Kalshi links — prepared, not released

Task KALSHI-LINK-POST, handoff issue #65 comment 6658794191.
Baseline main `6cadc283608b655fc4321ab7144bec7533fbfea6`; independent branch
`codex/kalshi-link-post`. Story #221 and other draft work remain separate.

## Behavior

Contributors may paste an approved Kalshi combo URL, inspect/remove/change its normalized preview,
then deliberately Publish through the existing daily-lay composer. Link alone is enough; typed
legs/screenshot/title/description remain optional under the existing supported flows. Existing
three-per-Eastern-day quota, auth/email/age/profile/contributor guards and notification path stay.
No paste automatically publishes, fetches/unfurls a page, navigates or accesses the clipboard.

`normalizeKalshiSourceLink` accepts only exact lowercase HTTPS `kalshi.com` or `www.kalshi.com`
observed `/markets/kxmvecrosscategory/combo/<single-slug>` routes with exactly one case-sensitive
`marketTicker` locator. Raw input is at most 2048 characters; slug/ticker are bounded ASCII tokens.
Credentials, ports (including explicit :443), parser-repaired paths, whitespace/control characters,
backslashes, percent encodings, lookalikes, alternate routes and ambiguous locator keys are rejected.
Unknown nonlocator tracking/order/action parameters and fragments are removed. Supporting another
market route requires actual evidence and a separate change; this is deliberately not a general
Kalshi URL importer. The exact accepted path and marketTicker are preserved, never guessed.

Cards, full-card detail, unified Zone lay rendering, copy and next-day result-review payloads retain
the normalized source. Display is labelled **Contributor-shared Kalshi link**, explicitly not a
verified ticket, executed position or VQ endorsement. No automatic leg/odds/stake/fill/payout/result
import exists. Native sharing keeps the internal card permalink, which resolves to the original
source-bearing card. Source-only cards do not show a meaningless Gambly/matching control; existing
screenshot and typed-leg actions remain for their supported content.

Opening the source requires an explicit button, then the existing wording confirming 21+ and
Kalshi eligibility, then an explicit native link in a separate context with `noopener noreferrer`.
No trading, account connection, API key, RFQ, provider spending or bankroll changes.

## Prepared database contract

`20261105233947_ruby_kalshi_source_link.sql` is generated via the Supabase migration CLI and is
**UNAPPLIED**. It adds nullable canonical `source_link` fields to original submissions and append-only
revisions, and appends the field to the security-invoker `ruby_cards` view and result-review payload.
It retains the exact existing view visibility/hidden/record joins and table RLS/grants.

New `submit_ruby_link` and `edit_ruby_link` invoker wrappers call private guard-rich implementations
derived from the installed original function definitions. Exact source anchors and required quota/
admin/optimistic-revision guards abort on incompatible definitions. Legacy submit remains available;
its idempotency cannot claim a link-bearing payload. Legacy admin edits preserve the latest source;
new source-aware edits can explicitly change/remove it only while keeping valid content. Invalid
URLs are rejected at the write boundary as well as the rendering/client boundary. Minimum-content
checks allow typed legs, photo or canonical source; other checks are preserved.

The original source/author/body/time remains immutable. A retry with the same ID and normalized
payload returns the original; a changed locator is rejected. Revisions require the existing admin
and expected revision; they do not replace immutable originals or alter result semantics. Existing
notification triggers handle new submissions once; no new recipient category or fanout exists.
No account/role expansion, migration application or real-member post occurred during preparation.

## Consumer audit

| Consumer | Prepared handling |
| --- | --- |
| Composer | Explicit input, normalized preview/remove, deliberate Publish; source-aware RPC only when needed |
| Lost response | Pending submission ID reused; canonical locator included in server idempotency |
| Account switch/sign-out | Epoch invalidation closes form, clears pending source/ID; stale callbacks cannot report success |
| RubyCard / full-card route | Validated source label and safe explicit outbound flow; source included in explicit copy |
| Unified Zone lay item | Validated source panel and source-aware copy; existing card permalink preserved |
| Admin revision | Source-aware validated edit RPC; old edit clients retain source |
| Next-day self-reported result | Original/latest source included in existing due payload; no automatic execution/result claim |
| Query consumers | Existing `select('*')` on security-invoker view retains source; blocked/member visibility unchanged |
| Ordinary stories/photos | No changes to story contracts/viewer, upload/transcription or photo rendering |

## Verification and release order

Deterministic normalizer tests cover canonicalization and malicious input. Composed PGlite fixture
executes the actual migration over existing social/contributor/revision/erasure/records definitions,
then tests invalid direct RPC links, denied direct table writes/anonymous access, missing verified
email/profile, link-only creation/read, idempotent retry, changed-payload rejection, quota, legacy
payloads/edit preservation, optimistic revisions, immutable original, notification dedupe and blocked
readers. The ordinary npm test wrapper actually executes this SQL fixture; no hosted writes.

Prepared 390/1280 browser fixture covers invalid input, preview/remove/cancel, no automatic
publication/navigation, link-only lost-response retry, rendering/copy, eligibility and outbound
noopener, edit retention and sign-out. It intercepts the destination with a synthetic page, never
contacts Kalshi. A missing-source negative removes the source panel to verify acceptance rejects
blank link-only cards. The dedicated workflow executes full tests/typecheck/build and browser
positive/negative cases and uploads screenshots. Browser results/screenshots remain unverified
until actual final-head CI; local Chromium startup is blocked by environment socket restrictions.

Release requires separate owner approval, then schema/RPC/view migration before the new app,
followed by grant/definition/legacy-client and authorized real-session readback. No migration is
applied by this draft. Roll back the app first if needed and retain additive source data and
source-preserving legacy edits; do not erase originals or silently remove published source links.

## Independent review follow-up

The SQL normalizer now parses the entire query after the first question mark, matching URLSearchParams rather than truncating additional question marks. Shared adversarial inputs execute against the client parser, direct submission, and direct edit. Stored screenshot recovery now clears the previous source. The browser fixture checks stored-image retention and fresh source/photo/identifier on reopening.

The composed fixture now includes the verified-admin correction, actual age/session definitions, null and false admin denial, age denial, and active account-erasure denial. Source-aware submission explicitly rejects active erasure jobs. No hosted schema is applied. Final-head browser evidence remains pending until CI completes.

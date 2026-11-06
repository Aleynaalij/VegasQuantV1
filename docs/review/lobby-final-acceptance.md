# Final lobby/destination correction review

LOBBY-DESTINATIONS-01; review draft only. No production, permission, migration, merge or deployment operation is included.

## Current corrections

- The required-profile dialog blocking Retry was caused by a synthetic profile with no avatar. The harness now supplies a valid local avatar and separate account identities. It retains the real onboarding guard and uses ordinary clicks.
- The saved-card text assertion hit deferred rendering from `content-visibility:auto` on an offscreen `.workshop-leg`. Only the highlighted `.workshop-just-saved` card now uses visible content rendering; other long-list cards keep the optimization. The existing `Just saved` assertion is preserved. The isolated harness scrolls normally and verifies the saved badge and open card.
- `legacyNflHashTarget` preserves repeated queries, game/saved identity and encoding, and refuses neutral/unrelated routes or forwarding loops. Two helper tests pass.

## Exact peer-file correction proposal

`docs/review/lobby-tailed-corrections.patch` is **unapplied and superseded** by Claude's own correction at `dec70fb677ce6ed34737a2a281df5462c183a3e5` (issue #65 comment 6687975289). It targets the current lobby/Tailed implementation:

1. Reuse the tested route helper; forward both initially loaded and subsequently changed legacy hashes, retaining query values and using replacement to avoid a Back loop.
2. Keep Tailed reads bounded, show failed session checks as request failures, update idle/resumed cutoff labels without inventing results, and distinguish unavailable/partial publication details without asserting an unverified membership cause.
3. Extend the existing Tailed harness with real valid-profile fixtures, a cutoff clock case and partial missing-publication case. Keep its account-isolation negative control and avoid programmatic dialog dismissal.

The proposed patch passed syntax checks but was never applied. The combined draft instead uses Claude's corrected implementation and updated Tailed tests. Actual combined browser/type/build evidence, not the proposal helper tests, determines readiness.

## Acceptance required on the final combined head

- Existing save/share/reuse/Gambly/Kalshi cases, plus the dedicated Retry and pinned-card cases.
- Neutral lobby / NFL desk / cross-sport chips, repeated legacy query params, initial/hashchange Back/Forward paths, selected-game and saved-card identity.
- Tailed open/expired/results, unavailable/partial/error/retry and account isolation.
- 360px, 390px and desktop viewport captures, keyboard/focus, ordinary scrolling, fixed-tray clearance and reduced motion.
- Reused story, reaction, auth, inbox and journey negative controls; terminal job logs and retained artifacts. A still-running or superseded result stays labeled.

Read-only pipeline/security findings remain in `docs/product/briefing-pipeline-security-review.md`. Source-specific green checks do not establish combined readiness, deployment, live member access, checkout or notification delivery. The append-only issue #65 packet records exact tested heads and pending peer claims.

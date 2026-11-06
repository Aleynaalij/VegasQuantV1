# LOBBY-DESTINATIONS-01: builder draft

Base: `3d7d8625649a4d226ab6d5707ccd7ce817fe9e6f`. Branch: `codex/lobby-destinations-builder`.
Claim: issue #65 comment 6684879047. Routing/selector coordination: comment 6684951057.

## Scope and progress

| Item | State | Evidence/dependency |
|---|---|---|
| X1 session/access/library recovery | In progress | Session precedes membership and protected reads; signed-out, denied, failed and loaded/empty states are separate. Explicit retry; bounded network reads; account-generation guards. Browser acceptance pending. |
| X2 labels and form screen | In progress | Build a lay / My lays / Save lay / Edit a copy. VqStamp visible, tooltip and accessible wording describes historical form, not approval. Existing stamp predicate, server recommendation gates and legacy identifiers unchanged. Render and helper tests passed. |
| X3 save/reuse/share/outbound | In progress | Existing server ownership, immutable snapshots, deduplication, optional share, eligibility and explicit outbound controls retained. Saved query changes can fetch exact authorized ID without discarding a draft. Browser save/reopen/copy and account cases prepared; broader existing save/share/Gambly/Kalshi regressions still required. |
| X4 complete destination acceptance | In progress | New isolated browser harness and workflow cover builder states at 360/390/1280 and an intended approval-label failure. Full C1 inventory and Claude routing head required for lobby/cross-sport/history acceptance. |
| X5 combined review | Not run | Requires final Claude and Codex heads together. |

## Route and label contract

- `/parlays?build=1`: open the existing workshop after access resolves.
- `/parlays`: My lays, with a Build a lay action.
- `/parlays?saved=<id>#my-parlay-<id>`: reopen the exact authorized saved card, including an item outside the newest 50. Missing/inaccessible and failed reads have honest distinct messages; failed reads offer retry.
- Preserve legacy `/community?build`, `/community?saved`, `/feed?view=legs`, `/feed?view=parlays`, query IDs and saved DOM anchors. No second builder or cross-sport market contract added. Current supported catalog is NFL full-game player-stat legs.
- Claude owns canonical neutral `/`, NFL `/nfl`, sport/journey helpers and shared chrome. No routing implementation changes are part of this draft.

## Validation evidence

Local: 551 tests passed, including existing SQL-backed parlay ownership/snapshot/model-gate checks and new ordered-access and rendered-stamp tests. TypeScript and fixture-configured production build passed before the last focus-restoration/browser-harness additions; final-head CI remains required. New harness syntax checked. Local Chromium launch failed at browser startup in this environment; browser execution used CI instead.

At source head `8579c06af0e72ae1da0090fefd9ae5574cb61a50`, dedicated [run 42220046735](https://github.com/Aleynaalij/VegasQuantV1/actions/runs/42220046735) passed all three viewport cases and rejected the approval-label mutation with the intended assertion. Artifact `13503480526` contains 10 viewport captures (9 positive and 1 negative). This proves only the synthetic builder cases, not combined lobby acceptance. The preceding head 14f51b7 failed on an overly exact text selector; that failure remains in run 42219689840. Hash-only saved-ID coverage was then added and needs its own final-head run. Screenshot inspection also found that the fast desktop signed-out capture could still show the brief opening overlay; the final harness explicitly waits for that overlay to leave before capturing, and retains an additional scrolled builder-controls viewport with a mobile tray/navigation clearance assertion. Start-builder scrolling now honors reduced motion.

The dedicated workflow retains actual viewport screenshots and runs an approval-label mutation that must fail with the intended assertion. Final-head terminal results and screenshot inspection remain required for the expanded hash-only case. Existing shared harness label selectors require the requested overlap ACK before editing; older tests still use Create parlay/My parlays. Their failure is an outstanding compatibility correction, not evidence that the old journeys were executed successfully on this draft.

## Boundaries and decisions

Draft-only reviewable code/tests/docs. No merge, deployment, migration, hosted data/settings/schedule operation, authenticated production test, real member write, payment, notification delivery, access grant, provider-spend/model/bankroll/trade change. RLS and server gates remain authoritative. No simulator edits.

Support's missing monitored contact and any entitlement/checkout contract decisions remain with the owner/Claude inventory. This draft does not create an address, payment, intake or legal promise. Production release/migrations/member access/delivery for #223 remain outside this batch's verification; merge alone is not live evidence.

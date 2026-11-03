# UX journey contracts — batch 1

Baseline: main `4140a05216cbf891719d17bc2a7d42baecc92f49`. Coordination: issue #65 comment 6610552825; Codex ACK 6610595627. This is a regression/review packet, not release acceptance.

## Existing navigation and identity boundaries

| Surface | Current contract | Preserve during presentation work |
| --- | --- | --- |
| Home | NFL game list uses exact game IDs and future kickoff; matchup links carry the selected slug | Never substitute display-name matching for a game ID; do not invent sport context absent from a route |
| Research | `/feed?view=latest` explicitly opens research; bare `/feed` redirects to Zone | Exercise the actual queried view; a Zone redirect is not research acceptance |
| NFL detail | `/matchups/[slug]` is game-specific; directory/back links use `/matchups` | Keep the selected game's slug and account-scoped reads; directory navigation currently does not promise restored scroll/filter state |
| Zone | `/community`, optional `sport` and `post`; chips filter the same feed | Preserve canonical sport values, post ID, history/back behavior and account-specific interaction state |
| Builder | `/parlays`; `/community?build` and `/community?saved=ID` redirect here | Legacy saved ID is encoded and anchored as `my-parlay-ID`; keep direct saved links functional |
| Private draft | `sessionStorage[vq-parlay-draft:USER_ID]` contains title and exact leg keys | Another account's draft is not a fallback; same-account token refresh must not clear selection state |
| Restore/reuse | `reusableSelections` resolves exact keys against the current catalog | Exclude absent, closed, settled, invalid-expiry and conflicting selections; retain immutable saved snapshots |
| Save | RPC create then confirmation read; busy guard; saved ID focused | No success before confirmation; failed write retains draft; repeated exact combination remains one account save |
| Sharing | Explicit action after save | Save/reopen must not publish or open an external destination |

## Data/UI boundary evidence

The leg catalog retains quote observation/publication/expiry as distinct fields. `canBuildWith` requires a game ID, unsettled state, parseable future expiry, supported full-game player/stat contract. A missing price is unknown; a private saved combination is not a wager, official recommendation or records entry. `weeklyLegs` dedupes latest observations before reuse. Zone contributor-reported outcomes remain distinct from official platform records. Research snapshots display source time and warn prices may change. Reuse merged quote-clock/identity tests rather than changing those contracts in this batch.

No reproducible non-UI helper defect identified in this inspection. No adapter, endpoint, entitlement or schema change proposed.

## Regression package and limits

- `tests/ux-journey-contracts.test.ts`: three executable helper scenarios; current-observation resolution without saved-history mutation, invalid/missing/closed selection pruning and game-scoped player/stat conflict recovery. Combined builder/helper suite: 9/9 pass locally.
- `scripts/ui-smoke/journey-contracts.mjs`: isolated mocked journey at 360/390/1280; legacy saved routing, exact-ID focus, account-scoped draft restore, missing-key warning, close/route/back recovery, failed-save retention, duplicate-click guard, no implicit sharing and absent saved-ID behavior.
- Dedicated `UX journey contracts` workflow runs the browser script and requires a false-success mutation to fail at the intended assertion. Existing CI/shared scripts remain untouched.
- Local browser execution is blocked at Chromium launch by `socket() Operation not permitted`; no browser cases or negative-control execution claimed locally. Read actual workflow logs before reporting acceptance.
- RLS-denied and missing saved IDs intentionally share an absent-data fixture here; this does not prove hosted authorization. Existing SQL/access regressions remain authoritative.
- Home → research sport/game forward/back acceptance and screenshots depend on Claude's U-C1 route evidence and final U-C2/U-C3 changes. This script covers the existing builder round trip; it does not claim the full journey is complete.
- U-X4 independent behavior/screenshot review is pending Claude's completed batch. Real auth/device/production verification remains separate.

## Ownership reconciliation

#139 and #105 remain preserved. #139's older save-route patch targets the legacy Community builder URL and must not replace current main's canonical `/parlays` behavior. Claude has bounded presentation handoff for named journey components; #105's onboarding/membership/layout and shared fixture/CI scope are excluded. Codex changes only the new doc/test/script/workflow files in this package.

# Lobby follow-up fixes

Base: `0f8433fd53e6ee7f60f6672502915c61e33e8d7d`.
Draft implementation only. No merge, production deployment, migration, permission change, production data mutation, payment, real-member notification or wager. Vercel may build its configured preview from the draft branch.

## Changes

- Tailed picks now open an exact publication-key destination, `/feed?view=selection&leg=…`, rather than a generic catalog or a release anchor absent from that view. Official publications use the same exact identity. Missing or inaccessible records show an unavailable state; mismatched responses are rejected. Session and publication reads are bounded.
- Parlay and Hail Mary destinations retrieve the original authorized release and validated one-based candidate index. They display the original constituent selections, not a current catalog substitute. Missing ticket details are disclosed. Outbound copy/matching uses the actual leaf selections/keys and is unavailable when complete ticket details cannot load.
- Post-save card/list readbacks share a 20-second deadline. The returned save ID is retained, and Retry confirmation only reads that ID rather than creating another lay. Confirmed cards survive a failed list refresh. Account-generation guards discard old results, and newer draft edits are not cleared.
- Home uses the approved arena direction: decorative text-free 64 KB WebP backdrop, gold sport-room controls, a gold-framed real schedule jumbotron and green next actions. A three-game preview has an explicit real Show all count. The standard VQ Tonight presentation elsewhere stays unchanged. Current sources, timestamps, stale/error/empty states, retries and privacy gates remain intact.

## Verification

Focused publication and save helper/orchestration tests cover exact identity, second candidate, official picks, ticket leaves, outbound leaf text/keys, deadlines, retries, wrong IDs, late completions, account changes, repeat clicks and newer drafts. Orchestration tests execute the component's save logic with synthetic state; they are not browser tests.

The browser scripts now click Tailed destinations and assert the resulting exact record and ticket leaves, return with Back/Forward, and acknowledge the update prompt through its real controls. No dialog is programmatically closed by the Tailed harness. The arena test checks first-fold placement above fixed navigation, touch targets, keyboard focus, overflow, route/back behavior, expansion and honest loading/error/empty states at 360, 390 and 1280px. Dedicated CI includes the new cases and wrong-publication, oversized-intro, other-account and approval-label negative controls.

Local browser execution was blocked by Chromium startup `socket() failed: Operation not permitted`, including a permitted escalation attempt. The separate cloud browser could not reach the local preview. No after screenshot, browser acceptance, live RLS or production verification is claimed from these attempts. Review actual final-head CI logs and generated viewport screenshots before release; source review and a green build do not establish visual equivalence or live correctness.

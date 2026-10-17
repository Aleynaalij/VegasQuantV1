# Integration and acceptance

A handoff is accepted only when the receiver posts an ACK referencing the handoff URL. Record that URL in tasks.json. A peer ACK confirms receipt/review ownership, never owner authorization or proof of correctness.

Before merge:
- Fetch latest main and issue #65; confirm file claims, schema contracts and dependency status.
- Record the receiving peer ACK and review outcome. Resolve review findings in the task branch.
- Confirm relevant checks passed for the actual current PR head: existing CI covers tests, typecheck, production build and browser smoke.
- Re-run affected checks after conflict resolution or substantive changes.
- Confirm authorization for the action. Finish any proposal before asking the owner for a required approval.

After merge/deployment:
- Record the actual merged commit and deployment URL. A preview is not production.
- Verify the complete user flow with the deployed frontend, API permissions and actual stored data. Test missing-data and denied-access behavior where applicable.
- Record UTC verification time, result, sources/logs/screenshots and material limitations, redacting secrets and private member data.
- Mark verified only after passing live evidence exists. Build success and empty fixture tests are not live data verification.
- For a failure, record the symptom and safe rollback or fix plan; do not mark the feature finished.

Documentation-only work may close as complete with a commit/issue evidence link and no invented deployment or live check. Application and service work ends at verified; merged and deployed remain intermediate states.

## Current NBA integration acceptance
- Collector: actual recent successful NBA run and real NBA games/observations; no inference from deployment status alone.
- UI: deployed NBA board shows those real rows; season phase, scores and timestamps match sources.
- Access: schedule is public as designed; member observations remain protected by existing membership/age controls.
- Preserve NFL gates, research exemptions, records and provider-credit settings. Do not enable props to make the test look populated.

## Enforcement boundary
The coordination validator checks declared state, required evidence fields, dependencies, cycles, ownership overlap and board consistency. It cannot authenticate a comment's author-as-agent, inspect every test result, grant approval, or establish that a linked live result is true. Peer review and the owner's authorization remain necessary. The workflow produces a GitHub status check; it is not a mandatory merge gate unless an owner configures branch protection to require it. No branch protections or automatic merging are changed here.

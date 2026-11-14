# Operation Blackbox · isolated validation

The staging database ledger stores deterministic NBA investigation proposals and a versioned audit history. The Director ranks the retained proposals by priority and evidence confidence and flags assignments awaiting acknowledgment for 24 hours. The Control Center adds searchable recent history and an executive summary to Admin Operations. The existing publication and incident panels remain the source for evidence links. Missing or contradictory evidence stays open for investigation. November 12 remains unresolved.

## Security contract

The staging endpoint checks the Vercel preview runtime, explicit enablement and exact validation project URL before authenticating or contacting the database. The database independently requires AAL2 and a UUID allowlist. Administrator, reviewer, Codex and Claude are distinct staging roles. Unassigned agents cannot list or mutate others' tasks. Ownership begins on acknowledgment. A reviewer cannot approve their own submission or an assignment they made. A rejection blocks the task for human follow-up.

The transactional RPC locks each task, rejects stale versions, and appends events with server-derived actor and timestamp. The request key is unique per actor. An exact retry returns its recorded version. Client roles cannot edit ledger tables or change role membership. The function has an explicit search path and narrow execute grant. The database owner remains a trusted maintenance principal. Export and independently retain audit digests before a production release.

There are no production credentials, migrations, autonomous release hooks, or live evidence reads in this batch. The implementation accepts investigation review only. Production approvals need a separate, independently administered record binding SHA, scope, approver, rollback target, expiry and the deployment action.

## Validation and preview

Apply the standalone SQL only to project `apwndmcsjxzjxnpxfywo`. Generate fixture inserts using `node --import tsx scripts/operations/blackbox-seed.ts`. Review the output before applying. Run `blackbox-validate.sql` as a privileged staging test harness. Its role and JWT-claim simulation runs in a rolled-back transaction. Test genuine AAL2 sessions separately. Existing staging MFA administrators must be explicitly mapped to the Blackbox allowlist to see durable history. Keep billing and the live adapter disabled.

Before production consideration, complete real-session testing with distinct agent and reviewer credentials, add reviewed transition forms or a managed client, and define versioned memory records for confirmed root cause, fixes, tests, deployment and rollback references, recurrence and runbook suggestions. The current history search filters the latest 50 visible tasks and their evidence. It does not establish authoritative root cause or trigger any work.

## Rollout and rollback

Complete hosted exact-head CI, read-only preview acceptance and independent security review. Separately approve production identities, data retention, role separation and a restricted GitHub main ruleset requiring exact-head CI, code-owner review, stale-approval dismissal, resolved review threads and restricted human bypass. Review the production SQL and rollback target before any CEO exact-SHA authorization. Start disabled and verify production denial before separately authorizing activation.

For staging containment, set the ledger control to disabled and remove the preview enablement, then redeploy the protected preview. To withdraw the schema, export synthetic audit results if needed, revoke execute, drop the staging RPC and remove the staging schema under an isolated rollback change. No production rollback is required for this batch.

## Phase 2 staging candidate

The phase 2 SQL moves the original command function into the private schema and exposes a guarded wrapper. The wrapper commits independent approval and structured organizational memory atomically. Existing task versions and history remain intact. The latest visible tasks support search across historical decisions and structured outcomes. Root cause, fix, tests, deployment, rollback and reviewed runbook references are optional. Use them only when the independent reviewer has evidence. Recurrence is counted within the latest visible tasks, and recommendations use category preference and current visible workload. The summary includes open, completed, blocked and overdue acknowledgment counts.

Administrators can use the embedded controls. Dedicated staging agents and reviewers can open `/admin/operations/blackbox` with their own MFA session. The database remains the transition authority. The separate staging route exposes no support tickets and returns 404 outside the enabled isolated preview. An existing authenticated reviewer can record a reasoned rejection. Acceptance captures a structured outcome in the same transaction as the approval event. A replay must match both the original action and outcome.

For emergency containment, set `blackbox.control.enabled=false` in staging before withdrawing the preview. Preserve the phase 2 audit and memory tables for readback. The phase 1 preview can be restored by reverting the phase 2 wrapper signature and moving the original private command back into public after revoking wrapper execution. Keep the ledger disabled during rollback and verify privilege grants before re-enabling. Use independently retained audit digests and a human-approved retention policy before production. The database owner remains trusted.

### Main governance proposal

Target only `refs/heads/main`. Require pull requests, two approvals including code-owner review, review of the latest push by a different actor, dismissal of stale approvals, resolved conversations and up-to-date required checks. Require `verify` and `ui-smoke` from Verify Vegas Quant. Promote the path-filtered Operations and coordination checks to required checks only after an always-reporting aggregator is deployed and its exact contexts and App IDs are verified. Block force-push and deletion. Keep bypass empty by default and use a named human emergency role only if the CEO approves it. Validate in a disposable branch or supported evaluation mode before activation. CEO approval must independently bind the exact production commit, scope and rollback deployment. A task review is investigation approval only.

Review and release the stacked changes in dependency order #282, #283, then Phase 2. Recheck CI after each base changes. November 12 remains unresolved.

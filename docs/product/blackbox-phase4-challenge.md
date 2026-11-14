# Blackbox Phase 4 · technical challenge of the dry-run design (#287)

Reviewer input from Claude for the foundation-hardening directive. Engineering input only: not an independent human security sign-off, and it authorizes nothing.

- Reviewed: PR #287 at `4d8e2f259`, stacked on the frozen Phase 3 head `aab670c4812991e2daed8b9d7633d95d533cb804`.
- Method: read the full diff (9 files, 508 lines); loaded `blackbox-phase4.sql` on top of the six earlier scripts in local PGlite and probed it with synthetic identities. No hosted database, branch or setting was touched.
- Companion: `tests/sql/blackbox-remediation-acceptance.mjs`, an executable acceptance contract for remediation workstreams 1–5. It fails 17 of 17 checks against the current stack, by design.

## 1. What #287 is

A staging-only dry run. One function, `public.blackbox_execution`, moves a package through `proposed → authorized → acknowledged → submitted → approved | rejected | revoked`. Evidence is a fixed synthetic object the agent submits; the reviewer approves its SHA-256 digest. No adapter executes anything. Its review note says so plainly, and says trusted code provenance is out of scope.

That framing is right for a dry run. The findings below are about what must change before the same structure carries real execution.

## 2. What holds up

- It inherits the session, MFA, allowlist and emergency-switch checks. With the switch off, `list` is denied (probe Q7).
- A package can only be proposed from an independently approved task outcome.
- The reviewer approves an exact evidence digest, the digest is recomputed at approval, and approval is refused more than 24 hours after submission.
- Exact retries are idempotent and a changed retry is refused. The lock order (actor/request lock, then package row) is consistent.
- The approver must differ from the agent and from the planner.
- A second route flag, `VQ_BLACKBOX_EXECUTION`, gates the endpoint separately from the ledger.

## 3. Findings

All reproduced locally at `4d8e2f259` unless marked "by reading".

| ID  | Finding                                                                                                                                                                                                                                                             | Evidence                                                                                | Maps to                         | Required change                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **The authorizer can approve.** Independence is checked against two columns (`agent`, `planner`), not against the event history. An administrator who authorized a package and later holds the reviewer role can approve it.                                        | Q2: accepted, state `approved`.                                                         | Self-approval                   | Derive independence from `execution_events`, as `blackbox_stage` does: the approver must have no `propose`, `authorize`, `acknowledge` or `submit` event on the package.                                  |
| C2  | **An approved package cannot be withdrawn.** `revoke` is valid from `authorized`, `acknowledged` and `submitted` only. `approved` is terminal, never expires and is never consumed.                                                                                 | Q3b: `42501 Action denied`. `execution_packages` has no expiry or consumed column (Q4). | Approval replay, revocation     | Approval must carry `expires_at` and `consumed_at`, be revocable until consumed, and be consumed in the same transaction as the action it authorizes.                                                     |
| C3  | **Any number of packages can exist for one outcome,** each independently approvable.                                                                                                                                                                                | Q1: a second package for the same outcome reached `submitted`; both were then approved. | Approval replay                 | One open package per `(task, outcome)`. Superseding one voids the other.                                                                                                                                  |
| C4  | **The package is not content-addressed.** There is a digest of the evidence but none of the specification. No base commit, allowed paths, branch namespace, command list, expiry or size limit. `approvals` is a descriptive list of strings that nothing enforces. | Q4 columns; `blackbox-phase4.sql:72-80`.                                                | Scope escalation, stale commits | A `package_digest` over a canonical specification that includes those fields. Authorization and approval bind to it. Any edit is a new package.                                                           |
| C5  | **Evidence is asserted by the agent.** `commit`, `ciHead`, `unit`, `build` and `ci` are fields in the agent's own payload. The function checks that they equal fixed fixture values.                                                                                | `blackbox-phase4.sql:99-112`. Acknowledged in the review note.                          | Unverified test evidence        | Before any real adapter: Blackbox fetches the commit, the changed paths and the check runs from GitHub by SHA and expected App ID, and stores what it fetched. The agent supplies a SHA and nothing else. |
| C6  | **A package can be built on an outcome judged ineffective.** `propose` checks that the outcome was approved, not its standing.                                                                                                                                      | Q5: accepted after a "verified ineffective" review.                                     | (V7)                            | Depends on workstream 5. `propose` must require standing `current`.                                                                                                                                       |
| C7  | **Packages make an agent harder to disable.** `execution_packages.agent` references `principals` with no delete rule.                                                                                                                                               | Q6: `23503` on `execution_packages_agent_fkey`.                                         | Compromised credentials (V2)    | Depends on workstream 2. Suspension must revoke that agent's open packages in the same transaction.                                                                                                       |
| C8  | **Events do not record the role held at the time.** `blackbox.events` stores `role`; `execution_events` does not. After a role change the record no longer shows in what capacity someone acted.                                                                    | Q4 columns.                                                                             | Audit integrity                 | Add `role` and the credential identifier.                                                                                                                                                                 |
| C9  | **Refused attempts leave no trace.** Every denial raises and rolls back.                                                                                                                                                                                            | By reading.                                                                             | Audit integrity                 | Record denials through a path that survives the rollback, or in the route.                                                                                                                                |
| C10 | **Authentication is a full page read.** `blackbox_execution` calls `intelligence_before_stability('page', …)` to learn the caller's role: the fourth use of that pattern.                                                                                           | `blackbox-phase4.sql:44`.                                                               | (V9)                            | `blackbox.require_actor()` first.                                                                                                                                                                         |
| C11 | **Listing is capped at 25 in UUID order with no paging.** Packages beyond that are invisible to every role.                                                                                                                                                         | `blackbox-phase4.sql:50-51`.                                                            | (R5)                            | Keyset paging by a time-ordered key.                                                                                                                                                                      |
| C12 | **The new tables are outside the audit manifest.**                                                                                                                                                                                                                  | Acknowledged in the review note.                                                        | (V3)                            | Depends on workstream 3.                                                                                                                                                                                  |

## 4. The nine risks against #287

| Risk                           | Status in #287                        | Gap                                                                |
| ------------------------------ | ------------------------------------- | ------------------------------------------------------------------ |
| Agent impersonation            | Same human-style login as Phases 1–3. | No machine identity (workstream 7).                                |
| Unauthorized repository writes | Nothing writes.                       | No scope in the package to restrict a future write (C4).           |
| Self-approval                  | Agent and planner excluded.           | Authorizer not excluded (C1).                                      |
| Unverified test evidence       | Digest-bound, 24-hour freshness.      | Evidence is the agent's own claim (C5).                            |
| Stale commits                  | Not applicable: fixed fixture commit. | No base or head SHA in the package (C4).                           |
| Approval replay                | Version check and idempotent retries. | Approval is permanent and unconsumed; duplicates allowed (C2, C3). |
| Scope escalation               | Fixed `components` fixture.           | Nothing enforced (C4).                                             |
| Compromised agent credentials  | Revoke until submission.              | No per-agent disable; package blocks removal (C7).                 |
| Unsafe rollback                | "Discard dry-run workspace".          | No recorded rollback target.                                       |

## 5. What I need from the written Phase 4 architecture

Workstream 6 calls for a written architecture before live adapters. To challenge it properly it should state, exactly:

1. The canonical form and digest of an execution package, field by field.
2. What an approval binds to, when it expires, and the transaction in which it is consumed.
3. Which principal types may perform each action, and how independence is computed.
4. For each evidence item: who fetches it, from which API, keyed by what, and what is stored.
5. The GitHub App permissions for each agent, and the branch namespace each may write to.
6. What suspension of an agent does to its open packages, tokens and tasks.
7. What happens when the emergency switch is turned off mid-execution.
8. The failure and rollback path for each state, including a failed fetch from GitHub.

## 6. Recommendation on #287

Keep it as a dry run. Do not attach a real adapter to this function. C1, C2, C3 and C8 are small and worth fixing in the remediation branch now, because the same table shapes will be reused. C4 and C5 are the design work, and belong in the written architecture.

## Appendix · probe results

Local PGlite, scripts at `4d8e2f259`, synthetic identities only.

| Probe | Action                                                             | Result                                                                                                   |
| ----- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Q1    | Second package for the same reviewed outcome                       | Reached `submitted`                                                                                      |
| Q2    | Authorizing administrator, later a reviewer, approves that package | `approved`                                                                                               |
| Q3b   | Administrator revokes an approved package                          | `42501 Action denied`                                                                                    |
| Q4    | Columns of `execution_events`                                      | `package_id, version, actor, action, request, payload, recorded_at`                                      |
| Q4    | Columns of `execution_packages`                                    | `id, task_id, outcome_version, agent, planner, specification, state, version, evidence, evidence_digest` |
| Q5    | Propose from an outcome marked "verified ineffective"              | Accepted                                                                                                 |
| Q6    | Delete an agent that has packages                                  | `23503` on `execution_packages_agent_fkey`                                                               |
| Q7    | `list` with the emergency switch off                               | `42501 Access denied`                                                                                    |

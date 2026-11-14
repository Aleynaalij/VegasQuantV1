# VQ-AP-003 · Task coordination

## First review batch

Build #2 at `97f76928ee62` supplies the publication assessments, incident proposals, and private Operations list response. The existing authenticated user bearer and Operations RPC enforce administrator access and MFA. Build #3 adds an optional preview-only response field after that gate. It consumes synthetic assessments, produces deterministic investigation drafts, and replays a synthetic escalation history. The task panel has no mutation controls or endpoints. November 12 remains an unresolved investigation.

The existing [agent protocol](../agents/README.md), [task board](../agents/TASKS.md), issue #65, and task PRs already carry claims, explicit handoffs, test evidence, and review. Keep those channels during development. A common GitHub account and actor prefixes cannot authenticate separate agents. Treat the board as a coordination record and PR links as evidence, with human approval recorded independently.

## Director and ownership

| Principal | Proposed authority |
| --- | --- |
| Director | Draft, deduplicate, prioritize, and recommend an agent. Summarize evidence and flag blocked work. |
| Codex and Claude | Acknowledge only their own assigned work, report blockers, and submit evidence as the acknowledged owner. |
| MFA administrator | Assign, approve a handoff, and accept investigation evidence after independent review. |
| CEO | Approve an exact production change, including its scope, SHA, and rollback. |

Assignments await acknowledgment. The assignee becomes owner only after acknowledgment. A blocked owner retains ownership until an administrator records a handoff, at which point the replacement must acknowledge. Submission moves work to independent review. Completion records acceptance of investigation evidence and confers zero production authority. The P1/P2 recommendation follows incident severity. Codex is recommended for publication verification and Claude for record reconciliation in the fixture demonstration. These are sample routing defaults and do not reflect live workload.

Task IDs are scoped to content type, Eastern slate, and investigation category. Related symptoms are grouped and a higher-severity source proposal takes precedence. Missing evidence and contradictions remain investigation inputs. Preserve both observations and competing hypotheses when the durable system is implemented. Any future model receives bounded evidence and produces a draft with explicit evidence references. Deterministic policy controls validation, transitions, and approval.

## Durable history design

A later isolated batch should use a unique task identity, evidence revision, and append-only event stream. Atomically check the task version, authenticated actor, assigned owner, transition, reviewer independence, and idempotency key before appending an event and updating the queue projection. Assign timestamps and ordering server-side. Reject replay, stale writes, and self-review even when a principal holds multiple roles. Separate runtime identities per agent are a prerequisite. Use read-only views and narrowly scoped commands. The fixture replay only tests role rules and ordering over trusted synthetic events.

Record source classification and revision, approved task scope, verified findings or unresolved hypotheses, fix commit, exact test and deployment references, and rollback outcomes. Link runbook proposals to reviewed findings. Restrict evidence to approved readers, redact operational secrets and personal data, and store digests with evidence references. Keep retention and correction policy under administrator control. Corrections append new events with provenance. A model can suggest a runbook revision for human review.

## Proposed GitHub rules for main

Require PRs, two independent approvals including a human code owner for Admin Operations, authorization, and workflows, review of the latest push by someone other than the pusher, dismissal of stale approvals, and resolution of review threads. Require an up-to-date base or a merge queue. Require exact-head Verify Vegas Quant tests, typecheck, build and UI smoke, Admin Operations acceptance, and the agent coordination contract. Before enforcing, make path-filtered checks report through an always-run required aggregator and verify check context names and GitHub App provenance. Block force pushes and deletions, restrict bypass to the designated human emergency role, and record separate CEO release approval. Validate repository plan and ruleset support before enabling. This batch grants no identities or permissions and installs no ruleset.

## Rollback and follow-up

Retire the branch preview and close the draft PR to withdraw the batch. An approved follow-up can revert the isolated commit. No schema or data rollback is needed. Keep the live publication adapter disabled. Durable persistence, agent authentication, an independently reviewed access policy, and live coordination are later approvals. Require genuine staging MFA access and member/pre-MFA denial before considering release.

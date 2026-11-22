# Blackbox · independent architecture review, Phase 4 recommendations and Phase 5 proposal

Prepared by Claude as parallel architecture and quality-assurance input while Codex builds Phase 4. This is engineering input. It is not the independent human security sign-off, and it authorizes nothing.

- Stack reviewed: PRs #282 → #283 → #284 → #285 → #286, at Phase 3 head `aab670c4812991e2daed8b9d7633d95d533cb804`.
- Nothing in the Blackbox branches was modified. No merge, deploy, database change, permission grant or live coordination was performed.

## 0. Scope, method and limits

**What was done**

- Read every changed file in the stack (38 files, about 2,950 added lines): the six SQL scripts, the API route, both engines, the UI, the integrity signer, the tests and the five design documents.
- Ran the stack's own tests at the Phase 3 head in a scratch checkout: 13 of 13 pass (`tests/blackbox.test.ts`, `tests/blackbox-intelligence.test.ts`, `tests/autopilot-tasks.test.ts`, `tests/operations-support.test.ts`).
- Loaded the six SQL scripts into a local in-memory Postgres (PGlite) and ran targeted probes. Every finding marked **Verified** below was either reproduced by a probe or is directly visible in the cited file.
- Read GitHub's public metadata for `main` and the five PRs.

**What was not done, and why it matters**

- **No written Phase 4 design exists in the repository, the PRs or issue #65.** Section 3 therefore reviews the architecture as the directive describes it (execution packages, agent adapters, evidence verification, approval controls), against what Phases 1–3 actually provide. Codex should treat section 3 as requirements to design against, and I should re-review once a design document or branch exists.
- **The hosted staging project was not inspected.** The SQL is applied by hand from `scripts/operations/`. I verified the scripts, not what is installed. Drift between the two is itself finding R6.
- **Production was not queried.** I did not check whether any Blackbox object exists in production.
- **GitHub settings were read without authentication.** "No ruleset" means none is visible through the public API.
- PGlite runs as a superuser and has no real Supabase Auth. Session, MFA and privilege behavior on the hosted platform still needs the real-session test the release review already calls for.

## 1. Architecture audit

### 1.1 How the system works today

- **Ledger.** `blackbox.tasks` holds one row per investigation with a `version` counter. `blackbox.events` holds one row per accepted command, keyed `(task_id, version)`. `blackbox.memory` holds the structured outcome attached to an approval event.
- **Commands.** One function, `public.blackbox_stage`, accepts `assign`, `handoff`, `acknowledge`, `escalate`, `submit`, `approve`, `reject` and `list`. It locks the task row, checks the caller's role and the expected version, and appends the event in the same transaction.
- **Identity.** Callers are Supabase users. The function requires an MFA session (`aal2`), a live row in `auth.sessions`, and membership in `blackbox.principals` with one of four roles: `admin`, `reviewer`, `codex`, `claude`.
- **Phase 3.** `public.blackbox_intelligence` adds paging, dependency edges, improvement reviews and saved briefings. Ranking and recommendations are computed in the browser from one 25-task page.
- **Containment.** A single row, `blackbox.control.enabled`, turns every read and write off. The HTTP route only exists on a Vercel preview pointed at the staging project.
- **Audit custody.** An exporter script snapshots the ledger and a signer produces an HMAC manifest held outside the database.

### 1.2 What is sound

These hold up under reading and under the probes, and Phase 4 should keep them.

- Every state change goes through one transactional function with a row lock, an expected-version check and a server-derived actor and timestamp. Client roles have no table access.
- Retries are idempotent: the request key is unique per actor, an exact retry returns the recorded version, and a retry with different content is refused.
- Agents can only see and act on tasks assigned to them. Ownership starts at acknowledgment.
- A reviewer cannot approve a task they assigned, acknowledged or submitted. The check survives a later role change because it reads the event history.
- Revoked sessions are refused, and the emergency switch denies even an eligible administrator (probe P5).
- The route fails closed outside the isolated preview and never uses a service-role key.
- The documents are candid about limits: the owner is trusted, counts are visible-window counts, and task approval confers no production authority.

### 1.3 Verified defects

Each was reproduced locally at `aab670c` or is directly visible in the cited file.

| ID  | Area                         | Finding                                                                                                                                                                                                                                                                                                                                       | Evidence                                                                                                                                                                                                    | Recommendation                                                                                                                                                                                                                                                                                    |
| --- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | Task lifecycle               | **A task that is assigned, in progress or in review cannot be recovered by anyone.** `handoff` is accepted only from `blocked`, and `assign` only from `proposed`. If the agent never acknowledges, stops responding, or is removed, the task is stuck permanently.                                                                           | Probe P2: admin `handoff` and re-`assign` of an assigned task, and `handoff` and `escalate` of an in-progress task, all return `Transition denied`. Probe P3e: the same after the owning agent was deleted. | Add an administrator `reclaim` command, valid from `assigned`, `in_progress` and `in_review`, that moves the task to `blocked`, clears ownership, requires a reason and appends an event.                                                                                                         |
| V2  | Identity, emergency disable  | **One identity cannot be cleanly disabled.** `principals` has no suspended state and no history. Deleting a principal fails once a capability profile references it, either as the agent or as the verifier. If the delete succeeds, the task stays owned by the removed identity (then V1 applies).                                          | Probe P3a and P3b: foreign-key errors on `agent_profiles_principal_fkey` and `agent_profiles_verified_by_fkey`. Probe P3d: task still `in_progress` with an assignee.                                       | Replace delete with `status in ('active','suspended','revoked')` checked by every command, plus an append-only `principal_events` table (who, when, why, old and new role). Suspension should reclaim that principal's open tasks in the same transaction.                                        |
| V3  | Audit integrity              | **The audit snapshot covers three of nine tables.** `blackbox-snapshot.sql` exports `tasks`, `events` and `memory` only. Role membership, the emergency switch, dependency edits, improvement reviews, briefings and capability profiles are outside the signed manifest.                                                                     | Probe P6 and `scripts/operations/blackbox-snapshot.sql`.                                                                                                                                                    | Extend the snapshot and manifest to every table, with a manifest schema version. Until then the manifest must not be described as covering "the ledger".                                                                                                                                          |
| V4  | Approval enforcement, memory | **Effectiveness verdicts are not independent.** The reviewer who approved an outcome can mark that same outcome "verified effective". Any other reviewer can then append a contradicting verdict, and reporting silently uses whichever is latest.                                                                                            | Probe P1 (approver's own review accepted). Probe P7 (reporting flipped to "verified ineffective" after a second reviewer's entry).                                                                          | Exclude the outcome's approver from rating it. Require a typed evidence reference for either "verified" value. Report disagreement as disagreement instead of last-writer-wins.                                                                                                                   |
| V5  | Emergency disable            | **The emergency switch leaves no record.** `blackbox.control` has two columns, `singleton` and `enabled`. There is no actor, time or reason, no event, and it can only be flipped by direct SQL as the database owner.                                                                                                                        | Probe P5c.                                                                                                                                                                                                  | Add `control_events` (actor, time, reason, new value) written by a dedicated function. Keep the owner path as break-glass, and include the table in the snapshot.                                                                                                                                 |
| V6  | Evidence provenance          | **Saved briefings claim a policy the scoring engine does not carry.** The engine labels its output `phase3-v1`. The database stamps briefings `phase3-v2`. Scores are computed in the browser and are not stored, so a briefing cannot be reproduced.                                                                                         | `src/lib/blackbox-intelligence.ts:4`, `scripts/operations/blackbox-phase3.sql:175`.                                                                                                                         | One policy identifier from one source. Persist the scored inputs and factor values with each briefing, or do not stamp a policy.                                                                                                                                                                  |
| V7  | Organizational memory        | **An outcome judged ineffective still counts as good.** The dependency trigger only checks that a memory row exists. The engine's `reviewed()` never reads improvement reviews. A "verified ineffective" outcome still unblocks dependents and still counts as reviewed precedent.                                                            | `blackbox-phase3.sql:58-63`, `blackbox-intelligence.ts:43-58`.                                                                                                                                              | Give outcomes a standing (`current`, `superseded`, `ineffective`) derived from reviews, and have the trigger and the engine honor it.                                                                                                                                                             |
| V8  | Audit integrity              | **Nothing inside the database prevents or records a rewrite of history.** There are no triggers on `events` or `memory`. The owner can update an event with no trace.                                                                                                                                                                         | Probe P4: zero triggers; an owner `update` of event evidence succeeded silently.                                                                                                                            | The documents accept this ("the database owner remains trusted") and rely on external manifests. That is acceptable for staging. For production, add append-only triggers that also block the owner's ordinary role, and a per-task hash chain so a rewrite is detectable from the ledger itself. |
| V9  | Complexity, performance      | **Authentication is copied in three places, and one wrapper authenticates by running a full page query.** The session and MFA check appears in `blackbox-active-session.sql`, `blackbox-phase3.sql` and `blackbox-phase3-review-fix.sql`. The stability wrapper calls the `page` action before every other action to learn the caller's role. | `blackbox-phase3-stability.sql:19` (probe P8).                                                                                                                                                              | One `blackbox.require_actor()` returning actor, role and session, called by every entry point. The three copies will drift, and the page-per-write cost grows with the ledger.                                                                                                                    |
| V10 | Task lifecycle               | **There is no command that creates a task.** Tasks enter through owner-run `insert` statements generated by `blackbox-seed.ts`. `proposal` is unvalidated JSON at the database.                                                                                                                                                               | `blackbox-seed.ts`, `blackbox-staging.sql:11-21`.                                                                                                                                                           | Phase 4 needs an authenticated, validated, idempotent `propose` command with a recorded source. Otherwise the first step of every lifecycle stays outside the audit trail.                                                                                                                        |
| V11 | GitHub governance            | **None of the proposed repository controls exist, and they cannot be satisfied today.** `main` is unprotected, no ruleset or CODEOWNERS file is visible, and every commit in all five PRs is authored by the single account `Aleynaalij`. A rule requiring two approvals from distinct actors has no second actor.                            | Public API: `branches/main` → `protected: false`; `rulesets` → empty; PR commit authors.                                                                                                                    | See section 3.3. This is the precondition for Phase 4, because Phase 4 is where agents start writing to the repository.                                                                                                                                                                           |

### 1.4 Potential risks (not demonstrated as failures)

| ID  | Area                 | Risk                                                                                                                                                                                                                                                                                                                        | Why it matters                                                                                                                     | Recommendation                                                                                                               |
| --- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| R1  | Agent identity       | An "agent" is a Supabase user with a TOTP factor, reached through a same-origin browser route. For a non-human, MFA is a second stored secret, not a second factor.                                                                                                                                                         | The database cannot tell an agent acting from a human operating the agent's account. Phase 4 adapters cannot use this path at all. | Machine identities for agents (section 3.2). Keep MFA for humans only.                                                       |
| R2  | Evidence provenance  | Evidence is free text up to 1,500 characters. Nothing is typed, hashed or checked. Outcomes are read back with the fixed label "independent synthetic review".                                                                                                                                                              | Phase 4 "evidence verification" has nothing to verify against.                                                                     | A typed `evidence_refs` table (section 5).                                                                                   |
| R3  | Audit integrity      | Manifests are HMAC with one shared key, over exact snapshots. Anyone who can verify can also forge. Changes made before a capture are invisible.                                                                                                                                                                            | Custody depends entirely on who holds the key and how often captures run.                                                          | Asymmetric signatures, scheduled captures, and the hash chain from V8.                                                       |
| R4  | Task lifecycle       | A rejection or escalation forces handoff to a _different_ agent. With two agents this is a ping-pong. `completed` is terminal, with no reopen or supersede.                                                                                                                                                                 | Awkward at two agents, and V7 has no lifecycle to attach to.                                                                       | Allow return to the same agent after rejection. Add `supersede`.                                                             |
| R5  | Scalability          | Paging is by task ID, not priority. Ranking, recurrence and workload are computed over one 25-task page. Reporting aggregates scan every improvement review on each admin page load. Each briefing stores every task, and the latest briefing is returned with every page. One global lock serializes all dependency edits. | Fine at staging size. Recommendations become wrong, not just slow, once the ledger exceeds a page.                                 | Move ranking to the server over indexed projections. Store briefing tasks as rows. Return briefing metadata, not the body.   |
| R6  | Change control       | The SQL lives in `scripts/operations/`, is applied by hand in a fixed order, and renames functions between steps (`blackbox_stage` → `stage_with_memory` → inner). Nothing records what is installed.                                                                                                                       | What reviewers approve and what runs can differ without anyone noticing.                                                           | Numbered migrations with a recorded checksum, and a read-only "installed versus repository" check in CI.                     |
| R7  | Platform coupling    | The session check reads `auth.sessions` with a row lock and reads `private.account_erasure_jobs`.                                                                                                                                                                                                                           | A Supabase Auth schema change or a privilege change breaks every command, closed. Failing closed is correct, but it is an outage.  | A scheduled canary that calls `list` with a known-good session.                                                              |
| R8  | API surface          | The route has no rate limit.                                                                                                                                                                                                                                                                                                | Low while the allowlist is four identities.                                                                                        | Per-principal limits before agents call it unattended.                                                                       |
| R9  | Data lifecycle       | `principals.id` references `auth.users` with no delete rule.                                                                                                                                                                                                                                                                | Account erasure of an enrolled user fails.                                                                                         | Decide deliberately: block erasure for enrolled principals, or revoke first.                                                 |
| R10 | Approval enforcement | Independence is enforced between _accounts_. Nothing records which human controls which account.                                                                                                                                                                                                                            | One person holding the admin and reviewer accounts passes every check.                                                             | An enrollment record binding each principal to a named human or a named machine, reviewed by the independent human reviewer. |

### 1.5 Simplifications

1. **One actor check** used by every entry point (V9).
2. **One command function per concern, in versioned migrations**, replacing the rename chain (R6).
3. **Merge `list` and `page`.** Two read paths with different ordering and limits already disagree about what "visible" means.
4. **Typed evidence references instead of prose** (R2). This removes the need for the hard-coded "verification" label.
5. **Server-side scoring with stored inputs** (V6, R5). The browser should render recommendations, not derive them.

## 2. Prioritized security risks

Ordered by what would hurt most if Phase 4 shipped on the current base.

| Rank | Risk                                                                                                                      | Refs    | Severity for Phase 4                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------- |
| 1    | Repository has no branch protection, no code owners and one shared GitHub account, while Phase 4 introduces agent writes. | V11     | Blocking                                  |
| 2    | Agents have no machine identity. The only credential model is a human-style login.                                        | R1      | Blocking                                  |
| 3    | A compromised or stuck agent cannot be disabled individually, and its tasks cannot be reclaimed.                          | V1, V2  | Blocking                                  |
| 4    | Evidence is unverifiable free text.                                                                                       | R2, V10 | Blocking for "evidence verification"      |
| 5    | Audit coverage excludes permissions, the kill switch and effectiveness verdicts.                                          | V3, V5  | High                                      |
| 6    | History can be rewritten inside the database with no trace.                                                               | V8, R3  | High for production, accepted for staging |
| 7    | Effectiveness verdicts are self-assessable and last-writer-wins.                                                          | V4, V7  | High for Phase 5, which learns from them  |
| 8    | Installed SQL can drift from reviewed SQL.                                                                                | R6      | High                                      |
| 9    | Approver independence is per account, not per person.                                                                     | R10     | Medium                                    |
| 10   | Recommendations degrade silently beyond one page.                                                                         | R5, V6  | Medium                                    |

## 3. Phase 4 · Supervised Engineering Execution

No design document was available (section 0). These are the controls I would require of any design, organized by the nine risks the directive names.

### 3.1 The core rule

**An approval must be bound to an exact, immutable thing, and must be usable once.** Today an approval is bound to a task version and free text. That is adequate for "this investigation's conclusion is accepted". It is not adequate for "this change may be made".

Define an **execution package** as an immutable, content-addressed record:

- `task_id` and `task_version` it was derived from
- repository, `base_sha`, and the branch namespace the agent may write to
- `allowed_paths` and `forbidden_paths`
- allowed commands, and a maximum diff size
- required evidence (which checks must pass, on which commit)
- expiry time
- `package_digest`: SHA-256 over the canonical form of all of the above

Any change to a package is a new package with a new digest. Approvals reference the digest.

### 3.2 Controls by risk

| Risk                               | Required control                                                                                                                                                                                                                                                                                                                                                 | How to test it                                                                                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Agent impersonation**            | One GitHub App per agent, not a shared user. Blackbox maps the App's installation ID to a principal. Agents authenticate to Blackbox with a short-lived signed assertion, not a stored session. Every event records the credential ID used.                                                                                                                      | An assertion signed by agent A's key presented as agent B is refused. A human session cannot perform agent-only actions.                         |
| **Unauthorized repository writes** | App permissions limited to contents and pull requests. Ruleset restricts each App to `agent/<name>/**`. No agent can push to `main`, a release branch or another agent's namespace. No agent has merge permission.                                                                                                                                               | Push to `main` and to the other agent's namespace is rejected by GitHub, not by Blackbox.                                                        |
| **Self-approval**                  | The approver must differ from the package author, the assigner, the executing agent and the last pusher. Approvers are humans only. Enforce in the database from event history, as Phase 1 already does for investigations, and again in the GitHub ruleset.                                                                                                     | Each of the four overlaps is refused. An agent principal calling `approve` is refused regardless of role changes.                                |
| **Unverified test evidence**       | Blackbox fetches check results from GitHub itself, by commit SHA and by the expected App ID and check name. It never accepts a pass claim from the agent. Store the check-run ID, conclusion, SHA and fetch time.                                                                                                                                                | An agent-submitted "tests passed" with no matching check run is refused. A check from an unexpected App ID is ignored.                           |
| **Stale commits**                  | Approval records `head_sha`. Any push after approval invalidates it. Merge requires `head_sha` to equal the approved SHA and the base to be current.                                                                                                                                                                                                             | Push one commit after approval; merge is refused until re-approved.                                                                              |
| **Approval replay**                | Approvals are single-use rows keyed `(package_digest, head_sha)` with an expiry and a `consumed_at`. Consumption and the action it authorizes happen in one transaction.                                                                                                                                                                                         | The same approval used twice is refused. An approval for package A presented with package B's digest is refused. An expired approval is refused. |
| **Scope escalation**               | Before review, Blackbox computes the diff's changed paths from GitHub and compares them to `allowed_paths`. A default denylist applies to every package: `.github/`, `supabase/migrations/`, `scripts/operations/`, authentication and billing code, and Blackbox's own tables and functions. Lifting a denylist entry needs a separate, human-authored package. | A diff touching a workflow file is rejected before a reviewer sees it. A package cannot widen its own paths.                                     |
| **Compromised agent credentials**  | No long-lived token is stored with an agent. Installation tokens are minted per package and expire within the hour. Per-principal suspension (V2) revokes immediately and reclaims open tasks. Secret scanning and push protection are on.                                                                                                                       | Suspend an agent mid-package: its next call fails, its token cannot be renewed, and its task is `blocked`.                                       |
| **Unsafe rollback**                | A rollback is its own package with a pre-recorded target SHA, verified to be an ancestor that previously passed checks. It is never automatic. Database migrations are out of scope for Phase 4 entirely.                                                                                                                                                        | A rollback to an unrecorded SHA is refused. A rollback still needs an independent human approval.                                                |

### 3.3 Preconditions (do these before any Phase 4 write path is enabled)

1. Fix V1, V2, V3 and V5. Phase 4 multiplies the cost of each.
2. Create separate machine identities for Codex and Claude, and at least two human accounts, so that "two distinct approvers" is achievable (V11).
3. Install the `main` ruleset already drafted in `operation-blackbox.md`, test it on a disposable branch, and add CODEOWNERS. The ruleset is the enforcement. Blackbox is the record.
4. Add the `propose` command (V10) and typed evidence (R2).
5. Move the SQL into checksummed migrations (R6).

### 3.4 Recommendations to Codex

- **P4-1.** Write the Phase 4 design as a document before code, with the package schema and the approval binding stated exactly. I will review it against section 3.2.
- **P4-2.** Keep the single-transaction pattern from `blackbox_stage`. Add packages and approvals as new tables and commands. Do not overload the existing seven actions.
- **P4-3.** Treat GitHub as the source of truth for commits, diffs and check results. Blackbox stores references and fetched facts, never agent claims.
- **P4-4.** Agent adapters should be thin: fetch package, work in the namespaced branch, open a draft PR, report the SHA. They hold no approval logic and no long-lived credential.
- **P4-5.** Every denial should be an event, not only an error. Refused attempts are the most useful security signal the ledger can hold.
- **P4-6.** Ship Phase 4 in the same two releases the release review defines: read-only display first, supervised actions second, each with its own exact-SHA approval.
- **P4-7.** Extract `blackbox.require_actor()` first (V9). Every new command will otherwise copy the session check a fourth time.

## 4. Phase 5 · Evidence-Driven Self-Improvement

### 4.1 Principles

1. **Measure only verified outcomes.** An input counts only if it has a typed evidence reference that Blackbox itself fetched or that an independent human confirmed.
2. **Propose, never apply.** Phase 5 produces proposals. A human approves each one. Applying it is a Phase 4 execution package like any other change.
3. **Everything is versioned and reversible.** A proposal names the version it changes and the version it reverts to.
4. **Protected domains are out of reach.** Phase 5 may not propose changes to security policy, approval requirements, agent permissions or production deployment controls. This is enforced by a database constraint on the proposal's target, not by convention.
5. **Deterministic first.** Metrics are computed by versioned SQL. Any model-generated text is stored as a draft with its inputs, and never as a measurement.

### 4.2 Capabilities

| #   | Capability                         | Design                                                                                                                                                                                                                                                                                                                                                                |
| --- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Engineering outcome measurement    | An `outcome_measurements` row per completed task or package: time to acknowledge, time in review, rejections before approval, checks failed before passing, whether a rollback followed within N days, whether the incident class recurred. Each value carries the evidence reference it was computed from and the metric definition version.                         |
| 2   | Recommendation effectiveness       | Record every recommendation the Director shows (`recommendation_log`: task, policy version, factors, recommended agent). Record what the human actually did. Effectiveness is the measured outcome of followed versus not-followed recommendations. This is the "recommendation acceptance" field Phase 3 reports as unavailable.                                     |
| 3   | Recurring incident analysis        | A server-side `incident_signature` (sport, content type, classification, source) computed at `propose`. Recurrence is counted over the whole ledger with an index, replacing the per-page count (R5). A recurrence after an outcome marked effective automatically opens a review of that outcome (V7).                                                               |
| 4   | Historical solution retrieval      | Retrieval over outcomes with standing `current` only, keyed by incident signature first and full-text second. Every retrieved item shows its evidence references, its effectiveness reviews and its age. Nothing superseded or ineffective is offered as precedent.                                                                                                   |
| 5   | Root-cause classification          | A versioned taxonomy table replacing the fixed six-value check constraint. Classification is assigned by a reviewer, not the approver (V4), with an evidence reference. Taxonomy changes are proposals. Reclassification appends, never overwrites.                                                                                                                   |
| 6   | Agent performance evaluation       | Per agent and per capability: measured outcomes from #1, normalized by task class. Reported with sample sizes and never below a minimum count. It informs routing recommendations only. It cannot change permissions or capability profiles, which stay human-verified records.                                                                                       |
| 7   | Runbook improvement proposals      | Runbooks become versioned records. A proposal references the outcomes and recurrences that motivate it, the exact text change, and the prior version to restore. Approved by a human who did not author the motivating outcomes.                                                                                                                                      |
| 8   | Policy-version comparison          | Scoring policy becomes a stored, versioned record (fixing V6). Any two versions can be replayed over the same recorded inputs to show how rankings would have differed. Replay is read-only and deterministic.                                                                                                                                                        |
| 9   | Controlled improvement experiments | An experiment names one non-protected parameter, a hypothesis, a metric from #1, a fixed duration, a minimum sample and a stop condition. The candidate runs in **shadow**: it produces recommendations that are logged and not shown. Promotion to live is a separate human-approved proposal. Any experiment can be ended immediately, restoring the prior version. |
| 10  | Executive performance reporting    | A saved, versioned report built only from stored measurements. Each figure links to its rows. It states sample sizes, the reporting window and what is unmeasured. It makes no claim about release readiness.                                                                                                                                                         |

### 4.3 The improvement loop

1. **Observe.** Verified outcomes and fetched evidence are written by Phases 1–4.
2. **Measure.** Scheduled, versioned SQL computes measurements. Each run is recorded with its inputs' high-water mark.
3. **Detect.** Deterministic rules flag recurrences, ineffective outcomes, and policies or runbooks associated with worse measurements.
4. **Propose.** A proposal is created with its evidence, target, change and revert target. Protected targets are rejected by constraint.
5. **Review.** An independent human approves, rejects or requests a shadow experiment.
6. **Apply.** Approved proposals become Phase 4 execution packages, or a version switch for policy and runbook records.
7. **Verify.** After a fixed window the same measurements are recomputed. The proposal is marked effective, ineffective or inconclusive, with evidence.
8. **Revert.** Any applied proposal can be reverted to its recorded prior version by one human-approved action.

### 4.4 What Phase 5 must never do

- Change `principals`, roles, capability profiles, the emergency switch, approval rules, reviewer-independence rules, the path denylist, GitHub rulesets or deployment settings.
- Apply its own proposals, or approve them.
- Rank or route on unverified or model-generated data.
- Report a metric without its sample size and definition version.

## 5. Data model recommendations

Fixes to the existing model come first because Phases 4 and 5 both build on them.

**Fix now**

| Table                    | Change                                                                                                                                                   | Fixes       |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `principals`             | Add `status`, `kind` (`human`, `machine`), `controlled_by` (enrollment record). Never delete.                                                            | V2, R1, R10 |
| `principal_events` (new) | Append-only: principal, actor, time, reason, old and new role and status.                                                                                | V2, V3      |
| `control_events` (new)   | Append-only: actor, time, reason, new value.                                                                                                             | V5          |
| `events`                 | Add `prev_digest` and `digest` (hash chain per task), `credential_id`. Append-only trigger. Record denials.                                              | V8, R3      |
| `evidence_refs` (new)    | `(task_id, version, kind, locator, sha256, fetched_by, fetched_at, verified)`. `kind` covers commit, check run, pull request, deployment, log, document. | R2          |
| `memory`                 | Add `standing` (`current`, `superseded`, `ineffective`) and `superseded_by`.                                                                             | V7, R4      |
| `improvement_reviews`    | Add `evidence_ref`. Constraint: actor differs from the outcome's approver. Keep all revisions and report disagreement.                                   | V4          |
| `policies` (new)         | `(name, version, definition, digest, created_by, approved_by)`. Briefings reference a policy row and store factor values.                                | V6          |

**Phase 4**

| Table                 | Purpose                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| `execution_packages`  | Immutable package as defined in 3.1, with `package_digest` unique.                                     |
| `package_approvals`   | `(package_digest, head_sha, approver, expires_at, consumed_at)`, unique on digest and SHA, single-use. |
| `executions`          | One row per run of a package: agent, credential, branch, resulting SHA, state.                         |
| `execution_evidence`  | Check runs and diffs fetched by Blackbox, linked to `evidence_refs`.                                   |
| `machine_credentials` | Public key or App installation per machine principal, with issue and revoke times. No secrets.         |

**Phase 5**

| Table                                      | Purpose                                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `metric_definitions`                       | Versioned SQL definition and description of each metric.                                                            |
| `measurement_runs`, `outcome_measurements` | Each run and each measured value, with evidence references and definition version.                                  |
| `recommendation_log`                       | What was recommended, under which policy version, and what the human did.                                           |
| `incident_signatures`                      | Normalized signature per task for recurrence and retrieval.                                                         |
| `root_cause_taxonomy`                      | Versioned taxonomy.                                                                                                 |
| `runbooks`, `runbook_versions`             | Versioned runbook text.                                                                                             |
| `improvement_proposals`                    | Target kind and version, change, evidence, revert target, state. Check constraint rejecting protected target kinds. |
| `experiments`, `experiment_observations`   | Shadow experiments and their logged results.                                                                        |
| `executive_reports`                        | Saved report revisions with the measurement runs they were built from.                                              |

All new tables follow the existing pattern: row-level security on, no grants to client roles, access only through session-checked functions, and inclusion in the audit snapshot.

## 6. Acceptance criteria

**Base fixes**

- An administrator can reclaim a task from `assigned`, `in_progress` and `in_review`; the event records who and why.
- Suspending a principal succeeds regardless of capability profiles, denies that principal's next call, and blocks its open tasks in the same transaction.
- The emergency switch records actor, time and reason; the record appears in the audit snapshot.
- The snapshot and manifest cover every Blackbox table; altering any row in any table after capture fails verification.
- The approver of an outcome cannot rate its effectiveness; two reviewers who disagree are both shown.
- An outcome marked ineffective no longer satisfies a dependency and is not offered as precedent.
- Engine and database report the same policy version, and a saved briefing reproduces its scores from stored inputs.

**Phase 4**

- Each of the nine tests in the right-hand column of 3.2 passes against real GitHub and real sessions in staging.
- No agent credential can push to `main`, merge, or write outside its namespace, demonstrated by GitHub refusing the attempt.
- An approval cannot be used twice, used after a push, used after expiry, or used for a different package.
- Every refused attempt appears in the ledger as an event.
- With the emergency switch off, no package can be created, approved or executed.

**Phase 5**

- Every reported figure links to stored measurements with a sample size and a definition version.
- A proposal targeting a protected domain is rejected by the database.
- No proposal can be approved by its author or by the approver of its motivating outcomes.
- Any applied proposal can be reverted to its recorded prior version in one approved action, and the revert is itself recorded.
- A shadow experiment changes nothing a user or agent sees until separately promoted.
- Replaying two policy versions over the same recorded inputs gives the same result every time.

## 7. Proposed implementation sequence

| Step | Work                                                                                                      | Depends on    |
| ---- | --------------------------------------------------------------------------------------------------------- | ------------- |
| 0    | GitHub: second human account, machine identities, `main` ruleset on a disposable branch, CODEOWNERS.      | CEO decisions |
| 1    | Base fixes: `require_actor()`, principal status and events, `reclaim`, control events, snapshot coverage. | —             |
| 2    | Checksummed migrations and an installed-versus-repository check.                                          | 1             |
| 3    | `propose` command, typed `evidence_refs`, event hash chain and append-only triggers.                      | 1             |
| 4    | Phase 4 design document, reviewed.                                                                        | 0–3 scoped    |
| 5    | Phase 4a: packages and approvals, read-only display.                                                      | 3, 4          |
| 6    | Phase 4b: agent adapters and supervised execution in staging, real-session acceptance.                    | 0, 5          |
| 7    | Independent human security review of 0–6.                                                                 | 6             |
| 8    | Phase 5a: policies as records, recommendation log, measurements, server-side recurrence.                  | 3             |
| 9    | Phase 5b: outcome standing, taxonomy, retrieval, agent evaluation, executive reports.                     | 8             |
| 10   | Phase 5c: proposals, shadow experiments, revert.                                                          | 6, 9          |

Steps 1–3 and 8 do not depend on Phase 4 and can proceed in parallel with it.

## 8. Risks and dependencies

- **People.** Independent review needs a second human with repository access. Until that exists, "two approvals" is unenforceable and every independence control reduces to one person. This is a CEO decision and the main dependency.
- **GitHub plan.** Rulesets, required reviewers and App restrictions depend on the repository plan. The repository is public, which helps for rulesets but means every design document and SQL script is readable by anyone. Keep identifiers and operational detail out of them.
- **Platform.** The session check depends on Supabase Auth internals (R7). Machine identity for agents needs a decision between GitHub App identity and a signed-assertion scheme, since Supabase MFA does not fit non-human callers.
- **Sample size.** Phase 5 learns from completed, verified outcomes. At current volume most metrics will be statistically meaningless for some time. Reports must say so, and experiments need minimum samples.
- **Scope creep.** Phase 5's value depends on Phase 4 producing typed, fetched evidence. If Phase 4 ships with prose evidence, Phase 5 has nothing trustworthy to measure.
- **Review load.** Stacked drafts (#282–#286) must land in order with re-verification after each base change. Adding the base fixes to the top of the stack increases that load; adding them as a parallel branch risks conflict with Phase 4.
- **Unverified areas.** Hosted staging state, production state and authenticated GitHub settings were not inspected (section 0).

## 9. Recommended division of work

| Area                                         | Codex                                                                    | Claude                                                                                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 4 design and implementation            | Owns: design document, packages, approvals, adapters, evidence fetching. | Reviews the design against 3.2 before code. Reviews each PR. Writes the adversarial tests (replay, stale commit, scope escalation, impersonation). |
| Base fixes (V1, V2, V3, V5, V9)              | Owns, because they change the functions Phase 4 extends.                 | Supplies failing tests first, from the probes in this review. Reviews.                                                                             |
| Evidence model and hash chain                | Implements.                                                              | Specifies the schema and canonical digest form. Verifies the chain independently.                                                                  |
| Migration discipline (R6)                    | Converts scripts to migrations.                                          | Builds the installed-versus-repository check.                                                                                                      |
| Phase 5a–5b (measurement, memory, reporting) | Reviews.                                                                 | Owns: these are read-side and do not touch Phase 4's write path.                                                                                   |
| Phase 5c (proposals, experiments)            | Owns the apply path, since it rides on Phase 4 packages.                 | Owns proposal and experiment records, protected-domain constraints and revert.                                                                     |
| Security review supplement                   | Answers questions about intent.                                          | Owns section 10 and keeps it current for the human reviewer.                                                                                       |
| GitHub governance                            | Neither. Human-administered.                                             | Neither. Both supply the proposed configuration and tests.                                                                                         |

The author of a change never reviews it. Neither agent approves. The same rule the ledger enforces for investigations applies to the people and agents building it.

## 10. Security review supplement for the independent human reviewer

Engineering input only. Verify each claim independently.

### 10.1 Threat model

| Actor                                             | Capability assumed                                               | What they want                                | Current defense                                                                                            | Gap                                                                                            |
| ------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Outside attacker                                  | Public repository, public preview URL if discovered, no account. | Read operational data, trigger actions.       | Route returns 404 outside the enabled preview; requires a verified session, MFA and the allowlist.         | Low. Depends on Vercel preview protection and on the enable flag staying off elsewhere.        |
| Ordinary member                                   | Valid account, possibly MFA.                                     | Reach admin data.                             | Allowlist checked in the database; spoofed JWT role claims are ignored (covered by the validation script). | Low.                                                                                           |
| Compromised agent credential                      | Acts as Codex or Claude.                                         | Push code, forge evidence, approve own work.  | Today: can only act on its assigned tasks, cannot approve.                                                 | No individual disable (V2). Evidence is unverifiable (R2). Phase 4 adds repository reach.      |
| Malicious or mistaken insider with one human role | Admin or reviewer account.                                       | Approve unreviewed work, rewrite the record.  | Reviewer cannot approve what they assigned or submitted.                                                   | One person can hold two accounts (R10). Effectiveness verdicts are self-assessable (V4).       |
| Database owner                                    | Full SQL access.                                                 | Alter history, flip the switch, change roles. | Trusted by design; external manifests detect post-capture changes.                                         | No in-database trace (V5, V8). Manifest omits roles and the switch (V3). Shared HMAC key (R3). |
| Compromised GitHub account                        | The single shared account.                                       | Merge anything.                               | None.                                                                                                      | `main` is unprotected (V11).                                                                   |
| Supply chain                                      | Dependency or workflow change.                                   | Run code in CI or production.                 | Path-filtered CI.                                                                                          | Workflows are editable by any PR; no code-owner gate.                                          |

### 10.2 Trust boundaries

1. **Browser → preview route.** Same-origin check, bearer verification, strict input schema, 12 KB body limit.
2. **Route → database.** The user's own token. No service role. The database re-checks everything, so the route is not trusted.
3. **Public function → private functions.** Session and MFA checked at the public wrapper; role and transition rules inside. Grants were revoked from client roles on every private function. _Verify the grants on the hosted project, not only in the scripts._
4. **Database → external custody.** Snapshot export and signed manifest. Depends on who holds the key and how often it runs.
5. **Blackbox → GitHub (Phase 4, not yet built).** Must be one-directional for facts: Blackbox reads commits, diffs and checks from GitHub and trusts nothing an agent reports.
6. **Staging → production.** Separated by project URL, a preview-only flag and the absence of the schema in production. _Not verified in this review._

### 10.3 Authentication and authorization

- **Sound:** MFA level, anonymous flag, session existence and expiry, ban, email confirmation and pending erasure are all checked in the database on every call.
- **Check:** behavior of the row lock on `auth.sessions` under the hosted function owner; token lifetime after MFA unenrollment; that `blackbox.principals` cannot be written through any exposed path.
- **Weak:** MFA for agent accounts (R1); no binding of accounts to people (R10); roles change without a record (V2).

### 10.4 Agent execution

Nothing executes today: the stack is advisory and investigation-only. All execution risk arrives with Phase 4. The nine controls in 3.2 are the proposed baseline, and none of them is implemented yet.

### 10.5 Database and API attack surface

- Two public functions, both `security definer` with an empty search path and grants to `authenticated` only.
- Inputs are length-bounded at the route and again in the database. Outcome keys are allowlisted.
- Error codes are mapped to four generic responses. Internal messages are not returned.
- **Review closely:** every `security definer` function for an unqualified reference; the dynamic paths that reach `auth` and `private`; the trigger on `tasks`, which runs as definer on every status change.
- No rate limiting (R8).

### 10.6 Audit integrity

- Append-only by convention and by missing grants, not by constraint (V8).
- Snapshot covers three of nine tables (V3). The switch and role changes are unrecorded (V2, V5).
- Manifests are symmetric and exact-snapshot (R3).
- **For sign-off, ask for:** append-only triggers, a hash chain, full-table manifests, asymmetric signing, a capture schedule, and a restore drill that compares digests.

### 10.7 GitHub governance

- Current state: no protection on `main`, no visible ruleset, no CODEOWNERS, one account authoring every commit in the stack.
- The stack's own documents propose the right controls. None are installed.
- **For sign-off, ask for:** the ruleset active on `main`; a second human reviewer; separate machine identities; required checks reported by an always-running aggregator; bypass list empty; workflows and migrations under code-owner review.

### 10.8 Production isolation

- The route and page exist only when three conditions hold: Vercel preview runtime, an explicit flag, and the exact staging project URL (`src/lib/blackbox.ts`).
- The production Operations response gains one optional field, `blackboxAvailable`, and a preview-only `autopilotTasks`. Both are behind the existing Operations gate.
- **Verify independently:** that the flag is unset in production and in other previews; that no Blackbox schema exists in the production database; that the staging keys are absent from production configuration.

### 10.9 Emergency disable and recovery

- **Works:** setting `blackbox.control.enabled=false` denies every read and write, including for administrators (probe P5).
- **Missing:** a record of the toggle (V5); a per-principal disable (V2); a way to recover stuck tasks afterwards (V1); a tested restore from backup with digest comparison.
- **Recovery order proposed in the stack's documents is right:** disable first, withdraw the preview, preserve the tables, never re-enable session-unchecked writes.

## Appendix · probe results

Local PGlite, scripts at `aab670c`, synthetic identities only. No hosted database was contacted.

| Probe | Action                                                           | Result                                       |
| ----- | ---------------------------------------------------------------- | -------------------------------------------- |
| P1    | Approving reviewer rates own outcome "verified effective"        | Accepted, revision 1                         |
| P2a   | Admin `handoff` of an assigned task                              | `42501 Transition denied`                    |
| P2b   | Admin re-`assign` of an assigned task                            | `42501 Transition denied`                    |
| P2c   | Admin `handoff` of an in-progress task                           | `42501 Transition denied`                    |
| P2d   | Admin `escalate` on the agent's behalf                           | `42501 Transition denied`                    |
| P3a   | Delete an agent that has a capability profile                    | `23503` on `agent_profiles_principal_fkey`   |
| P3b   | Delete the admin who verified a profile                          | `23503` on `agent_profiles_verified_by_fkey` |
| P3d   | Task state after its owning agent was deleted                    | Still `in_progress`, assignee set            |
| P3e   | Admin `handoff` of that orphaned task                            | `42501 Transition denied`                    |
| P4    | Triggers on `events` and `memory`; owner rewrites event evidence | 0 triggers; rewrite succeeded with no trace  |
| P5    | Admin `list` and `page` with the switch off                      | Both `42501 Access denied`                   |
| P5c   | Columns of `blackbox.control`                                    | `singleton`, `enabled`                       |
| P6    | Tables in the snapshot versus tables in the schema               | 3 of 9                                       |
| P7    | Second reviewer appends a contradicting verdict                  | Reporting shows only "verified ineffective"  |
| P8    | Stability wrapper calls `page` before every action               | Yes                                          |

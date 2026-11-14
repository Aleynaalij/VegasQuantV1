# Blackbox Phase 3 · Advisory engineering intelligence

The staging Control Center reads the same authorized Blackbox ledger and renders deterministic recommendations in the browser. The staging gate, verified bearer, database active-session check, AAL2, allowlist, ownership, review separation and write RPC are inherited unchanged. The Director cannot invoke task actions. Existing controls send the operator's commands to the existing RPC. No new database objects, secrets, jobs or external notifications.

## Decision policy

The versioned score exposes severity, potential impact, freshness-adjusted confidence, supported overdue deadlines, age since the last ledger change, blockers, recurrence, reviewed precedent and registered workload. Unknown, future, old or conflicting evidence reduces confidence. A proposal remains an investigation. Capability preference and visible workload rank registered candidates. Registration indicates eligibility, not online presence. The graph evaluator suppresses assignment recommendations for cycles, missing dependencies and dependencies without reviewed completion. The current preview accepts dependency inputs in the engine only. The ledger does not yet persist or expose dependency edges.

Plans show observations, unknowns, hypotheses, evidence links, investigation steps, validation ideas, risk and completion criteria. Historical outcomes are eligible for precedent only when incident identity, review timestamp and version match an independent approval event. Recurrence uses distinct slates in the same sport, content and incident class. The executive view is rendered on demand from the visible staging window. It reports source freshness and links material task claims to their records. External health, reviewer availability, and release readiness require separate evidence.

Rejection-derived runbook suggestions carry a policy version, task ID and task version and never overwrite historical memory. The current duration metric measures first acknowledgment through independent approval, including review and handoff time. Recommendation acceptance, failed validation counts and estimated-versus-actual outcomes need explicit ledger fields. Existing outcome fields support root-cause and validation references. Typed root-cause taxonomy, durable improvement reviews, daily snapshots and historical effectiveness comparisons remain follow-up work.

## Validation and performance

The visible ledger currently caps results at 50, scoped by role. Ranking and related-history matching are bounded by that window. Beyond it, use indexed, role-scoped server projections and pagination, and record versioned inputs for reproducible historical briefings. Treat aggregate counts as visible-window counts. The prior independently reviewed rejection/handoff scenario in staging can be reused to demonstrate memory and improvement after sign-in. Automated coverage uses synthetic tasks with deterministic clocks and no external writes.

## Release and rollback

Phase 3 is stacked after #285. Preserve #282 through #285 for their independent review. Keep this preview isolated. A future production display-only release and a separately approved supervised coordination release retain separate gates. No policy change, live monitoring, production assignment or release is authorized by a recommendation. November 12 remains unresolved.

Retire the Phase 3 preview or revert the Phase 3 commit on its isolated branch to withdraw the advisory view. No database rollback is needed for Phase 3. The existing staging emergency switch remains the containment control for ledger reads and mutations. Production release requires exact-SHA approval, independent review and a verified rollback target.

## Durable staging extension

Apply blackbox-phase3.sql after the active-session migration, only on the isolated validation project. The new RPC checks active AAL2 sessions and the existing allowlist, exposes 25-task ID-keyset pages, and scopes agents to assigned rows. Hidden dependencies are reported without identifiers. Administrator dependency edits serialize under a graph lock and append revisions. Assignment and handoff enforce reviewed transitive prerequisites through a database trigger. Reviewers can append typed improvement reviews tied to an independently approved outcome. Verified capability profiles are privileged staging records. Administrators can save an Eastern-day briefing revision from database evidence. Reviewer presence and verified recommendation acceptance are unavailable until dedicated evidence is recorded.

Phase 3 introduces an additional privileged RPC and assignment trigger requiring independent review. For rollback, disable the staging ledger first, retire the Phase 3 preview, export the Phase 3 tables and then remove the new RPC and assignment trigger under staging change control. Retain the tables as audit evidence. The prior RPC and original history are unchanged.

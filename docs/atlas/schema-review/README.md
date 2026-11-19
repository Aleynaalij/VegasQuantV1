# ATLAS staging schema and dependency review package

**PROPOSED / UNREVIEWED — no installation or catalog approval.** Prepared by Codex for independent database/security review of application candidate `8d6b0446094f234e4ad7b8e6539a59adb1cdeaeb`. Devon is proposed, not confirmed or assigned. Mike retains the final data-access boundary decision. Production remains NO-GO.

This package supplies original SQL, source provenance, dependency evidence, observed staging metadata, a proposed eligibility adaptation and the preservation/cutover plan below. It replaces the request for an already-reviewed artifact: Codex owns preparing this material; the reviewed target catalog is a later output of review and approved preparation. Neither this package nor its source hashes is that catalog.

## Scope and files

Only target `caynldluziwrzmvuslzg` is contemplated. Production `uowearboulykfcwnuirn` must never be a preparation, query, migration or test target for this package. No hosted SQL was installed, environment created, account modified, seed inserted, provider enabled or real session started while preparing it.

| File | Reviewer use |
|---|---|
| `manifest.json` | All 67 registry/prerequisite entries, original contracts, expected columns/methods/signatures/function hashes, source-unit links, dependency names and unresolved aliases. |
| `original-statements.json.gz` | 1,047 original source units from 121 migration files, with full SQL text, file/statement SHA-256, line ranges, referenced names and risk tags. These include historical definitions and transforms, **not** a curated executable migration. |
| `adjacent-risk-statements.json.gz` | 389 risk-tagged neighboring source units in those files that are outside the inferred dependency closure. They are retained so dangerous adjacent scheduling/seed/provider code is visible, not silently omitted. |
| `source-inputs.json` and `source-inputs-*.json.gz` | Full original input snapshot captured from the candidate Git tree, including neighboring source. Chunk integrity is checked before generation. Reference only, never an install selection. |
| `source-hashes.json` | Reproducible evidence-file hashes, not reviewed hosted-catalog hashes. |
| `observed-staging.json` | Read-only function bodies/owners/ACLs, columns and policy expressions observed on the isolated database. No user records, access tokens or keys. Observation only, not equivalence approval. |
| `eligibility-adapters.sql.proposed` | Concrete proposed staging-only membership/age helper DDL. Not a migration or an authorized installer. Requires the future verified gate, explicit target assertion and an absent private schema. |
| `review-index.md` | Capability/object navigation into the original statement corpus. |
| `review-package-sha256.json` | Delivery integrity hashes, including this proposal. Does not confer approval. |

The generator is `scripts/operations/atlas-schema-review.mjs`. It reads the included hash-checked immutable source snapshot captured from Git at the application SHA and writes files only. Shallow CI clones and offline reviewers need no historical Git fetch or mutable working-source fallback. It has no database client or SQL execution path. Reproduce the source evidence with:

```sh
node scripts/operations/atlas-schema-review.mjs --out /tmp/atlas-schema-review
```

The two statement corpora are gzip-compressed JSON for delivery. Decompress with `gzip -dk FILE.json.gz` or regenerate them with the script; the source-hash file records compressed and uncompressed digests. Neither corpus is executable SQL.

The lexical dependency index is conservative, not a semantic PostgreSQL dependency proof. References in dynamic SQL and strings are retained; unqualified names, overloads, rename chains, generated functions/views, implicit casts and grants inherited through roles need manual reconciliation. All history is evidence, not permission to replay whole migrations. At minimum resolve `private.before_age_community_member`, `private.before_age_has_membership`, `private.edit_ruby_link`, `private.submit_ruby_link`, and `public.desk_data_compact` through their rename/dynamic definitions before declaring closure complete.

## Proposed schema preparation by surface

| Surface | Proposed preparation and security behavior |
|---|---|
| Existing reduced research fixture | Preserve every row, existing entitlement/age state and Auth identity. Keep its invoker eligibility projections. Base-gate preflight runs against this **unchanged reduced shape first**; do not relax it to accept arbitrary expanded objects. |
| Gate | After isolation/preparation authorization, install the existing `private-access-stage-install.mjs` output first. Review all hashed gate source files in the manifest. Owners/entitlements are populated only through the separately authorized identity process; no current fixture becomes an owner implicitly. Namespaced settings/entitlements remain unexposed and caller grants limited. |
| Membership and age | Use the proposed helper draft instead of production payment/Stripe Identity provisioning or the local fixture's `test.*` switches. `has_membership` delegates to stored staging entitlement plus the live gate. `age_member_allowed` checks the caller's stored age plus live gate. The limited definer `age_eligible(target)` permits original other-author visibility checks only after authorizing the viewer; it returns a boolean, never age rows. This target-age projection needs explicit reviewer acceptance. Existing public `membership_status` and `age_verification_status` remain the isolated invoker projections. |
| Community/profile/stories | Curate the original table/constraint/policy/moderation/block/rate-limit/clock/follow/reaction/poll RPC definitions and their history from the index. Keep author identity bound to `auth.uid()`, original visibility and own-row mutation checks. Preserve explicit `USING` and `WITH CHECK`; inspect definer owner/search_path and private restriction lookups. No generic insert/update capability or constant-true membership/moderation helper. |
| Admin/Dealer attribution | Preserve original `is_admin` and attribution predicates and dependencies; empty staged admin stores confer no admin access. Do not run production admin grants, complimentary membership or Dealer account/config seeds. Synthetic Dealer identity/attribution rows require a separately reviewed seed manifest and must not be a login-capable publisher or connect a collector. Never replace these predicates with fixture constants to obtain green capabilities. |
| Saved picks/My Lays | Curate original saves/tails/member_parlays/catalog/create/share functions. Retain natural-key dedupe, ownership, immutable saved `legs`, valid-leg/game checks, publishing/model evidence and share dedupe. Do not fabricate model approvals or accepted publishing decisions. Original view dependencies must exist before these contracts activate. |
| Publication/contributor projections | Reconstruct the **effective original security-invoker** `published_legs` and `ruby_cards` definitions, including later dynamic edits, on reviewed source tables. Do not copy only their earliest CREATE VIEW. Preserve immutable publication IDs, source times, model/publication gates and original consumer columns. The `published_legs` cutover is a distinct review item below. |
| Inbox/preferences | Retain original recipient RLS and transactional social notification projections/rate limits. Constrain `push_enabled=false` and `email_enabled=false` before any staged consumer write, not merely after wrapping. No device subscriptions, delivery credentials or dispatcher activation. Inspect delivery/presence/erasure/restriction helpers reached by triggers; an inbox row is not permission to queue or send an external message. |
| NBA | Prepare original game/result-progress/player-result/three-attempt/observation/shooting/game-result structures and read policies; preserve existing NBA fixture rows. Original usage/defense invoker RPCs are source-hash checked. Read-only registry methods and paging bounds remain. Do not start ingestion, live scores or collectors. |
| NHL/native assets | Prepare the original snapshot/source and attribution dependencies, RLS and snapshot RPC. No storage bucket or remote image source is added. Original source/game/post binding and canonical download checks stay in force. |
| Other private helpers/workers | Review the private-table write graph and trigger effects even when the caller has no table grant. Keep required local transactional behavior and original worker permissions, but no worker runs, secret configuration or outbound invocation. Mark unsupported contracts unavailable; do not force group flags. |

SQL source statement navigation is in `review-index.md`; the complete original SQL text and mutation history are in the two JSON corpora. The proposed effective selection must be signed off by the independent reviewer, not inferred from source-file inclusion.

## Preserve the existing published_legs table

Observed staging has a **table** at `public.published_legs`; the consumer contract requires the original **security-invoker view**. `CREATE OR REPLACE VIEW` cannot replace a table. No DROP/TRUNCATE, lossy column cast, automatic copy into publications, or casual replacement is proposed.

Preferred review proposal:

1. Keep the table in place during base-gate preflight/install and original-source dependency preparation. Capture its full schema, policies, ACLs, OID, row count and ordered row digest; inspect dependencies by OID and any text/dynamic references by name. Capture the same evidence for all preserved fixture/Auth/entitlement data. Existing row hashes alone do not approve this schema change.
2. Prepare the canonical publication dependencies without synthetic eligibility shortcuts. Reconstruct the final original view in a disposable rehearsal first, including source/model/research-board edits. Compare actual column names/types/order, source records and effective policies to the approved source. Do not create a substitute table-shaped publication view solely for tests.
3. In one later approved transaction, lock the current table, verify its exact baseline, and move that **same table/OID** to an unused `vq_fixture.published_legs_preserved` name. Verify no name collision. This preserves rows and table-bound policies/dependencies; preserve the newly installed stage restrictions as well. It intentionally does **not** publish the archived rows through the new view.
4. Create the approved original `public.published_legs` invoker view at the public name. Explicitly revoke PUBLIC/anon access and apply only approved original authenticated read grants. Validate its underlying table RLS/gates and invoker options. Reconcile name-bound fixture readers and OID-bound dependencies explicitly; do not assume a rename retargets SQL-string bodies.
5. Check the archive OID/count/row digest against the original; compare all other preserved baselines. Verify expected original records through the new view and all anonymous/non-owner/expired/revoked/age/member denials through direct table/view/RPC paths. Any discrepancy aborts the transaction. Missing view dependencies abort rather than leaving a partial cutover.

This is a proposed cutover, **not an emitted runnable cutover migration**: the independently reviewed effective view definition and dependent-reader inventory must be resolved first. Rollback before commit is transaction rollback. After approved preparation, an application rollback retains the gate and archived data. A later schema reversal requires retired sessions, dependency checks and independent review; do not restore old definer bodies or grants while tokens remain active.

## Operations explicitly excluded

Never replay the original migration corpus wholesale. Exclude production data/account/admin/Dealer/member seeds, payment/Stripe Identity/Resend/provider setup, vault population, dispatch secrets, cron schedules, pg_net/HTTP activation, storage bucket/object/policy provisioning, Realtime publication changes, collectors and Auth trigger installation. Retain those statements in review evidence and record the exact exclusions/adaptations. In particular `20261017015506_social_notification_system.sql` contains the production social-dispatch HTTP function and `cron.schedule`; removing only the schedule does not review or eliminate the callable outbound body. Password/email/actor-erasure Auth triggers in that file need separate review and are not proposed for staged installation.

Original pure/transactional helpers may still read Auth metadata or private bookkeeping. Reject a proposed definer if it exposes Auth rows, permits an unbound actor, has an unexpected owner/search_path, grants excess EXECUTE, or reaches an unreviewed provider/dispatch path. No new service-role/database/admin credential belongs in the application environment.

## Review → preparation → catalog → feature installer

1. Confirm an independent database/security reviewer. Record identity, exact source/package hashes and findings; Devon is not yet assigned. Review the object/permission/trigger graph, proposed adaptations, archive cutover, missing dynamic aliases and synthetic seed plan. Resolve the open operator-DDL/direct-data decision with Mike; this package does not accept it.
2. Codex converts the accepted statement/adaptation selection into a separate target-pinned transactional preparation artifact. Rehearse it against a disposable copy of the reduced **schema and synthetic fixture** plus the intended gate. Recompute dependency/privilege evidence, negative controls, preserved row digests and outbound exclusions. No local fake Auth/settings seam may be shipped in that artifact. Independent reviewer signs off the resulting preparation SQL hash and unresolved differences; source hashing alone is insufficient.
3. Only after isolation/protection/cost prerequisites and preparation authorization, execute approved preparation on the pinned staging project. Capture actual created/altered objects, effective ACLs (including role/schema/column grants), function owners/search_paths/volatility/definitions, view invoker options and dependencies, triggers, constraints, policies, RLS flags and unchanged data evidence. Do not start real sessions.
4. Run the existing `--catalog-query` read-only on that approved prepared target. Reviewer compares the **actual target metadata and dependencies** to accepted source/preparation evidence and adjudicates differences. Only then record a separately reviewed target-specific catalog JSON, its hash, preparation SQL hash, actual target identity/version and reviewer decision. OIDs make this target-specific; an arbitrary live export is not approval.
5. Generate the supplemental feature-install SQL with that catalog; review its hash and target. Apply only within the subsequent authorized staging phase. Verify complete group flags, fingerprints and direct browser/API/table/view/function/storage/Realtime boundaries. No `fixtureEnable`, hard-coded group activation or silent catalog refresh.
6. Protected-host isolation, rollback rehearsal and the data-access decision still precede real owner/member MFA sessions. Independent consumer journeys and hosted preservation/worker/asset checks remain separate. Production requires its own later decision.

The five lexical unresolved aliases are explicit reviewer work, not a hidden completeness claim. This package is ready to inspect as a proposal; it is not approved, installable or sufficient to pass hosted acceptance.

## Evidence limitations and required decision

The existing RLS-disable counterexample remains: a privileged operator can disable RLS on a granted public table, preventing its restrictive policy guard from running. A null manifest does not prove direct-read denial. Choose either explicit acceptance of a trusted-operator/DDL-preflight boundary or a separately reviewed independent direct-data boundary. PostgREST schema denial on current managed auth/realtime/vault/migration tables does not settle this different public-table threat. No proposed grant or catalog hash silently settles it.

Three focused local tests exercise source-unit/dependency/risk extraction and the proposed eligibility helpers using disposable Auth/gate seams. They do not establish original full-schema equivalence, real MFA, a reviewed catalog, hosted isolation or complete feature parity. Application candidate CI evidence belongs to its exact SHA; this package's publication does not inherit an acceptance decision.

# ATLAS schema review — revision for Claude M1–M5

**PROPOSED / CHANGES REQUIRED UNTIL CLAUDE RE-REVIEWS THIS COMMIT.** Application source remains `8d6b0446094f234e4ad7b8e6539a59adb1cdeaeb`. No application route, auth gateway or production configuration changes are included. No hosted SQL, seed/account, environment, deployment or real-session action occurred.

[Claude's review](https://github.com/Aleynaalij/VegasQuantV1/issues/294#issuecomment-6998332824) is the official package review, per [Mike's recorded decisions](https://github.com/Aleynaalij/VegasQuantV1/issues/294#issuecomment-6998422208). Devon's earlier security review is separate and does not approve this new schema package.

| Owner decision | Scope of this revision |
|---|---|
| D1 | Trusted-operator boundary accepted **for synthetic staging only**, operators Codex and Mike. Mandatory DDL/RLS preflight remains. The privileged RLS-disable counterexample remains documented; this is not independent direct-data protection and does not carry to production. |
| D2 | Claude is reviewer of record. Package revision, executable preparation SQL, and actual target catalog still require their separate sign-offs. |
| D3 | Dealer is OFF. No staged Dealer identity/attribution seed, `private.is_dealer_publisher`, or Dealer visibility rewrite. Use pre-Dealer bodies and reviewed ordinary-profile/follow adaptations; Dealer-only contracts stay unavailable. |
| D4 | Effective definitions come only from disposable **native local PostgreSQL** replay, never from production. Production `uowearboulykfcwnuirn` is not a query, metadata-export, migration or test target. |

## Fixes and evidence

| Finding | Revision | Evidence |
|---|---|---|
| M1 — missing age in membership | `private.has_membership` requires the live gate **and age_member_allowed and stored entitlement**. The pre-age alias is an entitlement lookup, with no complimentary union. | `eligibility-adapters.sql.proposed`; negative-control test denies entitled/unverified through direct table, invoker view and RPC. |
| M2 — target-age oracle | `age_member_allowed` is a postgres-owned definer with empty search_path. `age_eligible` is revoked from PUBLIC/anon/authenticated/service_role and is not directly granted back. Other-author checks must enter reviewed definer surfaces. | Proposal and actual ACL/direct-call denial tests. No fixture constant replaces author eligibility. |
| M3 — outbound closure | Explicitly exclude both named dispatchers, social dispatcher, their callers/queue/config/claim paths and every outbound body found in the native replay. Omit scheduler/HTTP extensions, storage policies and all provider/credential setup. These contracts are unavailable, not callable dispatcher stubs. | `outbound-exclusions.json`, `local-replay/outbound-functions.json`, and zero-tolerance `post-preparation-assertions.sql.proposed`. Tests inject all four forbidden body markers, a vault row and PUBLIC private EXECUTE and require rejection. |
| M4 — effective aliases/views | Replay all **187 application migrations plus 3 versioned baseline schema files** on native PostgreSQL **17.11**. Extract all five aliases and both effective invoker views; capture pre-Dealer versions before its regex rewrite. | `local-replay/replay-report.json`, `effective-definitions.json`, and per-object `adaptations.json` with original/proposed hashes, SQL and ACLs. No production definition export. |
| M5 — missing negative identities | Add a proposed identity matrix for entitled/unverified, revoked, expired, future-start, unentitled/verified and active/verified cases, all under the same otherwise-valid private gate. Preserve existing fixture values. | `negative-control-seed-plan.json`; disposable SQL test exercises each identity against table/view/RPC shapes. Actual identity creation and complete prepared-schema/hosted path matrix remain future reviewed work. |

## Proposed eligibility and identity preparation

The eligibility proposal is still **not an authorized installer**. It requires the pinned target assertion, the existing reviewed gate, known fixture projections and an absent private schema. The assertion is not connection provenance; a later executor must pin `caynldluziwrzmvuslzg` out-of-band.

The proposal adds nullable `starts_at`, `expires_at`, and `revoked_at` to `vq_fixture.entitlements`, preserving all existing `allowed` values. Its invoker `vq_fixture.allowed()` checks those bounds against the same `auth.uid()` and retains existing own-row RLS and function ACLs. This makes revoked/expired identities distinct from a generic false boolean. The alteration and replacement definition require Claude's review along with the seed plan.

Compare the pre-change entitlement digest to the post-change ordered **ROW(user_id,allowed)** projection. Whole-row `row::text` hashes change when NULL columns are added; record that expected schema-only change explicitly and capture a new baseline after approved preparation. Do not modify existing age/allowlist/entitlement records to normalize test state. New `*.invalid` identities use new UUIDs only through the separately reviewed identity process. No admin/publisher/Dealer grants, delivery, password copy, login or MFA enrollment in this phase.

F1: session ID, AAL2, revocation and `not_after` enforcement are delegated to `vq_private_access_stage.authorized()`. This is an explicit staging adaptation of the original enforced age-session check, not an omitted control. Its real implementation must remain installed and verified.

F2: private helpers are authenticated-only; anonymous calls fail with `42501`, rather than inheriting the original anon EXECUTE. The isolated consumer has no anonymous member journey: the HTTP private gate denies it before those operations. Ordinary production grants/behavior are not changed.

F3: the proposal revokes postgres's global default PUBLIC EXECUTE **and** its private-schema default. Per-schema REVOKE alone cannot subtract PostgreSQL's global PUBLIC default; a focused regression caught this distinction. Existing function grants are not retroactively changed, new public endpoints need explicit approved grants, and the post-preparation assertion rejects any remaining PUBLIC EXECUTE on a private function.

## Native replay: provenance and limits

The local harness is `scripts/operations/atlas-schema-local-replay.sh` plus `.mjs`. It creates a fresh temporary native cluster, binds only `127.0.0.1:55439` with Unix sockets disabled, verifies the connected server's actual data_directory is the cluster it created before creating the disposable database, and removes the cluster on exit. It never accepts a remote host/connection string. The driver is installed separately in scratch; no application dependency or hosted credential is added.

Reproduce with native PostgreSQL 17.11 binaries and a temporary pg driver, for example the pinned packages used for this run:

```sh
npm install --prefix /tmp/atlas-native --no-audit --no-fund @embedded-postgres/linux-x64@17.11.0-beta.19 pg@8.16.3
ATLAS_REPLAY_PG_BIN=/tmp/atlas-native/node_modules/@embedded-postgres/linux-x64/native/bin \
ATLAS_REPLAY_PG_MODULE=/tmp/atlas-native/node_modules/pg/lib/index.js \
bash scripts/operations/atlas-schema-local-replay.sh /tmp/atlas-replay-evidence
```

This is native PostgreSQL, not the PGlite consumer fixture. It is also **not a complete Supabase platform clone**. `local-replay-platform.sql` is explicitly replay-only and must NEVER be a staged preparation input:

- Minimal Auth/storage structures stand in for managed platform catalogs. Real pgcrypto supplies crypto functions.
- `cron.schedule`/`alter_job` record text but never execute jobs. `net.http_post` always raises; successful replay proves no such call ran. pg_cron/pg_net CREATE EXTENSION units are individually recorded as omitted infrastructure registration, not silently treated as installed. No outbound extension is loaded.
- One unusable local vault placeholder satisfies a historical scheduler guard; it is not a real token or staged seed. The staged assertion still requires an empty vault.
- Two explicit synthetic local identities satisfy the historical Frank contributor and MikeQ automation migration preconditions. They are not real people, are not staged identities, and confer no staged approval. The original Dealer transformation executes only in this disposable reference replay; staging selects the pre-Dealer captures and excludes its account/data rewrite.
- The repository's `supabase/schema/research_feed.sql`, `personal_bankroll_adjustments.sql`, and `edge_releases.sql` supply three versioned baseline structures outside the migration directory. Their exact insertion points and hashes are recorded. No missing application structure was invented from production.

Every migration and baseline source hash, exception and local precondition is in the report. Original app statements/function bodies are not rewritten to get the reference replay to pass. This resolves the five effective alias definitions and both views; it does not certify hosted policy equivalence, real sessions or the entire platform. The source index remains lexical; dynamic/runtime dependencies and proposed alterations still need independent review.

## Per-object staging adaptations

`adaptations.json` is the machine-readable table and contains exact proposed function text/hashes where a body is selected or narrowly transformed:

- `private.before_age_has_membership`: replace the replayed original with the explicit temporal staging entitlement lookup. Exclude `private.existing_member_premium`, its blanket INSERT SELECT auth.users, and the complimentary union. No existing fixture automatically receives premium.
- `private.before_age_community_member`: use the capture immediately before `20261106221738_dealer_profile_visibility.sql`. Also select pre-Dealer `private.community_activity` and `public.community_avatars`, which that migration rewrites.
- Preserve ordinary profile/follow/notification checks while removing exactly the single Dealer exception from final replayed `public.community_profile`, `private.community_follow_target_allowed` and `private.notification_actor_followed`. Exact anchors and both hashes are recorded. Remaining Dealer-dependent functions are unavailable; no constant-false Dealer helper is installed as a workaround.
- `private.submit_ruby_link` and `private.edit_ruby_link`: retain the final link-aware replay bodies **with** the Kalshi temporary-pause guards/triggers from `20261106225003`. Historical links may remain visible and be removed; new/changed links remain blocked. Both pause triggers are confirmed in the replay. No Kalshi API, credential or network integration is enabled.
- `public.desk_data_compact`: use its final latest-analysis body after `20261018010000`, not the first rename. Its original anon EXECUTE is recorded; the private staged surface must revoke it/deny anonymous access.
- `public.published_legs` and `public.ruby_cards`: use the final effective original security-invoker definitions and their complete reviewed underlying graph, not an early CREATE VIEW. Preserve source/publication/model gates and immutable IDs/timestamps. No synthetic table-shaped replacement is parity evidence.

Stage-adapted function hashes intentionally differ from production for those listed functions. The preparation and stage-registry alignment need independent equivalence review before the supplemental installer can enable their groups. Do not force flags, copy production hashes onto changed bodies, or treat a fresh target export as equivalence proof. Dealer exclusions may keep a current aggregate group unavailable until the corresponding non-Dealer capability/dependency split is reviewed; this package does not hide that as complete consumer acceptance.

## Outbound/storage exclusions and assertions

The ledger names `private.invoke_push_dispatcher`, `private.invoke_live_pick_alerts`, and `private.invoke_social_notification_dispatcher`, plus every additional original native-replay outbound body and transitive caller. The push pipeline includes `enqueue_pick_push`, `enqueue_research_push`, `enqueue_signup_push`, `enqueue_official_push`, `research_analysis_push`, `research_feed_push`, `admin_signup_push`, `push_config`, `push_deliveries`, device registration and claim/finish/config RPCs. They are omitted/unavailable. Omit dispatcher rewrites in the research-signup and Dealer/Zone migrations rather than copying a caller that references an omitted function.

Retain only separately reviewed in-app transactional notification behavior, with email/push constrained false before any member mutation. No cron, real HTTP function, provider configuration, vault seed, Auth trigger or storage.objects policy/bucket is installed. Source history and the replay platform remain reference evidence, never a migration concatenation.

The post-preparation assertion allows **zero** stored function bodies containing `vegasquant.app`, `net.`, `http_post` or `vault.decrypted_secrets`; zero pg_net/pg_cron/http extensions; zero vault secrets; no Realtime table publication; no Dealer/premium residue or PUBLIC EXECUTE on private functions. It also verifies authenticated SELECT is revoked on the preserved publication archive. The assertion is a standalone DO, not a stored function containing its own forbidden strings. Rejection requires review/removal/adaptation, never a silent exception.

## published_legs preservation and rollout sequence

Current observed staging has zero published_legs rows, no text-named function readers, only its own PK/policy/type/TOAST OID dependents, no private schema and a free archive name. The metadata now records the empty name-reader result as `[]`, not null. This observation is not catalog approval.

1. After review/isolation authorization, rerun the **unchanged reduced-fixture** preflight and capture original schemas/ACLs/OIDs/policies and ordered row digests before the base gate. No relaxed preflight or inherited account grants.
2. Rehearse the accepted curated preparation SQL against a disposable reduced fixture plus real gate shape. Do not replay the full reference corpus or local platform stand-ins into staging. Verify negative identities on the actual selected table/view/RPC contracts, not only helper shapes.
3. In one later approved transaction, lock and baseline-check the existing table, move the same table/OID into unused `vq_fixture.published_legs_preserved`, create the approved final original invoker view at public.published_legs, apply approved grants and underlying restrictions, and **REVOKE SELECT ON vq_fixture.published_legs_preserved FROM authenticated**. No DROP/TRUNCATE, row replacement or automatic publication of archived rows. Verify archive OID/count/digest and all preserved projections before commit; abort on any drift or missing dependency.
4. Claude re-reviews this package commit, then the concrete curated preparation SQL and its hash separately. Only after its authorized execution does the actual target catalog get compared to accepted source/dependency evidence and receive its own sign-off/hash. Source/delivery hashes, observations and local replay are not that reviewed catalog.
5. Protected-host isolation/rollback evidence still precedes real owner/member sessions. Consumer parity, native downloads, original worker/data preservation and final exact-candidate acceptance remain separate. Application rollback retains the gate, archive, restrictive policies and data; schema reversal needs retired sessions and independent review. Production remains NO-GO.

## Package navigation and regeneration

- `manifest.json`: all 67 registry/prerequisite entries, source/dependency metadata, owner decisions, native resolution evidence and source-file hashes.
- `original-statements.json.gz` and `adjacent-risk-statements.json.gz`: complete selected original text/history and risky neighboring units; no implicit install selection.
- `source-inputs.json` / numbered gzip chunks: hash-checked immutable Git source at the application SHA, now including the three baseline schemas. Reproducible in shallow clones/offline without mutable source fallback.
- `observed-staging.json`: prior read-only staging metadata, not production data or reviewed catalog.
- `local-replay/*`: successful native reference replay evidence and outbound inventory; `adaptations.json`, `outbound-exclusions.json`, `negative-control-seed-plan.json`: proposed changes and exclusions.
- `eligibility-adapters.sql.proposed`, `post-preparation-assertions.sql.proposed`: concrete unreviewed SQL, not authorized installers.
- `source-hashes.json` and `review-package-sha256.json`: source/delivery integrity only, never approval.

`node scripts/operations/atlas-schema-review.mjs --out /tmp/atlas-schema-review` regenerates the manifest, both compressed corpora, **review-index.md**, and source hashes. `node scripts/operations/atlas-schema-adaptations.mjs` regenerates the proposed adaptation table from committed native replay evidence. The revision's focused tests cover source/risk extraction, actual permission and eligibility denials, deterministic regeneration and outbound assertions. Hosted preparation/identity/full-contract checks remain UNRUN.

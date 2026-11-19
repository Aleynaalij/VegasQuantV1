# ATLAS E1 — approved staging preparation executed

**prepare.sql committed successfully on `caynldluziwrzmvuslzg`. Actual target catalog awaits Claude's independent review.**

Approval: [Claude 6999946380](https://github.com/Aleynaalij/VegasQuantV1/issues/294#issuecomment-6999946380). Input was the byte-identical file at `97d29c5bd812e289297ec7dcc36164e22938b783`, SHA256 `49fbe1f4b52be840685e8c4f271fb6920fab500f011cce07afbcbe9382ebef4d`, 468917 bytes. The execution-request builder verified the approved hash and pinned connector project_id. No SQL was appended, removed or rewritten. Receipt and UTC timing are in `execution.json`; persistent schemas, view and archive were re-read after the transaction completed.

| E1 check | Result |
|---|---|
| Transaction | Tool returned success, no SQL error; committed state independently re-read |
| Claude catalog query | **33/33 PASS** after execution: isolation 14, prepared 9, preservation 10 |
| Standalone Codex post-preparation assertions | **PASS**, no rejection |
| Original published_legs table | Same OID **17717**, now `vq_fixture.published_legs_preserved`; zero rows; no caller SELECT |
| public.published_legs | Original final security-invoker view |
| Source function definitions | **118/118 hashes equal** the approved preparation inventory; no mismatches |
| Auth state | **4 original users, 0 sessions**, zero gate owners/entitlements, zero admins/contributors |
| Production migrations, read-only before/after | **180**, latest `20261118010000`, canonical version-list digest `6d2d6b44f16eabc800712a9d0d4a1bed`, unchanged |
| Production Vercel release, read-only before/after | `dpl_8dCL41hbSPhjYebGywC5M4RRjoxk`, SHA `8ea6c4add7219acf7411b7850eeb322b804caf8e`, unchanged |
| Production domain metadata, read-only before/after | `vegasquant.app`, same verified production project assignment, unchanged |

The production metadata query was explicitly `BEGIN READ ONLY ... ROLLBACK` over migration version metadata only. No production writes or schema/body exports occurred. No Vercel mutations or deployments occurred. The main branch also matched the production commit before execution.

## Actual created objects and review material

`created-objects.json` enumerates **2 schemas, 97 new tables, 126 new functions, 3 original invoker views and 4 generated sequences**. The existing publication table was moved/renamed, not recreated; `vq_fixture.allowed()` was replaced as approved. Associated constraints/indexes/triggers/policies and complete actual ACLs/owners are in `target-catalog.json.gz`. That catalog covers all **133 app/gate/fixture functions, 109 tables, 3 views and 4 sequences**, plus schema/default ACLs. Its delivery SHA256 is:

`c95657538b6107723ab94e37d73c4adf767b8c6844550d210160321939b48238`

The supplemental installer-compatible `feature-catalog-candidate.json` was captured using the unchanged `stageFeatureCatalogSql()` query. It contains **134 public/private/auth function fingerprints and 104 public/private table/view security records**; SHA256:

`d464d888d3e1ad83703ba3820ffd4d38ca795e3371561c57162876a3c1f044d6`

**Both are unreviewed actual-target captures, not automatic approval.** Do not feed the feature candidate into installation until Claude explicitly reviews and approves its exact bytes/hash. Registry/capability activation was not performed. A later approved free-Home/schema change changes the target catalog and requires an updated capture/review before installation/deployment.

## Actual RLS-disabled boundary

Exactly these three stores have RLS off: `vq_private_access_stage.private_development_settings`, `vq_private_access_stage.private_development_owners`, and `vq_private_access_stage.entitlements`. All caller table privileges are revoked from PUBLIC, anon, authenticated and service_role. Publishable-key caller roles cannot read/mutate their rows. Only the reviewed postgres-owned, pinned-search-path gate functions project live-session authorization. All selected original public/private tables and the public gate-record table have RLS on. This is the accepted synthetic-staging trusted-operator boundary, not production approval.

## Held steps

`identities.sql` **was not run**. I1 requires actual target-catalog sign-off, deployment probes, and execution close to member tests (about 20 hours or less). There are still only the four original users and zero sessions. No test credentials, MFA material or sessions were created.

Owner chose free-Home option (b). That is a separate generated artifact/hash/rehearsal for Claude's review; neither fixture column nor the free-core function has been changed here. The currently installed free-core denial remains as approved. Compatibility with the signed identity artifact's embedded whole-row games digest must be resolved in that separate review before I1 execution.

Production remains **NO-GO**. No deployment, real-session test or consumer acceptance is claimed by this database preparation.

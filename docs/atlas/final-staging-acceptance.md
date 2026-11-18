# Final integration decision package

Production remains **NO-GO**. This is an isolated draft engineering candidate, not a release or a completed hosted acceptance claim. Exact candidate SHA and GitHub workflow/artifact URLs belong to the PR's acceptance ledger so they can identify this document without a self-referencing commit.

## Reviewed inputs and compatibility

| Input | Pinned SHA | Treatment |
|---|---|---|
| Gate #295 | cdcead809513f50056f28ba2b0c8792361a96221 | Source branch preserved |
| UI #296 | 68e10f7b0993a1175955e2160682bae1cd515365 | Source branch preserved |
| Combined #297 | 8ff36c178c8fb994e5a45f93741c568a4ee2c332 | Parent; source branch preserved |
| Production/main | df5e5f010a19a2a14f009b94c43db033b499d077 | Includes accepted NBA card #298; retain in integration |
| Elo adapter | Reconstructed consumer-only patch from #297 comment 6964151473 | Reviewed hash 40eb2f7a9e55dc1f942f2553ff1840c600b19cfdaf8d7d0b9d568864ad88ea21; adapted lifecycle/projection/tests, no competing server handler |

[Route matrix](route-compatibility.md) records every production route. The separate candidate restores explicit consumer page patterns, not arbitrary prefixes or APIs. Existing production configuration remains the default. Discovery rollback is distinct from private-access authorization and cannot release the gate.

## Data path and security boundary

Combined-only GET `/staging/discovery/read/dealer?sport=all|nba|nhl|nfl|ncaab` returns `{state:'ready',posts}` from `vq_private_access_stage_dealer_feed`. Its `vq-stage-dealer-v1` contract identifies an operator-reviewed **synthetic** source, never inferred authorship from discussion names/card tags. This is not a production Dealer feed. Existing IDs, text, source URLs and publication timestamps are returned unchanged.

Combined-only GET `/staging/discovery/read/research` adapts the existing `readResearchHubWithClient` using a per-request publishable client and the same HttpOnly token as the gate. No service key or client token exposure. Both endpoints require live stage authorization plus existing age and entitlement checks. They revalidate authorization before returning a completed read. Missing configuration, wrong credentials, unsupported input, denial, revoked sessions and unavailable verifiers fail closed. Requests cannot choose an origin, arbitrary RPC, table or upstream URL. No caching or redirect following.

The server desk now attaches the current staging session and authorizes before its combined-mode fetch. The isolated fixture currently lacks `desk_data`; that source remains unavailable until its supported contract exists. No production fallback or invented desk content is substituted. Combined Home now derives all Tonight game cards from the same guarded HubData events, with exact Eastern-day and game-ID-to-Room mapping. Its legacy browser schedule hook is disabled only in compiled combined mode; ordinary production callers retain the original reader. Missing legacy desk_data still blocks legacy desk feature acceptance, not the new guarded Home schedule. A mandatory ATLAS browser test exercises Home-to-Room navigation through the actual Next endpoints with external transport blocked.

The prepared SQL installer is restricted to the known consumer synthetic fixture baselines and rejects a production-like `community_posts` schema. It adds a namespaced live-session gate, a synthetic Dealer source, and additive restrictive policies on the eight existing public research/schedule tables and fixture sports/posts. Existing age/entitlement predicates remain authoritative. Caller-owned entitlement/age helpers remain unchanged to avoid policy recursion. Machine write privileges are not broadened. No production SQL is proposed for execution.

### Four build modes

| Mode | Use | Gate handlers | Consumer readers |
|---|---|---|---|
| standard | Existing production/default | Excluded | Excluded |
| consumer-fixture | Local/CI only, no Vercel runtime | Excluded | Excluded |
| gate | Dedicated isolated gate acceptance | Included | Excluded |
| combined | Protected isolated Home/Zone/Discovery/Rooms | Included | Included |

`STAGING_DISCOVERY_FIXTURES=true` is deterministic presentation testing only. To read the isolated synthetic database use `false` **and** `VQ_STAGE_RESEARCH_CONTRACT=vq-stage-session-v1`. That flag is a versioned wiring assertion, not proof that hosted policies are installed. Linked-publication mode remains false pending separate guarded contract acceptance.

## Owner setup checklist and precise blockers

Authorization exists for at most **$10 incremental Vercel usage**, recorded by Mike on [#297 comment 6948943185](https://github.com/Aleynaalij/VegasQuantV1/pull/297#issuecomment-6948943185). It does not authorize unlimited usage or other services.

Read-only checks on November 17 found one custom-environment slot and zero configured custom environments. Project-level Vercel Authentication is `all_except_custom_domains`; this alone does not prove a future custom target's protection. Environment metadata contains branch-specific settings and is truncated; no effective isolated target inventory exists yet. No secret values were read or copied. A read-only dashboard fallback reached Vercel sign-in, so effective spend controls could not be inspected there either.

The available billing feed returned a daily, delayed period ending November 17 08:00 UTC: $0.960515679703 team-wide including Pro subscription, with a truncated record sample. This is **not** staging-attributable real-time usage, an incremental spend cap or a forecast. Do not create/configure/deploy the target on this evidence alone.

1. **Vercel project owner**: verify plan inclusion for the remaining custom slot and effective spend controls/attribution within the approved ceiling. Record screenshots/export and an accountable stop action. If the ceiling cannot be enforced or reliably monitored, obtain Mike's specific spending decision before configuration.
2. **Vercel project owner + Codex**: create only `atlas-private-access` after step 1; do not import Preview/Production credentials. Inspect the complete effective build/runtime variable inventory, project integrations, Git hooks, cron, domains and deployment protection. Disable outbound/provider/billing/public publishing integrations. No public custom domain; verify Vercel Authentication on deployment and aliases.
3. **Database owner + security reviewer**: review and install the generated isolated-only SQL after rechecking fixture identity and source hash. Do not apply to production. Snapshot table counts/hashes and original policies first. Record SQL/catalog proof, security advisors and effective grants; refuse unknown schema. Prepared is not installed.
4. **Mike + identity owner**: map both intended owner identities to authorized synthetic staging accounts, confirm independent recovery custody and MFA enrollment. Do not copy or change production accounts. Current isolated catalog has zero sessions and zero MFA factors; no real owner acceptance is possible yet.
5. **Codex**: manually deploy the reviewed exact candidate to that protected custom target only; record SHA, route manifest, effective credential ref and no outbound side effects before real sessions.
6. **Elo**: independently review fresh adapters, complete consumer acceptance and investigate remaining unsupported fixture contracts. Original local adapter evidence does not transfer to reconstructed code. The fresh patch is now adapted with the exact ready envelope and SQL field bounds; acceptance reruns on this tree.

### Exact custom-target variable inventory (no secret values)

| Variable | Required value / scope |
|---|---|
| VERCEL / VERCEL_ENV / VERCEL_TARGET_ENV / VERCEL_URL | Platform values: `1`, `preview`, `atlas-private-access`, exact protected `*.vercel.app` deployment host |
| VQ_STAGE_BUILD_PROFILE | `combined`, custom target only |
| VQ_PRIVATE_ACCESS_PROJECT_REF | `caynldluziwrzmvuslzg`, custom target only |
| NEXT_PUBLIC_SUPABASE_URL | `https://caynldluziwrzmvuslzg.supabase.co` |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | That isolated project's publishable key; never service role/secret |
| STAGING_DISCOVERY_PROJECT | Same exact isolated reference |
| STAGING_DISCOVERY_ENABLED / CONSUMER_UI_ENABLED | Explicit `true` for acceptance; explicit `false` for independent UI rollback |
| STAGING_DISCOVERY_FIXTURES | `false` for connected synthetic DB acceptance; `true` only for deterministic fixture presentation |
| VQ_STAGE_RESEARCH_CONTRACT | `vq-stage-session-v1` required for connected mode |
| STAGING_DISCOVERY_LINKED_PUBLICATIONS | `false` until separately accepted |
| BILLING_ENABLED / AGE_VERIFICATION_ENABLED / VQ_PUBLICATION_PREVIEW_LIVE_ENABLED | Exact `false`; age fixture independently enforces verified synthetic state |
| LIVE_SCORES_DISABLED | `1` |

Do not configure production Supabase, service/database keys, provider/collector credentials, Stripe, notification dispatch, email, push, webhook or other outbound integration secrets. The runtime rejects known unsafe credentials; the owner must also review the full effective inventory, not assume a denylist detects every future integration. A missing required setting rejects staging build/runtime rather than selecting production defaults. Standard production mode remains inactive for this gate.

## Acceptance ledger

| Item | Current result | Evidence / remaining action |
|---|---|---|
| Source refs preserved | Verified locally | Three reviewed refs unchanged; re-read before handoff |
| Production route file inventory | Verified source inventory | Matrix; runtime tests separately cover static restored pages |
| Owner/non-owner/API fail closed | Verified synthetic/local only | Gate, endpoint and PGlite tests; real tokens NOT TESTED |
| Direct database research gate | Verified local SQL only | Additive policy tests; hosted install NOT TESTED |
| Data + entitlement preservation | Verified local SQL only | Member data stays present; worker append and rollback/recovery tests |
| Direct Storage / Realtime | Catalog absence verified | Zero buckets and zero published tables in isolated DB; no affirmative hosted access claim |
| Both intended owners + MFA | NOT TESTED hosted | Zero live sessions/factors; identity owner action above |
| Home Dealer + Game Rooms | Implemented guarded readers | Synthetic source only; no production content claim |
| Zone interactions | NOT TESTED combined hosted | Existing fixture lacks community mutation contracts; browser CSP deliberately denies direct backend connections |
| Research downloads | NOT TESTED combined hosted | Legacy server handlers intentionally denied; independent PNG/mobile acceptance required |
| Worker continuity | Verified local fixture only | No live worker/collector execution; no schedules touched |
| Mobile / accessibility | Await exact-head CI | Existing synthetic browser suite; fresh combined real-session acceptance remains open |
| Rollback | Verified local tests; hosted NOT TESTED | Separate UI disable, private mode off/on, session recovery; originals retained |
| CI | Await exact-head run | Full unit/type/build + four modes and synthetic browsers; PR ledger is authoritative |
| Intermittent UI timeout | Unresolved reliability observation | Earlier rerun pass does not establish cause; no suppression or test weakening |
| Security review | Pending independent review | Request review against exact tree and SQL; no completion claim |
| Protected hosting/isolation | Blocked | Owner checklist steps 1–5 |

An unrestricted aggregate local test run suffered a SIGKILL in the NGS Python subprocess while build work was running. Preserve that result; bounded-concurrency aggregate and exact-head CI must be reported separately. A completed workflow, green badge or available draft is not hosted acceptance.

## Rollback and recommended sequence

Preserve source branches and previous isolated deployment. Before database installation retain original policies and row/count hashes. Restrictive policies are additive and remain installed during normal application rollback. Do not remove them as a shortcut: the older fixture policies alone do not check live session revocation. Change only namespaced private-mode/UI settings and retain the live-session restrictions; any eventual schema removal needs a separately reviewed offline teardown. Disable discovery independently to prove the private gate still denies non-owners. For private-mode rollback change only namespaced staging settings under operator control; expired/revoked sessions must remain denied. Retest both owners and recovery after a fresh session. Never delete users, records or entitlements to demonstrate suspension.

Sequence: exact-head local/CI verification → Elo adapter/consumer review + independent security review → owner cost/isolation evidence → isolated schema validation → protected manual staging deployment → real-session browser/API/direct-data and rollback acceptance → consolidated exact-SHA CEO decision. Production merge, deployment and migration remain separately unauthorized. Publishing workflows/schedules and production accounts remain unchanged.

Hosting references: [Vercel branch deployment opt-out](https://vercel.com/docs/project-configuration/git-configuration), [custom environment plan allowance](https://vercel.com/docs/deployments/environments), [spend management](https://vercel.com/docs/spend-management). Platform guidance does not prove this project’s effective configuration.

## Additional combined consumer verification

Elo independently reviewed `0a22eba` and identified the direct-browser Home schedule gap in #300 comment 6964420119. The followup implements the suggested guarded-event projection, rather than loosening CSP or creating a second browser identity. The new mandatory connected browser test uses the actual combined server and reader routes with synthetic backend transport. It is separate from the consumer-fixture mobile/a11y suite. A local launch attempt was blocked by the workspace Chromium/crashpad sandbox (`ptrace: Operation not permitted`); no browser safety bypass flags were added. GitHub's normal browser runner must provide the final application-level result.

Global account/profile/notification UI still uses browser-session contracts; Zone mutations and legacy downloads are not claimed complete. These and independent security review remain required before hosted/production release readiness. Existing CI action Node20 deprecation/forced Node24 and url.parse warnings remain visible; no warning suppression or weakened test assertion was introduced.

## Independent security review remediation

Elo reproduced a fail-closed installer precondition gap (#300 comment 6964453976): policies alone did not protect an RLS-disabled baseline. No hosted table was reported disabled. The installer now refuses installation before creating any staging object unless all twelve research/helper relations are ordinary postgres-owned RLS-enabled tables with authenticated SELECT and no anon/member mutation or column-write grants. It also refuses unknown readable public/fixture views and caller-executable definer/non-postgres-owned function paths. It does not silently enable RLS or repair permissions. Fresh disposable negative controls disable RLS on every target, drift grants/ownership, and introduce readable view/definer paths; each must abort and leave no staging schema, records or policies. Hosted catalog checks confirmed expected RLS/owner/read-only grants on November 17, but no installation was performed. This remediation still requires independent re-review of its exact SHA.

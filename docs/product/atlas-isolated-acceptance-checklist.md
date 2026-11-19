# ATLAS isolated acceptance checklist

The reviewed app candidate is [PR #297 at `8ff36c178c8fb994e5a45f93741c568a4ee2c332`](https://github.com/Aleynaalij/VegasQuantV1/pull/297). The database package is tracked independently. Keep the reviewed PR and its two source branches pinned until the next application candidate has its own exact-head checks. Production remains NO-GO.

## Owner setup

1. In the existing Vercel team and project, confirm the Pro usage credit remaining, current billable usage, alerts and allowed staging spend. One custom slot was unused on November 17. The November 15–17 team Build & Deploy total was about $0.74, including $0.56 for Build CPU Minutes. This is prior team spend. Allow for one dedicated gate build and one combined build, plus a rebuild if rollback requires one. Usage includes build CPU, storage, protected page requests, function time and transfer. The combined app performs a staging authorization RPC per protected request and authorizes the guarded Dealer read at the database. Review usage after the first build before opening the second test window.
2. Verify effective Vercel build and runtime variable scopes, including inherited variables and integrations. Confirm only the approved validation Supabase project `caynldluziwrzmvuslzg` is reachable for app data, with suppressed billing, email, push, publishing and live providers. Confirm the generated staging URL is protected by Vercel Authentication and has no production alias. Preserve the existing production protection and configuration. Create `atlas-private-access` only after spending and isolation approval. Use a manual exact-SHA deployment.
3. Apply the following variables exclusively to that custom target. Check names and scopes in evidence. Transfer credentials through the staging project's authorized secret controls.

| Scope | Variable | Required value or verification |
| --- | --- | --- |
| Vercel system | `VERCEL`, `VERCEL_ENV`, `VERCEL_TARGET_ENV`, `VERCEL_URL` | Vercel, `preview`, `atlas-private-access`, and the protected generated `.vercel.app` host. Confirm the effective system variables in both build and runtime. |
| Custom target | `VQ_STAGE_BUILD_PROFILE` | `gate` for standalone, `combined` for combined synthetic acceptance |
| Custom target | `VQ_PRIVATE_ACCESS_PROJECT_REF`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Exact isolated project ref, its HTTPS endpoint and a publishable key from that same project. |
| Custom target | `BILLING_ENABLED`, `AGE_VERIFICATION_ENABLED`, `VQ_PUBLICATION_PREVIEW_LIVE_ENABLED`, `LIVE_SCORES_DISABLED` | `false`, `false`, `false`, `1`. Verify synthetic age separately against the fixture. |
| Combined only | `STAGING_DISCOVERY_PROJECT`, `STAGING_DISCOVERY_FIXTURES`, `STAGING_DISCOVERY_LINKED_PUBLICATIONS`, `STAGING_DISCOVERY_ENABLED`, `CONSUMER_UI_ENABLED` | Same isolated project ref, `true`, `false`, `true`, `true`. Toggle the relevant flags to `false` for the rollback checks. |

The build supplies `VQ_COMBINED_STAGE_BUILD`. Keep service-role keys, DB credentials, payment keys, sports-provider keys, outbound notification keys, and deploy bypass credentials outside the app environment. Operator and worker test secrets belong in their separate isolated runners.

4. Verify the staged SQL digest, grants, enabled gate, and a test-only records fixture before signing in. Provision independently verified staging owner, recovery-owner and non-owner test identities with the intended membership/age cases. Capture sanitized outcomes. Never include credentials, IDs for personal accounts, TOTP codes, cookies or bearer values in the evidence.

## Acceptance order

| Check | Expected evidence |
| --- | --- |
| Protection and build identity | Record the deployment ID and exact SHA. Anonymous Vercel request is challenged. Missing or malformed staging configuration fails closed. Verify route inclusion and compare approved routes against the standard build. |
| Owner and recovery MFA | Each staging owner completes an independent real AAL2 login. The correct owner records and allowed fixture reads appear while cross-account, AAL1 and mismatched sessions are denied. |
| Non-owner and revocation | Use authorized staging test sessions. Verify page, API, and direct RPC/table denial for signed-out, non-owner, revoked, expired and wrong-age sessions. Keep a token issued before revocation for the post-revocation replay check. Verify cross-tab UI clears stale reads. |
| Worker and data preservation | Use the separate worker identity to append a synthetic record. Confirm private-mode denial for ordinary members and read back the worker record and existing dataset counts/digests. Verify the staging app cannot trigger billing, delivery or public publishing. |
| Rollback | Exercise consumer-off and Discovery-off with gate-on. Rehearse opening the staged gate through its singleton setting for eligible fixture members. Revoked sessions must stay denied. Restore private mode and verify both owners and the preserved data. Record static build, runtime and database rollback outcomes separately. |

## Dealer contract and remaining integration

`public.vq_private_access_stage_dealer_feed(p_sport text, p_limit integer)` uses the caller’s staging token. It returns SQL null for a denied or invalid call or the `vq-stage-dealer-v1` envelope with up to three rows for an authorized request, newest first. Its five fields are `id`, `sport`, `title`, `body` and the stored `created_at`. The source is a namespaced, operator-controlled synthetic table that starts empty. The same session, gate, entitlement and synthetic age predicate applies on direct table reads. Browser clients cannot write these fixtures.

The hosted database does not contain the production Community source and its attribution, block and visibility policies. This package grants no access to those publications. The consumer adapter, guarded Game Room data and connected-data parity need a separately reviewed candidate. Keep linked publications disabled. Verify the six reported staging navigation gaps before claiming full replacement parity. [Elo's route and data review](https://github.com/Aleynaalij/VegasQuantV1/pull/295#issuecomment-6948277684)

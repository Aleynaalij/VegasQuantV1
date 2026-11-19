# Home/Zone 2.0 — production owner-preview enablement

Status: draft code for Claude's review. No merge, deployment, production setting, account or database change is included. The deployed candidate remains `677be0a`; production remains NO-GO until Mike's separate release decision.

This implements **step 2 (owners)** of the release plan. Mike's latest decision parks staging sign-in journeys (#309) and replaces their coverage with production owner-preview checks and the free-user/age boundary before member opt-in: https://github.com/Aleynaalij/VegasQuantV1/issues/294#issuecomment-7018127290.

## Selection

Two server-only settings are proposed for the later reviewed production deployment:

| Name               | Meaning                                                                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HOME2_PRODUCTION` | Only the exact value `owners` enables this step. Unset, unknown, `off`, `optin` and `default` keep classic.                                         |
| `HOME2_OWNER_IDS`  | One or two distinct, exact UUIDs of existing owner accounts, supplied by Mike. Empty, malformed, duplicate, zero UUID or larger lists keep classic. |

Only Vercel Production with the existing production Supabase origin and publishable key qualifies. Staging configuration disqualifies this production selector. Neither setting uses a `NEXT_PUBLIC_` name, and the allowlist is kept behind a `server-only` module. No value is configured by this PR.

The root Home and Community pages keep their existing legacy redirects and staging selection. When the production settings are off, they render the existing classic components directly. When configured for owners, they still render classic first, then a small browser controller obtains the existing Supabase session and asks `POST /api/consumer/owner-preview` for a decision using its Bearer token. There is no new login, credential provisioning, token cookie or credential store.

The server requires an exact allowlisted UUID, an authenticated non-anonymous confirmed account, a nonzero session ID, unexpired access token and **AAL2**. It validates the token against the pinned Supabase Auth `/user` endpoint before allowing selection. Missing, malformed, revoked, banned or unavailable Auth results keep classic. JWT decoding is an untrusted prefilter; it never authenticates a caller. Auth v2.198.0's `requireAuthentication`/`maybeLoadUserOrSession` implementation loads the current user and rejects a missing session: https://github.com/supabase/auth/blob/v2.198.0/internal/api/auth.go. Verify the live production Auth version and session-revocation behavior during owner acceptance before advancing.

The endpoint accepts same-origin POSTs on `https://vegasquant.app` and `https://www.vegasquant.app`, reads only the Authorization header, returns only `{ enabled: boolean }`, sets no cookie, and uses `private, no-store` with `Vary: Authorization, Origin`. URL/query, cookies, request bodies, public flags, email and user-editable metadata cannot select the audience. No privileged Supabase key is used.

## Client and data behavior

Only after a positive server decision does the browser mount the existing Home 2.0 or Zone 2.0 component. Account/token changes and sign-out clear the selection before another check. Generation tracking discards late responses from an earlier account. Network or shape errors return to classic. Focus and visibility recheck the decision; a 60-second timer rechecks active previews only, so ordinary members are not polled in the background. A loaded preview returns to classic on the next check after rollback or session revocation; a reload applies the current configuration immediately.

The production components use their existing ordinary data paths (`VQ_COMBINED_STAGE_BUILD` remains false), including real Dealer reads and the existing browser Auth session. Existing RPCs, age checks, membership checks and RLS continue to decide data access. This layout-selection API grants no data permissions. The two allowlisted accounts need their existing MFA sign-in; this PR grants no admin, member or age status.

Production Home cards use the existing canonical game pages and Research Board URLs. Staging keeps its reviewed Game Intelligence Room links. The production selector does not expose the staging-only room routes; a production Game Intelligence Room entry point would need its own reviewed route and access behavior.

## Gates and rollback

1. Claude reviews this code and its tests. Mike separately approves step 1: merge the original candidate dark, with both new settings unset, and run the planned before/after classic comparisons and observation period. This PR does not merge itself or #304/#306.
2. Mike approves the reviewed owner-preview deployment and the exact existing owner UUIDs. Configure only the reviewed Production target, keep the staging environment isolated, and verify owner/nonowner separation, real data, Dealer, notifications, existing links, session revocation and original authorization boundaries.
3. Before members may opt in, verify the non-paying and age-unverified accounts against classic: free Home matches classic, paid content is denied, and unverified users receive the same denial. Those compensating checks are required even though staging journeys were waived.
4. `optin` and `default` are reserved fail-closed values in this step. The later, separately reviewed rollout must implement authenticated preferences and “Back to classic,” retain classic for two weeks after default-on, and obtain its own gate before either value is activated. Do not treat those values as shipping member rollout support here.

Unset `HOME2_PRODUCTION` and redeploy, or use the approved Production Instant Rollback. No data rollback or migration is required. Selection failure shows classic; it does not bypass an existing data denial. The new branch has automatic Vercel deployment disabled, and no hosting API write is part of preparing this PR.

## Validation

The focused policy/transport tests cover dark defaults, exact target and owner-list validation, spoofed query/cookie/body/public flags, forged owner tokens rejected by Auth, AAL1/expired/anonymous/missing-session denials, malformed or mismatched Auth users, same-origin restrictions, private response shape, a successful current-owner decision, rollback recheck and delayed-response/account-switch invalidation. Existing consumer-integration tests preserve both legacy route destinations and the staging selector. `scripts/ui-smoke/production-owner-dark.sh` checks the built Home/Community classic HTML, dark endpoint and both legacy redirects with synthetic query/cookie attempts. Build it first with `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, so it makes no production database requests. Full suite, TypeScript and standard production build results are recorded in the PR after execution.

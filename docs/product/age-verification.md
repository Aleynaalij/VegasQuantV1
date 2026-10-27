# Independent 21+ age verification

Prepared October 14, 2026. Owner selected independent verification rather than a date-of-birth declaration. This integration is deliberately staged: private.age_policy.enforced starts false, and provider requests require AGE_VERIFICATION_ENABLED=true plus live restricted credentials and a webhook secret. No account has been marked verified and no live ID/selfie check has been started by this change.

## Prepared flow

1. New members create an email/password account and confirm their email. Existing members use their usual sign-in. Neither signup metadata nor prior membership/admin status proves age.
2. When enforcement is activated, all signed-in accounts without current-policy proof see the age gate. New registrations remain pending until verified. Account management, cancellation, deletion, recovery and policy/support pages remain accessible.
3. Members read the verification/privacy notice and accept the current terms before continuing to Stripe Identity's hosted ID and matching-selfie flow. Live capture is required.
4. A signed webhook or authenticated server poll retrieves the owned provider session and its verified DOB using the restricted key. The server checks 21+ using the America/New_York calendar date. Unknown DOB, test mode, missing checks or incomplete verification cannot pass.
5. Only the service-role result writer can grant proof. The app stores a result, provider reference, policy/consent version and timestamps, not ID images, selfies or full DOB.
6. Database restrictive policies, guarded privileged member RPCs and checkout guards enforce the result independently of the UI. Administrator and trial accounts have no exemption. Public visitor publications remain public; this is an account-feature gate, not a claim that all public content is inaccessible to minors.

## Activation prerequisites

- Owner approves Stripe Identity commercial terms and usage cost. Stripe's US page currently advertises ID + selfie at $1.50 per completed verification and the first 50 free; actual account eligibility, retries and usage billing must be confirmed in Stripe. No free credits are assumed.
- Owner activates Identity for the JourneyBuilt business and confirms provider acceptance of the use case. Do not accept business agreements on the owner's behalf.
- Create a **live restricted key** with Identity Verification Sessions read/write (create/retrieve/redact), Identity Verification Results read and Recent Detailed Verification Results read. Store it directly as Vercel production secret STRIPE_IDENTITY_RESTRICTED_KEY. Never send it in chat or put it in a NEXT_PUBLIC variable.
- Configure https://vegasquant.app/api/age/webhook for identity.verification_session.verified, requires_input, processing and canceled; store its signing secret as STRIPE_IDENTITY_WEBHOOK_SECRET. A separate endpoint keeps billing event subscriptions intact.
- Set AGE_VERIFICATION_ENABLED=true only after approval and credentials are ready. This enables the provider flow; it does **not** activate mandatory database enforcement.
- Run disposable provider tests, signature/replay/ownership tests, a live voluntary operator verification, mobile capture/return checks and deletion/redaction acceptance. Test-mode success never grants production access. Check that a delayed return still works: un-IP-restricted keys access detailed results for only 48 hours, so webhook delivery is required.
- Approve the ID/biometric privacy and retention notice, a false-rejection/non-biometric alternative process and monitored support contact with counsel. A checkbox cannot establish legal compliance. The support inbox is still not active.
- After the operator has current proof and provider acceptance tests pass, enable private.age_policy.enforced via a reviewed migration/operator change. Do not blanket-verify existing users or use editable user_metadata as evidence. All 14 existing accounts currently have no verification proof.

## Limits and operations

- Each account reuses its active provider attempt with a stable creation idempotency key. New attempts are capped at three per day. This is not a complete cross-account bot-abuse or provider-billing cap; review Auth CAPTCHA, breached-password protection and provider retry/usage controls before broad launch.
- A failed underage result denies access even while rollout is staged. Unknown/missing DOB requires review; it never silently becomes verified. A failed underage or unknown result can be retried after 24 hours through another provider check; it cannot be manually changed into a pass. A monitored false-rejection/non-biometric alternative process still needs owner/counsel approval.
- Updating the policy version invalidates prior proof. Future migrations that replace guarded member functions must preserve the age guard and associated tests.
- Direct table access is restricted for authenticated accounts, and privileged member RPCs are guarded. Service-side background publishing/settlement remains separate and must preserve immutable historical results.
- New research alert insertions for unverified accounts are suppressed once enforcement is active. Dispatch also rechecks existing queued deliveries before sending research.
- Account deletion and identity creation serialize on the same user row. Unbound in-flight creation blocks the deletion lease until it completes or expires; a deletion lease blocks new identity starts.
- Account deletion inventories owned identity sessions and requests redaction before Auth/application removal. Processing sessions must finish first. Redaction is asynchronous and may take up to four days; already requested redaction is safe to retry. If credentials/provider access are unavailable, deletion fails visibly rather than claiming cleanup.
- Temporary disabling of new checks must not remove restricted credentials needed for existing-session processing/redaction. Never disable enforcement to work around a verification outage without an explicit operational decision.
- Independent verification reduces false declarations; it cannot guarantee nobody lends identity documents or an account. Do not market this as fraud-proof or regulatory approval.

## Validation

- 86 application tests pass, including boundary birthdays, leap dates, invalid/missing DOB, test-mode rejection, missing selfie/live capture, foreign ownership, provider URL validation and erasure ownership/processing rules.
- Exact migration tested in isolated PostgreSQL with schema-only production constraints and the original 15 guarded private function definitions. Related Auth/JWT/trial helpers are local fixtures.
- Rollback fixtures verify metadata does not grant proof, pending/processing denial, foreign-session/result rejection, policy-version invalidation, service-only result permissions, restrictive RLS against permissive owner policies, checkout rejection and restored verified-owner access.
- TypeScript and production build pass. Live provider capture, webhook delivery, mobile flow and live redaction are **not** yet verified.

## Primary documentation

- https://stripe.com/identity
- https://docs.stripe.com/identity/access-verification-results
- https://docs.stripe.com/identity/handle-verification-outcomes
- https://docs.stripe.com/identity/verification-checks?type=document
- https://docs.stripe.com/api/identity/verification_sessions/redact
- https://supabase.com/docs/guides/database/postgres/row-level-security

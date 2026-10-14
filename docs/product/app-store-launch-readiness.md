# Vegas Quant · JourneyBuilt, LLC launch readiness

Updated October 14, 2026. Owner authorized launch preparation, not submission.

## Owner to-do · after work, October 14, 2026

- [ ] Review and approve Stripe Identity's fees and business activation. Approval is still pending.
- [ ] Activate Identity and securely add the live restricted key and webhook signing secret to Vercel. Do not share secrets in chat.
- [ ] Complete live/mobile age-verification and deletion/redaction acceptance tests, plus the remaining consent/support review.
- [ ] After successful testing, enable mandatory 21+ verification for all existing and new accounts. Enforcement remains off until this rollout is ready.

Detailed setup: [age-verification.md](age-verification.md).

## Delivered foundation
- Public About, FAQ, Privacy Notice, Terms, Responsible Play and Help & Support routes, linked in the shared footer.
- JourneyBuilt, LLC operator attribution; 21+ intended audience.
- Signup checkbox with self-declared age and terms/privacy links. Metadata records the declared version/time; user metadata is editable and is NOT immutable consent evidence or authorization. Existing accounts are not retroactively marked as accepting.
- Research distinctions: qualitative analyst target, verified quote, experimental model, official challenge, member content and historical ticket.

## Release blockers — do not claim App Store ready
1. Owner must supply monitored public support/privacy/refund contact, business contact details and approve actual refund/retention policies. Current public pages explicitly disclose missing intake.
2. Counsel review of policy drafts, research/betting-aid classification, external Gambly/sportsbook flows, marketing claims and distribution jurisdictions. A disclaimer does not establish regulatory compliance.
3. Native iOS app/package, organization developer enrollment for JourneyBuilt, LLC, bundle ID, signing, TestFlight and device testing. Current product is a web/PWA app.
4. Data export and final real-device account-deletion acceptance tests. Password-verified erasure, session revocation, atomic app cleanup and linked Stripe cancellation are implemented; see account-deletion.md for validation boundaries and retention exceptions.
5. Community moderation: reports exist; add block-member flow, objectionable-content filtering and tested operational response. Verify admin removal/restriction and public contact. No invented community posts.
6. Review paid digital access under Apple 3.1, territory-specific exceptions and storefront rules. Current Stripe web checkout is NOT automatically an approved iOS purchase implementation. Implement permitted native billing or an approved alternative before review.
7. Audit provider/SDK data flows, analytics events, storage/cookies, international processing, retention and security controls. Complete App Store privacy labels, privacy manifests/required-reason APIs where applicable, age rating and tracking declarations from the final native build. Do not claim ATT or no tracking without verification.
8. Activate and accept-test the prepared independent 21+ verification flow (age-verification.md): provider approval, restricted credentials, webhook, reviewed ID/biometric notices, support/alternative process and enforcement rollout. The prepared server proof ignores editable user_metadata; the signup checkbox alone is not verification.
9. Accessibility, offline, permission-denial, purchases/restore/cancel, auth recovery, deletion and community safety E2E tests on real iPhones; review demo account, screenshots and review notes.
10. Brand/trademark and third-party sports imagery/data licensing review. Update design-system documentation from old Diamond Q identity.

## Current data inventory from code
Supabase account/email; profile/region/avatar/social links; personal tracking and saved legs; community posts/comments/reactions/follows/reports; optional phone contact/consent (SMS inactive); push subscriptions/preferences; onboarding feature events; Stripe subscription/payment identifiers; Vercel hosting; external source/team image requests; local browser session/preferences. Verify deployed provider configurations and native SDKs before final declarations.

## Primary references
- https://developer.apple.com/app-store/review/guidelines/ (1.2 community, 3.1 payments, 4.2 minimum functionality, 5.1 privacy/deletion, 5.3 gaming)
- https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion
- https://developer.apple.com/app-store/app-privacy-details/
- https://www.ncpgambling.org/help-treatment/about-the-national-problem-gambling-helpline/

## Safety implementation update
- Member blocks are owner-private, enforced bidirectionally for post/comment visibility and interactions by RLS/trigger checks; administrators can still inspect reported material. Member profile pages and historical game-comment read paths need a separate review.
- Posting restrictions are admin-only; basic server-side phrase filtering covers selected direct threats, executable-link markers and guaranteed-return claims. This is not comprehensive semantic moderation.
- Account now offers immediate permanent deletion with password verification and typed confirmation. A server-only lease authorizes atomic Auth/application cleanup, and verified Stripe resources are canceled first. Legacy requests remain visible for review. See account-deletion.md for testing and operator safeguards.
- Support inbox is not active: email hosting account/provider and Vercel domain DNS access are missing.

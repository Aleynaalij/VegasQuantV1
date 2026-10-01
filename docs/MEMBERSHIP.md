# Current release

See [2026-10-01 release](RELEASE-2026-10-01.md) for current $5 monthly / $20 season billing and activation requirements. The original setup notes below describe the initial release.

# Vegas Quant 2026 membership

Implemented: public overview with only matchup metadata, bankroll, stage/status and aggregate record; member-only research, markets, picks, results, audit data and ledger. Supabase RLS applies equally to REST, RPC and realtime. Public HTML contains no protected research. Pages refresh access from the authenticated database. No UI-only paywall.

Admins require Supabase TOTP MFA (aal2) plus the private allowlist. The owner enrolls/verifies at /membership, then uses /admin. Losing access to the authenticator requires owner identity verification and recovery; never disable MFA based solely on an email request. Clean PNG export checks admin MFA on the server and uses no-store caching. Member IDs are pseudonymous watermark codes; watermarking is a deterrent, not screenshot prevention.

Prices: full $10 USD, half $7 USD, one-time, 2026 only. Remaining regular-season weeks and playoff rounds are coverage units. The current incomplete unit counts; half rounds up. Expiry is Tuesday 12:00 UTC after the final included unit. Full ends 2027-02-16 12:00 UTC, after the Super Bowl. The off-week preceding the Super Bowl is not an additional unit. Schedule basis: https://operations.nfl.com/calendar-events/nfl-important-dates and https://www.nfl.com/news/2026-27-national-football-league-important-dates . Exact expiration is displayed before checkout and frozen in the order. Date changes require a reviewed migration/extension, never silent shortening of an existing pass.

## Payment setup still required

Connect the owner's Stripe account/sandbox to Vercel project vegas-quant-v1. Configure server-only STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY; APP_URL must exactly match the public origin. Never paste these into chat or put them in NEXT_PUBLIC_ variables. Supabase service-role key is needed only by billing fulfillment, not by browsers. There is no browser membership write path.

Webhook: /api/stripe/webhook. Events: checkout.session.completed, checkout.session.async_payment_succeeded, charge.refunded, charge.dispute.created. Raw-body signature verified. Replays are idempotent. Amount/currency/session checked. Current charge state is fetched before fulfillment to reject refunded/disputed payments even when events arrive out of order. Refunds (including partial) and disputes revoke the associated pass; restoration requires owner review. Test events are acknowledged but deliberately do not grant production membership.

BILLING_ENABLED defaults false. For sandbox set STRIPE_MODE=test and BILLING_ENABLED=true after secrets are installed. Live requires STRIPE_MODE=live, live keys, STRIPE_LIVE_APPROVED=true and BILLING_ENABLED=true. Before enabling live: verify processor eligibility, owner-approved support/refund/privacy terms and business identity, test real sandbox checkout and webhook delivery, configure production email delivery, review legal/tax obligations. Merely returning from Checkout does not grant access. Checkout creation has a per-user pending order lock (31 minutes) to avoid duplicate purchases; existing active passes cannot be purchased again. No automatic renewals/upgrades yet.

## Verification and remaining hardening

npm test covers odds and season coverage. supabase/tests/membership.sql uses rollback-only synthetic fixtures to test anonymous/unpaid denial, paid access, expiry/revocation, admin MFA, price tampering, repeated fulfillment and late events after refunds. No fixture persists. Security advisors reported no table/RPC findings; compromised-password screening is disabled in Supabase and must be evaluated/enabled with the owner's plan. Provider-level auth rate limits remain in effect; no claim of a complete penetration test or zero risk.

Configure a production transactional email provider before scaling registration; default Supabase email limits may block signup volume. Establish scheduled backups and a restore drill before paid launch; repository migrations alone are not data backups. Add monitoring/alert destinations with owner authorization. Domain purchase is owner-controlled and still pending. Changing APP_URL also requires updating Supabase Site URL/redirect allowlist and Stripe webhook URL. No domain was purchased and no payment credentials were created in this release.

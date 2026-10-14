# Account deletion

Implemented October 14, 2026 for the existing email/password membership flow.

## Member flow

Account → Delete account → current password + typed DELETE. The endpoint requires the application origin, a verified confirmed-email bearer token, a live database session and AAL2 when the account has an enrolled factor. The target user ID comes exclusively from authentication. Password verification uses an isolated non-persistent Auth client; credentials are never stored or logged.

The service acquires a ten-minute deletion lease, inventories owned billing resources, expires open checkouts and cancels verified subscriptions immediately without proration, a new invoice or a refund. It then authorizes deletion, revokes refresh sessions globally and calls Supabase Auth deleteUser. A BEFORE DELETE trigger removes application records inside the Auth deletion transaction. Any dependency failure rolls back database cleanup. Billing cancellation and session revocation are external earlier steps and cannot be rolled back; a failure response explicitly says the account remains and billing may already be canceled.

Cleanup includes personal tracking/corrections, profile and inline avatar, community content/interactions, preferences/saved legs, contact/notification records, onboarding events, app billing copies and authentication records. Official published research, tickets and result history are not deleted. Late Stripe checkout/subscription notifications for removed orders are acknowledged without recreating access.

Stripe retains its own receipts/customer/payment history. Hosting/auth provider logs and backups have provider retention rules; no immediate backup purge is promised. Export remains a separate launch requirement. The owner still needs counsel-approved retention/contact policies.

## Operator safeguards

- Public clients cannot acquire or authorize erasure leases. The endpoint holds the existing server-only service-role key.
- Administrator accounts are blocked pending access transfer. Published research author dependencies also prevent accidental removal rather than rewriting historical authors/results.
- New checkout orders cannot begin during a live deletion lease; initializing checkouts block erasure until they finish or expire.
- Current avatars are inline profile images. Future owned Supabase Storage objects block preflight until a tested storage cleanup path exists.
- Personal immutable history has a narrow deletion exception only within the privileged member cleanup transaction. Official immutability is unchanged.
- Direct dashboard/Auth user deletion without an authorized lease is intentionally blocked. Use the member flow; do not disable the guard or perform manual partial cleanup.
- Failed leases are released by the route; expired leases can be retried. No timer/background worker is required for normal completion.
- Legacy deletion requests remain in the administrator queue for review; the queue is not the new deletion mechanism.

## Validation evidence and limits

- 80 application/billing tests pass, including foreign-owner rejection, complete-batch subscription verification, checkout-completion races, cancellation failure and idempotent retries.
- TypeScript and production build pass.
- Exact migration tested in isolated PGlite PostgreSQL using schema-only production columns, identity definitions, check/unique/foreign-key constraints and the relevant immutable triggers. Auth/session/Storage are minimal local fixtures; this does not simulate GoTrue or Stripe.
- SQL rollback fixture verifies unauthorized deletion rejection, service-only privileges, removal of owned personal/billing/avatar/saved rows, preservation of a different member, rollback after a restrictive FK failure and unchanged published-record counts.
- Hosted mutation fixtures could not execute: the connector returned Invalid or expired requestState. Read-only hosted checks confirm 14 accounts, no disposable erasure users and no outstanding jobs. No real member was deleted.
- Security advisory review shows no new erasure-function exposure. Existing intentional authenticated definer RPC notices and disabled leaked-password protection remain separate review items.
- Before App Store submission, run a disposable hosted member through the actual Auth/Stripe flow and test deletion/retry on a real iPhone. These acceptance tests have not been claimed as complete.

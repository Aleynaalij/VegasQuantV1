# Admin operations portal · support and releases

## Inventory and navigation

- Account's admin member portal (#45) handles members, access, and account operations. The Operations queue is separate from member management. Existing administrator intelligence, scorecards and `/admin/feeds` keep their current routes and permissions.
- The support page and #218 describe a contact gap. `community_reports` is a moderation workflow for community objects, and Frank feedback is recipient-specific. Neither is an appropriate general support inbox.
- `/support` links to `/support/report`. Confirmed, non-anonymous signed-in users with a current session and age eligibility can submit a structured malfunction report. A paid plan or tester grant is unnecessary. The form returns a receipt for the submission and gives the submitter no queue or ticket-detail access.
- `/admin/operations` loads an operations home only after the server verifies the bearer session and the database verifies a current MFA administrator. The public page source contains a generic loading shell. The app's existing browser session is used without adding a cookie, admin role claim, or service credential.

## First slice and data boundaries

Reports contain a fixed feature and symptom, a random retry key, and a receipt ID. The queue shows open reports and resolved history separately, newest first, in pages of up to 50. The creation timestamp and ID form a stable cursor, so tied timestamps and newer arrivals do not hide older open work. An admin can open a ticket and move it from New to In review to Resolved. Status updates compare the last seen state and append the audit event in the same transaction. The bounded detail record shows action, status and time; the actor UUID is kept in the private audit table. Timestamps are displayed in UTC. No free text, file uploads, user contact details, raw request bodies or credential fields enter the store. The existing account erasure cascade deletes reports and their events when the reporter is erased and nulls audit actors on their own erasure.

A report retry with the same request ID and selection returns the same receipt. Five new reports per account in a rolling hour are allowed. The database enforces this boundary under a per-reporter transaction lock even for direct RPC calls. Direct table reads and writes are denied to application roles. API responses are uncached and errors contain only fixed states. This draft does not establish a broader ticket retention period or a monitored support SLA.

## Next adapters

| Area | Existing source | Contract and current state |
| --- | --- | --- |
| Service health | `/admin/feeds` and `feed_runs` | Link to the existing desk. A later operations summary can project allowlisted source/status values and UTC last success/check with a per-source stale threshold. Raw details stay out of the portal. Unavailable means no approved observation, not a healthy service. |
| Releases | Git commits and Vercel deployments | The queue response shows the Vercel deployment serving that request, its environment, observation time, and GitHub commit when the runtime identifies the expected repository. Missing metadata stays unavailable. The Vercel dashboard provides history; this view does not verify domain promotion, health, or previous builds. No API token, new database grant, or migration is needed. |
| Traffic | Existing admin engagement metrics | No visitor feed connected. Engagement metrics cannot stand in for visits. A later aggregate needs a documented numerator, time window, timezone, source timestamp and coverage. |
| Support email | #218 contact gap | Not connected. A later intake adapter needs an external message ID for deduplication, receipt time, approved category mapping and a separately reviewed contact/erasure policy. Replies and delivery states require their own authorization. |

The support queue migration shipped with #252. If the RPC is unavailable, the UI reports an unavailable queue. Review retention and additional data sources separately.

## Retention and diagnostic context proposal

Proposed for owner review: keep open reports while they are actionable, review unresolved reports at 90 days, and purge resolved reports and their event histories 90 days after resolution. Account erasure takes precedence. Retain an aggregate count only if a separate policy approves it. This draft implements the erasure cascade, with the 90-day review/purge policy pending. The draft creates no purge schedule.

For more actionable reports, propose optional controlled choices for the failed step (open, refresh, save, or navigate), whether it repeats, and browser versus installed app. Collect these only from deliberate user selections. Avoid free text, URLs, uploads, raw logs, device fingerprints, or automatic telemetry. This batch keeps the current feature/symptom intake while those choices are reviewed.

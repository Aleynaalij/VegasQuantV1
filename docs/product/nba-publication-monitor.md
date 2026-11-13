# NBA three-point Publication Monitor

VQ-AP-001 adds a synthetic, preview-only panel inside Admin Operations. Open **Operations** with an existing MFA administrator session and expand a fixture case. The panel shows the expected output, Eastern slate, scheduled attempts, scheduler result, eligibility, publisher journal, post ID and timestamps. Fixture IDs are synthetic and are displayed as text.

The monitor verifies the original NBA three-point card for the same Eastern slate when the journal and post agree on post identity, attribution and card type. The scheduler is displayed as separate evidence. A successful scheduler run without an output or publisher disposition shows **EVIDENCE_UNAVAILABLE**. **NO_ELIGIBLE_SLATE** requires explicit zero-game evidence. **SKIPPED** and **WAITING** reflect the publisher journal when eligibility is known. An eligible slate before its first scheduled attempt can also show **WAITING**.

## November 12, 2026 investigation

**Unresolved.** The read-only audit found a successful scheduler record for the original NBA three-point workflow and a **WAITING** journal row with no post ID at 10:20 a.m. ET. Eligibility, the cause of the journal state and the final publication outcome remain unverified. A later investigation would reconcile the Eastern slate, journal history and any original Dealer post with independent evidence. No root cause or failed publication is established.

## Access and rollback

The existing Operations list route verifies the bearer, current session, MFA and administrator access before attaching fixture data. The existing origin guard and private no-store responses apply. Fixture inputs are server-owned and only returned when `VERCEL_ENV=preview`. The monitor has no own endpoint, write, publisher call, production evidence query, role change, migration or scheduler change.

To withdraw the preview, close the draft PR and retire its preview deployment, or revert the branch commit to refresh the preview without the panel. Existing protected preview URLs can be retired in Vercel if needed. There is no data rollback, schema reversal or production deployment rollback for this change.

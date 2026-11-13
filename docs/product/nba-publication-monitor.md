# NBA three-point Publication Monitor

VQ-AP-001 adds a synthetic, preview-only panel inside Admin Operations. Open **Operations** with an existing MFA administrator session and expand a fixture case. The panel shows the expected output, Eastern slate, scheduled attempts, scheduler result, eligibility, publisher journal, post ID and timestamps. Fixture IDs are synthetic and are displayed as text.

The monitor verifies the original NBA three-point card for the same Eastern slate when the journal and post agree on post identity, attribution and card type. The scheduler is displayed as separate evidence. A successful scheduler run without an output or publisher disposition shows **EVIDENCE_UNAVAILABLE**. **NO_ELIGIBLE_SLATE** requires explicit zero-game evidence. **SKIPPED** and **WAITING** reflect the publisher journal when eligibility is known. An eligible slate before its first scheduled attempt can also show **WAITING** when both attempts have explicit offsets, are strictly increasing as instants, and fall on the target America/New_York date. Invalid schedule evidence yields **EVIDENCE_UNAVAILABLE** when the classifier needs the schedule. Verified publication and explicit journal dispositions use their own evidence.

## November 12, 2026 investigation

**Unresolved.** The read-only audit found a successful scheduler record for the original NBA three-point workflow and a **WAITING** journal row with no post ID at 10:20 a.m. ET. Eligibility, the cause of the journal state and the final publication outcome remain unverified. A later investigation would reconcile the Eastern slate, journal history and any original Dealer post with independent evidence. No root cause or failed publication is established.

## Access and rollback

The existing Operations list route verifies the bearer, current session, MFA and administrator access before attaching fixture data. The existing origin guard and private no-store responses apply. Fixture inputs are server-owned and only returned when `VERCEL_ENV=preview`. The monitor has no own endpoint, write, publisher call, production evidence query, role change, migration or scheduler change.

To withdraw the preview, close the draft PR and retire its preview deployment, or revert the branch commit to refresh the preview without the panel. Existing protected preview URLs can be retired in Vercel if needed. There is no data rollback, schema reversal or production deployment rollback for this change.

## Manual hosted preview acceptance

1. Open the protected deployment URL for the commit being reviewed. Sign in to Vercel with your authorized project account if prompted. Sign in to VQ with your existing administrator account and complete the normal authenticator challenge.
2. Open `/admin/operations` on that same deployment. Confirm the serving environment is **Preview** and the displayed GitHub commit matches the candidate. Record the commit and time of verification.
3. Confirm the monitor says **Preview · Synthetic evidence**. Expand the five cases and verify **PUBLISHED**, **WAITING**, **SKIPPED**, **NO_ELIGIBLE_SLATE**, and **EVIDENCE_UNAVAILABLE**. For the missing-evidence case, verify scheduler success, four eligible games, an unavailable post ID, and the evidence timestamps.
4. Confirm the November 12 entry remains **Unresolved investigation**. With an ordinary member session or an administrator session before MFA, if available, confirm the panel is hidden. Use an isolated browser session so the positive MFA result remains intact. Keep support-ticket controls out of the test.

The existing preview can verify the hosted MFA flow for its serving commit. The schedule guard is covered by automated regression tests for the hardening commit.

## Proposed GitHub ruleset for main

Read-only audit on November 13, 2026 found `main` unprotected, with no required check contexts and no active branch rules. The current CI workflow runs tests, TypeScript, build, and browser smoke. Its generic check names appear more than once on the audited PR, so the ruleset should use uniquely named checks.

- Target only `refs/heads/main` with an active branch ruleset. Require pull requests, block force pushes and deletions, require resolved review conversations, and leave the bypass list empty, including for automation identities.
- Require at least one independent human with write access to approve, dismiss stale approvals after new commits, and require approval of the latest reviewable push by someone other than its pusher. Verify a distinct eligible reviewer exists before enabling. GitHub identifies the account behind an approval, so a shared automation and reviewer identity cannot establish independence. Keep explicit CEO release authorization as a separate decision. If GitHub must enforce a specific release owner's approval, first establish a distinct eligible owner identity and an enforceable ownership or trusted approval check.
- In a separately approved CI-only change, introduce unique GitHub Actions check contexts `vq-main-verify` and `vq-main-browser` for the existing always-running repository verification and browser jobs. Require both, bind their source to GitHub Actions, and require the PR head to be current with `main`. For the Operations acceptance workflow, add an always-reported uniquely named gate that succeeds for verified out-of-scope changes or requires the Operations checks to pass for matching changes. Require that gate only after its behavior has been demonstrated. A path-filtered job required directly can leave unrelated PRs waiting indefinitely.
- Before activation, verify the exact names and sources on a sample PR. Exercise a failed CI check, stale approval after a push, a direct push attempt, and an out-of-scope change. Confirm a green, independently approved PR meets the rules. Keep the proposal inactive until separately authorized.

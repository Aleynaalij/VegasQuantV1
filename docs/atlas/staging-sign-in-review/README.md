# ATLAS staging password and authenticator process — review request

Status: **PROPOSED / NOT EXECUTED**. This is a separately reviewed operator process, not a deployed endpoint or an authorization bypass. Mike authorized its preparation on 2026-11-19; Claude must approve its exact artifact hash before hosted execution. Production remains NO-GO.

## Fixed scope and prerequisites

- Supabase project: **caynldluziwrzmvuslzg**, exact API origin `https://caynldluziwrzmvuslzg.supabase.co`. Reject all alternate hosts, redirects, project overrides and production credentials.
- Hosting remains the existing protected `atlas-private-access` environment. No variable, provider, route, protection or application-code change is part of this process. Privileged Auth access never enters Vercel.
- Claude must record the D1 → D0 → D1 rehearsal PASS, including production invariants. His approved seven-day identity file remains byte-identical: SHA256 `4cfc305211e5c5153c58bf0e37097f5f720f897dcf0464136fac072d8565f564`. The old identity files must not run.
- A scheduled Elo test window, a working password-manager handoff to **Elo only**, reviewed Auth compatibility evidence, and Claude's sign-off are prerequisites. Immediately before those tests, execute the approved inert identity file under I1; sign-in setup follows. Do not provision identities now to make them wait for review.
- Before credential operations, verify Auth email security notifications for password changes, factor enrollment/removal and identity changes are disabled. Self-service signups stay off, TOTP stays on, SMS stays off. If notification suppression cannot be established without changing settings, stop and submit that exact staging-only setting change for review. An `.invalid` destination alone does not prove no delivery was attempted.

## Exact account boundary

`account-map.json` pins all eight UUID/email pairs. The six controls are copied from the approved identity map; the additional owner aliases are synthetic staging identities, distinct from Mike/Elo's production, Vercel and Supabase organization accounts.

| Account                                 | Eligible paid membership after AAL2 | State retained                            |
| --------------------------------------- | ----------------------------------- | ----------------------------------------- |
| active-verified@vq-fixture.invalid      | Yes                                 | Verified age, active seven-day membership |
| entitled-unverified@vq-fixture.invalid  | No                                  | Age unverified                            |
| revoked-verified@vq-fixture.invalid     | No                                  | Membership revoked                        |
| expired-verified@vq-fixture.invalid     | No                                  | Membership expired                        |
| not-started-verified@vq-fixture.invalid | No                                  | Membership starts +7 days, ends +14 days  |
| unentitled-verified@vq-fixture.invalid  | No                                  | No paid entitlement                       |
| mike-owner@vq-fixture.invalid           | Yes                                 | Proposed separate synthetic owner         |
| elo-owner@vq-fixture.invalid            | Yes                                 | Proposed separate synthetic owner         |

Every account still needs a live AAL2 session and its explicit private-access allowlist/entitlement. The six controls deliberately have gate access at AAL2 so their distinct age/member denials can be tested. **Negative paid-member authorization does not mean every free Home read must fail**: verified free users retain the reviewed free-Home behavior. Do not change these controls to manufacture a uniform denial.

The two additional owner UUIDs are pinned in the map. Proposed owner creation uses the documented Auth Admin `createUser` operation with that exact UUID/email, a vault-generated password and `email_confirm: true`; it must not send an invitation. The included `owner-support.sql` transaction then adds only those two UUIDs to `private_development_owners`, gate entitlements, verified fixture age, and fixture member entitlements (start execution time minus one hour; expire execution time plus seven days). Its preconditions require exactly the six approved control allowlists, 12 synthetic users including the exact two confirmed owners, and zero sessions; repeat execution refuses. SQL cannot authenticate the remote project, so the caller must pin the staging connector out-of-band. Owners get the same member/gate rights as the active control: **no application admin, Dealer, contributor, role, policy or schema grants**. Do not derive authorization from user metadata.

Expected totals after both stages: original four synthetic users plus six controls plus two owners = **12** users; **8** new gate allowlist and gate entitlement rows; original fixture rows remain byte-preserved. Claude must review the exact included owner-support transaction and its hash along with this process before introducing those rows.

## Operator execution, after the gates above

1. On an isolated operator workstation, verify the exact reviewed process/map hashes, target, original data/catalog preservation checks and the six inserted UUID/email pairs. Any mismatch or pre-existing password/factor on a target account is a stop condition, not permission to overwrite it. Record only counts and pass/fail evidence.
2. Establish narrowly controlled **staging-only** Auth Admin access outside Vercel, source control, CI and this chat. Use a dedicated SDK client with `persistSession: false`, `autoRefreshToken: false` and `detectSessionInUrl: false`; pin the existing `@supabase/supabase-js` version 2.117.2 and lockfile. A privileged local credential must be obtained through the operator's secure facility, never retrieved into conversational tool output, supplied as a command argument, or shared with Elo. Revoke temporary privileged access after setup where the credential mechanism supports revocation. Otherwise destroy local copies; do not rotate a shared project key without a separate reviewed change.
3. In the password manager, generate a different CSPRNG password of at least 32 characters for each of the eight entries. Only UUID/email and status appear in the public execution record. Keep passwords, TOTP seeds/URIs/QRs, access/refresh tokens and active authenticator codes out of GitHub, chat, stdout/stderr, shell history, screenshots, telemetry, browser traces and committed or temporary plaintext files. Use protected in-memory transfer or the password manager's local secure interface; if that route is unavailable, stop. Never paste a credential into an agent tool argument.
4. For each existing control, retrieve it by pinned UUID using the Admin API, match the email, then use `auth.admin.updateUserById(id, { password })`. Change no age, entitlement, membership or allowlist fields. For owners, use the exact create/support-row procedure above after its separate transaction review. Do not delete/recreate existing users or replace UUIDs. Never call signup, invite, email OTP, magic link, resend, recovery email or SMS operations.
5. For each account, create a distinct ordinary publishable-key client with persistence and refresh disabled. Call `signInWithPassword` to establish a temporary AAL1 enrollment session. Use the ordinary `auth.mfa.enroll({ factorType: 'totp', friendlyName: 'ATLAS staging test' })`, transfer the returned seed directly to its protected vault item, and verify a current code from that authenticator using `challengeAndVerify`. Require exactly one verified TOTP factor and an AAL2 session. These are real staging enrollment sessions and therefore occur **only after the rollback PASS and this process's execution approval**. Do not insert MFA secrets/status or fabricate AAL2/session rows with hosted SQL.
6. End every enrollment session with global sign-out, clear the in-memory clients and local token material, and verify there are no remaining setup sessions for these eight UUIDs. Do not hand an enrollment session to Elo. If global sign-out does not remove the setup session, stop; keep that account blocked rather than assuming an unexpired token is invalid. Enroll users sequentially to avoid cross-user token/factor confusion.
7. Grant **Elo only** access to the eight test-credential entries through the agreed password manager, with an end time matching the test window and audit of the share ACL. Do not create a public/share-link fallback or send secrets through GitHub/chat. Elo signs in through Vercel Authentication and the staging password+TOTP page with fresh sessions. The first authorized app session is also the point for Claude's queued bundle scan and post-sign-in webhook/dispatch isolation probes. Complete negative controls before member journeys.

## Compatibility and rehearsal evidence

The committed native authorization rehearsal runs the exact approved preparation, free-Home and seven-day identity artifacts in a disposable loopback PostgreSQL 17 cluster. It adds the proposed two owners **locally only**, models AAL1/AAL2/live/deleted sessions, and exercises the installed gate and membership functions as `authenticated` with per-user claims. It does not set passwords or enroll factors.

`authorization-rehearsal.json` records:

- all **8/8** accounts deny private access with AAL1;
- all **8/8** explicit gate allowlists pass with a live AAL2 session;
- active control and both proposed owners pass member authorization; **5/5** negative controls deny paid membership;
- all **8/8** deny the gate after their session row is removed;
- all **33/33** catalog/preservation assertions pass after cleanup, with **0 sessions** remaining;
- the exact included owner-support transaction succeeds once and refuses repeat execution without changing its prior result.

Reproduce from the repository root with a native PostgreSQL 17 binary directory and the existing temporary `pg` driver (the harness accepts no remote DSN):

```sh
ATLAS_REPLAY_PG_BIN=/path/to/postgresql17/bin \
ATLAS_REPLAY_PG_MODULE=/path/to/pg/lib/index.js \
bash scripts/operations/atlas-staging-sign-in-rehearsal.sh /path/to/disposable-output
```

**Open execution gate:** this is authorization evidence, **not a real Auth/password/TOTP enrollment rehearsal**. Before hosted execution, reproduce the credential/enrollment sequence with an isolated local Supabase Auth service matching the hosted version, a local mail sink with zero deliveries, and the same inert-user shape. In particular, verify that `updateUserById` makes the SQL-created inert users password-sign-in compatible without changing UUIDs or silently repairing provider identity rows. If normal Admin APIs cannot do that, submit a separate exact compatibility artifact and rehearsal to Claude; do not improvise writes to `auth.identities`, password hashes or MFA internals. The eight-account Auth rehearsal must also prove fresh password+TOTP login, AAL1 denial, all five member denials, active success, logout/revocation and zero email/SMS requests. No claim is made that this missing Auth rehearsal has passed.

## Stop and cleanup

Stop on target or UUID drift, notification/provider activity, failed vault handoff, unexpected identity/factor/session, changed original data/catalog/permissions, failed denial, or lost protection. Do not continue provisioning other accounts after a failure. Partial setup is not a completed handoff.

At the end of tests (or a partial setup failure), revoke the affected UUIDs' gate allowlist/entitlement first; end their sessions and verify stale tokens fail the live gate. Use the normal Auth Admin API to ban the eight temporary identities and remove their exact recorded test factors as applicable; do not bulk-remove unrelated factors/accounts or depend on password rotation alone for revocation. Verify zero test sessions, preserve original rows and revoke Elo's vault share. Keep only redacted counts, UUIDs and timestamps as evidence. Any additional cleanup SQL requires its exact target-pinned review before execution.

## Current sources checked on 2026-11-19

- Supabase changelog: https://supabase.com/changelog.md (the CLI v3 breaking change is avoided; this process uses no hosted CLI mutation).
- Admin password update: https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid
- Admin user creation: https://supabase.com/docs/reference/javascript/auth-admin-createuser
- Authenticator enrollment: https://supabase.com/docs/reference/javascript/auth-mfa-enroll
- MFA/TOTP: https://supabase.com/docs/guides/auth/auth-mfa/totp
- Optional security notification delivery: https://supabase.com/docs/guides/local-development/customizing-email-templates

This submission requests review of the process, exact owner-support SQL, account boundary and authorization evidence. The real Auth rehearsal and secure operator/password-manager path remain explicit prerequisites to execution, not implied approvals or completed work.

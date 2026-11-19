# Real Auth rehearsal and proposed inert-user compatibility change

**Review request only. No hosted execution.** This supplements the approved process design; it does not authorize changing the approved seven-day identity file or executing an additional hosted mutation. Elo remains the operator and sole credential holder.

## Finding

Read-only staging `/auth/v1/health` reports **v2.198.0**. The official amd64 release archive matches its published digest; `runtime.json` pins the archive, binary and existing SDK version. Read-only staging column metadata confirms `auth.users.instance_id`, `confirmation_token`, `recovery_token`, `email_change_token_new` and `email_change` have NULL defaults.

The unchanged approved `identities-seven-day.sql` leaves those fields absent. On a genuine Auth v2.198.0 schema, a normal Admin `updateUserById` therefore returns **user_not_found** before password setup. `baseline-rehearsal.json` records this expected failing baseline. The version-pinned Auth implementation finds users with `instance_id = uuid.Nil`, so SQL NULL is not discoverable by that lookup. After correcting that discriminator locally, NULL string/time metadata also needs normalization for the managed Auth user model. These are fixture-construction problems, not reasons to disable the gate or manufacture provider/MFA/session records.

Primary implementation inspected: https://github.com/supabase/auth/blob/v2.198.0/internal/models/user.go (`FindUserByID`, `User`), plus the normal Admin password-update path in https://github.com/supabase/auth/blob/v2.198.0/internal/api/admin.go.

## Exact compatibility proposal

`compatibility.sql` is a separate, single-use transaction for **caynldluziwrzmvuslzg only**, pinned by the caller out-of-band. It requires ten synthetic users, six existing gate allowlists, the enabled gate, zero sessions, and the exact six approved confirmed UUID/email pairs with NULL instance IDs and no password, identity or MFA setup. Any existing recovery/confirmation/email-change token content refuses execution.

For those six rows only, it:

- changes NULL `instance_id` to `00000000-0000-0000-0000-000000000000`;
- normalizes absent `confirmation_token`, `recovery_token`, `email_change_token_new` and `email_change` to empty strings, without issuing tokens;
- fills NULL `created_at`/`updated_at` from the existing `email_confirmed_at`, preserving non-NULL timestamps.

It does not change UUIDs, emails, confirmation state, passwords, age/member windows, allowlists, grants or functions. It never writes `auth.identities`, MFA internals or sessions. Passwords and factors are then handled through the normal Auth APIs. The approved identity and owner-support SQL hashes remain unchanged.

**Proposed order, pending Claude's explicit approval of this new SQL:** verified D1 restoration and notification-off evidence → approved identities under I1 → this compatibility transaction → owners via Admin `createUser` → unchanged approved `owner-support.sql` → Elo's password/TOTP enrollment and fresh test sessions → Claude's post-sign-in probes. This new step must not be silently inserted into the previously approved process.

## Rehearsal method and limits

The loopback-only harness first runs the approved native preparation/free-Home/seven-day identity rehearsals. It then replaces the disposable managed-Auth stand-in tables with genuine Auth v2.198.0 migration output, copies only the original four synthetic baseline users and retargets local application FKs. It executes the approved seven-day identity SQL byte-identically against those real Auth tables. These platform substitutions occur only inside the temporary local cluster; they are not hosted preparation instructions.

The Auth server listens only on loopback, with a local `/auth/v1` prefix proxy for the unchanged Supabase SDK methods. A temporary signing key, passwords, tokens and TOTP seeds stay in process memory and the disposable Auth database; no plaintext credential files or Auth service logs are produced. The cluster is destroyed on exit. No staging/production credential enters the harness. A positive control proves the SMTP and SMS sinks count requests before their counters are reset for the Auth run.

The candidate report proves, **with the proposed compatibility SQL locally applied**:

- six normal Admin password updates and two normal Admin owner creations preserve the pinned UUIDs;
- real password login reaches AAL1, which the installed database gate denies for all eight accounts;
- real TOTP enrollment/challenge/verification reaches AAL2 and the gate passes for all eight;
- five negative controls still deny paid membership, while the active control and both owners pass;
- all eight accounts can make a fresh password+TOTP login after enrollment sessions are globally signed out;
- real global sign-out makes the previous token fail the live-session gate; zero sessions remain;
- all 33 catalog/preservation checks pass; compatibility rollback restores the prior state and repeat execution refuses;
- zero SMTP connections and zero SMS sink requests occur during Auth operations, including shutdown.

The database authorization checks use the actual Auth-issued, signature-verified JWT and the actual Auth-created session in that same database. No AAL2/session row is fabricated. Protected browser journeys and post-sign-in provider probes still belong to hosted acceptance; this is not a claim that those have passed. Provider identity row counts are recorded as observations: the normal owner creation makes two email identities; this harness never repairs the six controls' provider identities with SQL, and real password/TOTP login still succeeds.

## Reproduce

Extract the exact checksum-verified release archive listed in `runtime.json` into a temporary directory, preserving its binary and bundled `migrations` directory. Provide the existing PostgreSQL 17 and temporary `pg` driver paths. No remote DSN or hosted key is accepted.

```sh
ATLAS_AUTH_BIN=/temporary/auth-release/auth \
ATLAS_REPLAY_PG_BIN=/temporary/postgresql17/bin \
ATLAS_REPLAY_PG_MODULE=/temporary/pg/lib/index.js \
bash scripts/operations/atlas-real-auth-rehearsal.sh /temporary/evidence
# Expected exit 1: baseline updateUserById returns user_not_found.

ATLAS_AUTH_BIN=/temporary/auth-release/auth \
ATLAS_REPLAY_PG_BIN=/temporary/postgresql17/bin \
ATLAS_REPLAY_PG_MODULE=/temporary/pg/lib/index.js \
bash scripts/operations/atlas-real-auth-rehearsal.sh /temporary/evidence --candidate
# Expected exit 0: candidate-rehearsal.json PASS.
```

The root process README's execution remains blocked pending Claude's exact compatibility-hash review, his final D1 verification, and Mike's dashboard evidence that security notification emails are off. No hosted account, password, factor or session has been created.

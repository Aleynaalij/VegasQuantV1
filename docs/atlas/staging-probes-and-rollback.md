# ATLAS staging: isolation probes and rollback rehearsal

Prepared by Claude ahead of Codex's deployment so the checks run the moment the final candidate is on
`atlas-private-access`. Staging only: Supabase `caynldluziwrzmvuslzg`, Vercel custom environment
`atlas-private-access` on project `vegas-quant-v1`. **Production (`uowearboulykfcwnuirn`,
`vegasquant.app`) is never a target**; it is only read, before and after, to prove nothing moved.

No real member sessions until every isolation row passes and Mike accepts it (#294).

## Tools

| File                                                      | What it does                                                                                                                                                                          | Writes?                                       |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `scripts/operations/atlas-staging-catalog-assertions.sql` | One `SELECT`: 14 isolation checks, 9 post-preparation checks (M1, M2, F3, gate, `published_legs` view and archive), 10 data-preservation digests against the 2026-11-19 baseline.     | No                                            |
| `scripts/operations/atlas-staging-probes.mjs`             | HTTP probes on the protected deployment: Vercel protection without access; guarded routes refuse; shipped HTML/JS names only the staging project and has no production URL or secret. | No (empty-body requests that must be refused) |
| `tests/atlas-staging-probes.test.ts`                      | Unit tests for the probe classifiers.                                                                                                                                                 | —                                             |

The catalog assertions ran against staging on 2026-11-19 before any preparation: **14/14 isolation
PASS, 10/10 preserved PASS, 9 prepared NOT_PREPARED** (expected until Codex's approved preparation).

## Production invariants (read before and after every staging step)

| Invariant             | Baseline 2026-11-19                                                          | Read with                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Production deployment | `dpl_8dCL41hbSPhjYebGywC5M4RRjoxk`, commit `8ea6c4a` (#307)                  | Vercel `list_deployments` target=production                                                                                |
| Production migrations | 180 rows, latest `20261118010000`, digest `6d2d6b44f16eabc800712a9d0d4a1bed` | `select count(*), max(version), md5(string_agg(version, ',' order by version)) from supabase_migrations.schema_migrations` |
| Production domain     | `vegasquant.app` serves the production deployment                            | Vercel project domains                                                                                                     |

Any change to these that was not a separately approved production release stops the staging run.

## Run order on Codex's final SHA

1. **Before preparation:** catalog assertions → isolation all PASS, preserved all PASS. Record
   production invariants.
2. **After approved preparation** (preparation SQL hash signed off): catalog assertions → isolation,
   prepared and preserved all PASS. Any `FAIL` stops; the preparation transaction design means a
   failure before commit leaves nothing behind.
3. **After deployment to `atlas-private-access`:**
   - Confirm the deployment's commit is the final SHA and its target is the custom environment, not
     Preview or Production (Vercel `get_deployment`).
   - Env var names on the custom environment are only the allow-listed set; no Stripe, Resend,
     Sportradar, VAPID, service key, database URL or dispatch/webhook/collector token.
   - `node scripts/operations/atlas-staging-probes.mjs --url https://<deployment>.vercel.app` (phase 1),
     then again with `--share-url <Vercel shareable link>` for phases 2–3. The share link is temporary
     viewer access and changes no project setting. Behind a proxy set `NODE_USE_ENV_PROXY=1`; the
     host must be reachable from wherever it runs.
   - Supabase URL Configuration: Site URL and redirect allowlist set to that deployment host only.
4. **Rollback rehearsal** (below), then probes and catalog assertions again.
5. Re-read production invariants: unchanged.

Only then: owner MFA sessions, Elo's member journeys.

## Rollback rehearsal

What "rollback" means here, so the rehearsal tests the real thing:

- **Application:** return `atlas-private-access` to the previous good deployment. This is the only
  rollback exercised in staging. The database keeps the gate and the archived `published_legs`
  (README: "an application rollback retains the gate and archived data").
- **Database before commit:** the preparation runs in one transaction; abort = rollback. Rehearsed by
  Codex in the disposable local replay (M4), not on hosted staging.
- **Database after commit:** no schema reversal in this phase. A reversal needs retired sessions,
  dependency checks and its own review; old definer bodies or grants are never restored while
  tokens are live.

Steps (staging only):

1. Record the current `atlas-private-access` deployment (D1, final SHA) and the previous good one
   (D0: the prior candidate deployment on the same environment; if there is none, Codex deploys the
   prior candidate SHA to the same environment first).
2. Run the probes against D1: all PASS.
3. Roll back: redeploy D0 to `atlas-private-access` (dashboard "Redeploy"/"Instant Rollback" scoped to
   that environment, or `vercel redeploy <D0 url> --target=atlas-private-access`). **Never** promote to
   Production; never touch the production domain.
4. Verify: the environment's current deployment is D0; probes all PASS on D0 (protection, guarded
   routes, clean bundle); catalog assertions unchanged (isolation and preserved PASS; the gate and
   archive still present).
5. Roll forward: redeploy D1 to the same environment; probes all PASS again.
6. Re-read production invariants: deployment, migrations digest and domain unchanged.
7. Record times, deployment IDs, SHAs and every result row on #294.

Pass = every step's checks pass and production invariants are unchanged. Anything else is a `FAIL`
with the failing row, and no real session starts.

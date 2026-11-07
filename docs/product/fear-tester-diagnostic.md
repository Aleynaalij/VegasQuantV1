# Fear tester diagnostic

This draft is for the independently approved one-account check on PR #243. It exercises the scoped tester RPCs with the actual browser session and explicitly selects tester mode in the Fear reader. It tests the server-authorized path even when the normal UI would choose an existing paid or admin entitlement. It does not establish how an ordinary free account navigates the unmodified product.

## Temporary preview setup

Use the existing Git integration and deployment protection on `codex/fear-tester-diagnostic-temporary`, based on `cbfe915751023614f6819381f7b292d836b25d52`. The build and server both require Vercel to supply `VERCEL_ENV=preview` and `VERCEL_GIT_COMMIT_REF=codex/fear-tester-diagnostic-temporary`. Verify the protected preview uses the approved Supabase project before signing in. If Vercel omits either value, stop and report the failed guard.

The `page.preview.tsx` entry is included only when both values match at build time. The server checks the same predicate at runtime. CI checks the exact match, ordinary previews, missing values, and mismatches. The production check supplies the matching branch and legacy opt-in and verifies route, bundle, and HTTP exclusion. Runtime mismatch tests verify a not-found response without the diagnostic client bundle. The route has no navigation entry and is marked noindex.

## Browser steps

1. Open the protected preview and sign in normally using the existing account approved for the canary. Enter `/fear-tester-diagnostic` in the address bar on the same preview origin. The page can link to the normal sign-in page when needed.
2. Select NFL, choose **Load games**, select an upcoming event, and select **Run diagnostic**. Repeat for NBA. The page checks both entitlements. For allowed scopes it shows counts from tester quote and injury RPCs, NFL Research context, and the real paginated Fear reader. The deliberate Fear context probe should return **invalid scope**. Zero rows means the selected source has no rows in scope. Partial coverage is labeled separately.
3. For a denied, revoked, or disabled signed-in case, the affected entitlement should be **false**, its fixed quote probe should be **denied**, and there should be no history for a denied Fear entitlement. For signed-out verification, **Load games** should prompt sign-in. **Cancel read** clears the current evidence, and signing out or switching accounts clears evidence from the old session.
4. Record only the visible eligibility, counts, coverage and sanitized statuses. Keep real-session results separate from the synthetic CI cases. The page has no field for credentials or account IDs and no raw data export. It never changes grants, roles, or account settings.

After acceptance, remove the temporary deployment and delete the temporary branch. Close any disposable CI review and delete its base branch. Do not merge, cherry-pick, or promote this branch. Remove the original default-off diagnostic entry, supporting modules, preview extension opt-in and diagnostic-only tests from the release stack as part of final cleanup. Normal Fear and Research use their existing routes and authorization.

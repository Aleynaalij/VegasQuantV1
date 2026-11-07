# Fear tester diagnostic

This draft is for the independently approved one-account check on PR #243. It exercises the scoped tester RPCs with the actual browser session and explicitly selects tester mode in the Fear reader. It tests the server-authorized path even when the normal UI would choose an existing paid or admin entitlement. It does not establish how an ordinary free account navigates the unmodified product.

## Proposed preview setup

After approval, use an isolated, protected Vercel Preview of the reviewed head. Keep its existing Vercel protection. For that preview deployment only, set `VQ_FEAR_TESTER_DIAGNOSTIC=1` at both build time and runtime. Vercel must provide `VERCEL_ENV=preview`. For example, a separately authorized Preview CLI invocation from the exact reviewed checkout can pass `--build-env VQ_FEAR_TESTER_DIAGNOSTIC=1 --env VQ_FEAR_TESTER_DIAGNOSTIC=1`. The default project settings need no update. Verify the preview uses the approved Supabase project before signing in.

The route entry uses the `page.preview.tsx` extension. Next.js recognizes it only for a Preview build with the explicit opt-in. The server page also checks the runtime environment and opt-in. The production build check deliberately supplies the opt-in with `VERCEL_ENV=production` and checks the route manifest, bundles, and HTTP 404. The browser suite also checks the opted-in preview and the 404 when runtime opt-in is absent. The diagnostic has no navigation entry and is marked noindex.

## Browser steps

1. Open the protected preview and sign in normally using the existing account approved for the canary. Enter `/fear-tester-diagnostic` in the address bar on the same preview origin. The page can link to the normal sign-in page when needed.
2. Select NFL, choose **Load games**, select an upcoming event, and select **Run diagnostic**. Repeat for NBA. The page checks both entitlements. For allowed scopes it shows counts from tester quote and injury RPCs, NFL Research context, and the real paginated Fear reader. The deliberate Fear context probe should return **invalid scope**. Zero rows means the selected source has no rows in scope. Partial coverage is labeled separately.
3. For a denied, revoked, or disabled signed-in case, the affected entitlement should be **false**, its fixed quote probe should be **denied**, and there should be no history for a denied Fear entitlement. For signed-out verification, **Load games** should prompt sign-in. **Cancel read** clears the current evidence, and signing out or switching accounts clears evidence from the old session.
4. Record only the visible eligibility, counts, coverage and sanitized statuses. Keep real-session results separate from the synthetic CI cases. The page has no field for credentials or account IDs and no raw data export. It never changes grants, roles, or account settings.

After acceptance, retire the opted-in preview. A default-off preview build omits the route. Setting runtime opt-in off also makes an existing preview return 404. Remove the diagnostic entry, supporting modules, preview extension opt-in and diagnostic-only tests from the release stack as part of the final cleanup. Normal Fear and Research use their existing routes and authorization.

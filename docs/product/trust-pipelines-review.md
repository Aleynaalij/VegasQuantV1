# Trust and pipeline review — draft, November 5, 2026

Assignment: [TRUST-PIPELINES-01](https://github.com/Aleynaalij/VegasQuantV1/issues/65#issuecomment-6664833262).
Baseline: `6cadc283608b655fc4321ab7144bec7533fbfea6`. Preparation only; no release or live operation.

## T1 — record promise

`src/components/desk.tsx` gates `/history` and `/performance` with `useIsAdmin()`;
`src/lib/use-admin.ts` checks the current account and assurance level through `is_admin`.
Membership's public-official-record and personal-tailed-record promise contradicted that access.
This draft removes that promise and identifies the administrator restriction in both free and
active Premium explanations. Separate sport aggregate `/nba/records`, `/nhl/records` and
`/ncaab/records` routes remain as implemented. No entitlement, route, RLS or grant changes.
The closely related FAQ in `src/lib/product-pages.ts` distinguishes NBA and NFL records but
makes no corresponding public-official-history promise; no legal text rewritten.

## T2 — support contact acceptance

| Surface | Source | Current limitation |
| --- | --- | --- |
| Membership billing/refunds | `src/components/membership.tsx` | Formerly directed readers to an unnamed administrator; draft now states destination unconfirmed |
| Support | `src/lib/product-pages.ts`, support.contact | Explicitly says monitored email not supplied |
| Privacy requests | Same file, privacy | Refers to Help & Support and contact being prepared |
| Terms/contact | Same file, terms | Refers to Help & Support; final policies need review |
| Subscription cancellation | Account payment management | Existing self-service action; separate from refunds |
| Account deletion | Account deletion component | Existing password/DELETE action; separate from cancellation/refund |

Required owner decisions: verified monitored inbox or intake URL; named operational owner for
support, privacy and refunds (one person may hold all three); authorized access and backup coverage.
Historical mention of an intended inbox is not evidence of a working monitored destination.

Before activation: confirm ownership, send/receive a synthetic non-sensitive request, verify
routing for each category, mobile/desktop link behavior, privacy of submitted information,
backup coverage and cancellation/deletion accessibility. Replace all placeholder contact wording
consistently only once verified. Do not invent an SLA, refund entitlement or legal commitment.
No inbox, account, form, contact publication or outbound message is created here.

## Queue and review state

| Item | State in this first draft | Remaining acceptance |
| --- | --- | --- |
| T1 | Copy correction prepared; browser fixtures added | Read actual browser/CI results; screenshots; confirm unchanged signed-out/member/admin access |
| T2 | Inventory and acceptance prepared | Owner supplies and verifies destination and responsible people |
| P1 | Baseline inspected; not complete | Source-linked inventory across all existing pipelines and evidence |
| P2 | Reproducible status presentation concern identified; not implemented | Fixed NFL provider list and universal 30-minute job alarm are not multisport quote coverage proof; reconcile per-provider cadence first |
| P3 | #200 source read; review incomplete | Exact-head composed fixtures and compatibility review; alert/settlement design |
| D1 | Not started | Publisher identity/provenance proposal and clearly labeled draft |
| Q1 | In progress | Consolidated final-head validation/correction packet |

P2 evidence: `src/lib/feed-health.ts` tracks six NFL providers and checks `created_at` against
30 minutes. `docs/product/odds-cadence.md` documents NHL/college refresh intervals from 25 minutes
to three hours, while quote selectability stays under 30 minutes. Job time and quote source time
are different contracts. Do not widen quote TTL or change production cadence to turn status green.

Existing dependencies are preserved: #105 membership/onboarding remains open; #215/#216 and
`codex/story-24h-integration` are separate story work; KALSHI-LINK-POST remains separately queued.
Notification #200 (`codex/notification-access-contracts`) is a prepared migration, not applied
by this work. No independent notification replacement or sensitive reproduction published.

## Verification

`records-membership.mjs` already runs in `.github/workflows/ci.yml` and now covers truthful
copy for signed-out, ordinary member, failed status and admin fixtures, plus direct history/
performance access. Existing failed-membership Retry cases are retained. Screenshots are written
to `/tmp/trust-membership-*.png` during local execution. An opt-in `record-promise` negative
control deliberately fails with an identifiable message; its execution must be reported separately.
All browser data is synthetic, never a real account or current provider coverage claim.

### Actual first-packet results

- 528/528 repository tests passed; TypeScript passed; final production build passed.
- Browser script syntax passed. Browser execution blocked before fixtures: Chromium exited
  SIGABRT with sandbox `Operation not permitted` errors. No browser pass or screenshots claimed.
- Negative control not run: it injects unsupported public-record text before the ordinary
  assertion, which must reject it. CI wiring for the positive script already exists.
- Git HTTPS push failed because no terminal credentials were available. The GitHub connector's
  tree upload was then rejected by automatic approval review: it considered full changed source
  and coordination-history upload insufficiently explicitly authorized. No remote branch/PR
  was created by this session. No bypass or retry after rejection.
- Draft upload is blocked pending explicit owner approval. Local changes remain reviewable;
  no merge/deploy/migration/publication occurred. This packet does not complete P1–D1.

# TRUST-PIPELINES-01 consolidated review packet

Prepared November 5, 2026; **not a release approval**. Audited base:
`6cadc283608b655fc4321ab7144bec7533fbfea6`. No production query, migration application, collector/
shadow rerun, settlement invocation, publication, account/role change or paid-provider change.

## Deliverables and exact dependency state

| Item | State | Source / branch / PR | Acceptance and limits |
| --- | --- | --- | --- |
| T1 truthful record copy | Prepared, remote checks passed | [Draft #218](https://github.com/Aleynaalij/VegasQuantV1/pull/218), `codex/trust-pipelines-01`, head `ffd8400b4943848f9207d5c55945c38e9a93ee5d`, base above | verify, ui-smoke, journey, integrated-journeys, coordination all SUCCESS; synthetic membership/access checks, not a production session; not merged |
| T2 support requirement | Prepared; activation blocked on destination/owners | #218 `docs/product/trust-pipelines-review.md` | No usable monitored inbox/intake verified; no account, contact or SLA invented |
| P1 automation inventory | Source audit complete | [pipeline-inventory.md](pipeline-inventory.md); `codex/pipeline-review-docs` | Existing NFL/NBA/NHL/college collection/result/research/publication/notification paths reconciled; all current deployed runtime state explicitly unverified |
| P2 bounded health fixes | Implemented and locally tested; release acceptance incomplete | `codex/pipeline-health-review`, tested local `11aa947119391ae1512779f7801a8361bd61ce9d`; [draft #219](https://github.com/Aleynaalij/VegasQuantV1/pull/219) remote head `4afceb6458c85d5c22cb57fdc0d90206b61e3ec4`, base above | Failures remain visible after becoming stale; outcome/age and retrieval/check evidence separated; dashboard scope corrected. Existing thresholds/cadences/provider budgets unchanged. Browser/remote CI blocked/unrun |
| P3 alerts/settlement + #200 | Draft design/review complete; supplemental regressions prepared | [pipeline-alerts-settlement.md](pipeline-alerts-settlement.md); [#200](https://github.com/Aleynaalij/VegasQuantV1/pull/200) exact `e94204fe0485a81a00acd0f1a728d054ca0a3664` | Original and composed SQL fixtures pass; local test-only extension passes; migration UNAPPLIED, no transport send, no competing implementation |
| D1 VQ Dealer | Proposal/template complete; identity/publication decisions outstanding | [vq-dealer-plan.md](vq-dealer-plan.md) | Future-only editorial attribution proposed; original MikeQ author/history and journals preserved; no publisher entity/account created or post published |
| Q1 review packet | Local packet prepared; combined release not ready | This packet + source-linked documents | Exact blockers and validation below; no claim of deployed/live completion |

The documentation branch is independent of the health-code branch. Future draft PRs should stay
separate: (a) bounded health presentation/helper/tests; (b) inventory/design/review documentation.
#218 is an existing independent copy fix. #200 remains the sole notification implementation;
adopt the supplemental test patch there, never replace/rewrite its branch. Story #215/#216,
`codex/story-24h-integration`, Kalshi incoming-link work and #105 onboarding remain separate.
No files in those feature implementations were changed.

## Changed files

Health branch (five files): `src/lib/feed-health.ts`, `src/components/feed-health.tsx`,
`tests/feed-health.test.ts`, `scripts/ui-smoke/feed-health.mjs`, `.github/workflows/feed-health.yml`.
No SQL/API/collector/schedule/auth changes. The pure `feedRunHealth` helper accepts an explicit
job age threshold; it never establishes quote freshness or invents a multisport threshold.

Documentation branch: `docs/product/pipeline-inventory.md`, `pipeline-alerts-settlement.md`,
`vq-dealer-plan.md`, `pipeline-review-packet.md`, plus the test-only
`notification-review-regressions.patch`. The patch applies to the existing #200 SQL fixture,
not to production migrations. All paths in source-linked documents were checked to resolve.

## Actual validation

| Check | Result | Evidence / meaning |
| --- | --- | --- |
| `npm test` on health implementation | **531 passed, 0 failed/skipped** | Complete ordinary repository test discovery; `/tmp/vq-pipeline-tests.log` |
| `npm run typecheck` | **Passed** | `/tmp/vq-pipeline-typecheck.log` |
| Stub-configured production webpack build | **Passed** | `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`; `/tmp/vq-pipeline-build.log` |
| Final formatted health unit tests | **6 passed** | `/tmp/vq-pipeline-final-unit.log`; formatting was the only change after the full checks |
| Targeted composed result/social SQL suites | **15 passed, 0 failed/skipped** | `node --test --test-concurrency=2` across automatic-results, nba-results, sports-backend, sports-incomplete-final-pending, sports-result-attempts, social-notifications, zone-post-notifications; `/tmp/vq-pipeline-sql.log` |
| #200 exact head SQL | **6 passed** | Isolated e94204f worktree; `/tmp/vq-notification-review.log` |
| #200 plus current main SQL | **6 passed** | Clean uncommitted composition in isolated worktree, no branch rewrite; `/tmp/vq-notification-composed.log` |
| #200 supplemental email/per-type/lease regressions | **6 passed** | Test-only extension of existing case; `/tmp/vq-notification-extended.log`; separate ordinary-discovery wrapper also exercised |
| Intended negative: hide failed outcome | **Rejected as expected** | Temporary local source mutation; unit assertions failed, original restored; `/tmp/vq-negative-hidden-failure.log` |
| Intended negative: restamp retrieval as check time | **Rejected as expected** | Temporary mutation rejected; original restored; `/tmp/vq-negative-retrieval-restamped.log` |
| Script syntax, workflow wiring, local references, whitespace | **Passed** | New prepared workflow actually invokes unit, browser and intended negative scripts and uploads evidence |
| New browser positive and intended negative runs | **Blocked / not run** | Chromium dies at startup: process_singleton socket Operation not permitted, SIGABRT. No fixtures/screenshot completed; `/tmp/vq-pipeline-browser.log` |
| New branch final-head remote CI | **Not run** | Health #219 uploaded after explicit approval; final-head CI result pending, no success inferred |
| Current live/provider/real-device acceptance | **Not run** | This is source/local-fixture preparation only |

Existing #218 final-head CI evidence read directly during this session:
[verify](https://github.com/Aleynaalij/VegasQuantV1/actions/runs/42100336091/job/127501137939),
[ui-smoke](https://github.com/Aleynaalij/VegasQuantV1/actions/runs/42100336091/job/127501137489),
[journey](https://github.com/Aleynaalij/VegasQuantV1/actions/runs/42100336367/job/127501139282),
[integrated journeys](https://github.com/Aleynaalij/VegasQuantV1/actions/runs/42100336524/job/127501139593).
These validate #218, not the new health branch. #218's locally blocked browser cases subsequently
passed remotely; its screenshots were not retrieved in this audit.

## Prioritized correction / decision list

1. **Earlier publication block (now resolved for draft upload):** automatic approval review rejected the detailed issue #65
   coordination comment, citing external disclosure of internal pipeline status/planned files
   beyond authorization to start the audit. The comment did not execute. No retry, alternate
   publication, push, new branch or PR upload was attempted until Mike explicitly approved this new
   code/documentation/test batch. That approval now permits draft upload only; #219 is uploaded.
   The earlier #218 upload approval was used only for that already-prepared draft.
2. **Before health release:** run prepared final-head CI, obtain eight 390/1280
   health screenshots and the intended false-coverage negative rejection. Confirm no query-error
   success, stale-error masking, horizontal overflow or admin-panel exposure. Browser startup
   failure is not product acceptance.
3. **Before notification release:** adopt supplemental regressions on existing #200, run its
   final-head ordinary-discovery/CI and migration-order compatibility. Keep migration unapplied
   until separate release approval. Transport exactly-once device delivery is not promised.
4. **Operational ownership:** confirmed support/privacy/refund destination, primary/back-up incident
   owners, proposed alert destination and approved cooldown/severity policy are still decisions.
   No member opt-in, broadcast destination or new scheduler is enabled here.
5. **Coverage evidence:** current installed jobs/settings, completed provider fetch coverage,
   immutable publication/result bindings and source times remain unverified. Global latest-100
   sampling and intermediate ingest rows are limitations; do not turn them into green all-sport
   assertions. No cadence/quote-TTL/credit increase is a substitute for missing evidence.
6. **Dealer release:** choose explicit future publisher contract and display labels; preserve
   original author, journals, quote identity and duplicate keys. No VIP/role reset or historical
   attribution rewrite is part of this batch.

These documents complete the authorized local preparation, with release/activation and the
specified browser/remote acceptance still open. No background work or monitoring is implied
after this active session ends.


## Draft upload authorization update

Mike explicitly approved uploading this new code, documentation and test batch as separate draft
PRs. The new health PR is #219 at `4afceb6458c85d5c22cb57fdc0d90206b61e3ec4`, with the same
source tree as locally tested `11aa947119391ae1512779f7801a8361bd61ce9d`. The review documents
are being uploaded separately. Prior blocked-publication entries above record historical events;
the upload approval does not approve merge, deployment, migration or live activation. Remote CI
must be read at the final head before claiming release acceptance.

# Record presentation draft

Status: published draft PR [#231](https://github.com/Aleynaalij/VegasQuantV1/pull/231), from main `133330d3dcc2c14563d27af212557ef78c9a1fe4`. Mike explicitly approved publishing the branch and opening a draft PR. The initial remote source tree exactly matches the locally tested draft. No merge, production deployment or production operation. The issue #65 public claim was not posted; latest Claude/Codex coordination already leaves these record files with Elo. Integration remains separate.

## Presentation

The lobby and NFL desk share a compact evergreen record with champagne headings, a VQ mark and readable two-column phone metrics. Wins and losses stay together. Units, ROI, hit-rate breakeven and closing-line coverage remain adjacent. A visible admin preview retains the exact existing threshold message. The Records page adopts the same local palette and spacing, with gains/losses named rather than expressed through color alone.

`record-presentation.module.css` is scoped to HomeRecordCard, RecordsDashboard and the history route. No shared shell, sport selector, lobby composition, story component or global stylesheet was edited. The Records page's original children, order, filters, ledger, export and all access checks remain intact. No calculation, API, threshold, publication, historical row or result was changed. Unknown rates remain dashes. The priced-record inclusion and unpriced exclusions remain explicit.

## Files

- `src/components/home-record.tsx`
- `src/components/records-dashboard.tsx`
- `src/app/history/page.tsx`
- new `src/app/record-presentation.module.css`
- new `tests/record-presentation.test.ts`
- new `scripts/ui-smoke/record-presentation.mjs`
- new `.github/workflows/record-presentation.yml` (isolated synthetic browser and screenshot CI)
- this draft note

## Combined QA handoff

Integrate only after the lobby placement owner mounts HomeRecordCard below the skyline. Retain Build a lay and VQ Slots below the skyline as separately agreed. This package does not move the record itself.

Run the existing full tests, TypeScript and production build on the final integrated head. Build the browser fixture with `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, run `scripts/ui-smoke/stub.mjs` and the app on port 3100, then run `scripts/ui-smoke/record-presentation.mjs`. The script only accepts a local target. It covers 360, 390 and 1280 widths, lobby/NFL reuse, hidden-member/admin-preview/public-losing samples, missing rates, unavailable/no-data responses, private-page rejection and admin price disclosures/filter access. It captures full-page and card-only images without an opening splash. Those images contain synthetic data, never real results.

Run each `RECORD_NEGATIVE=loss`, `clv` and `private` separately and verify a nonzero exit at the intended assertion. Also run existing `home-record.mjs`, `records-membership.mjs`, `check.mjs` and relevant combined lobby/story/sport/Zone tests. The old home-record smoke's placement assertion concerns the NFL brief and is vacuous on the lobby; add an explicit skyline-before-record assertion in the lobby owner's integrated fixture.

Manually inspect full-page phone/desktop screenshots, text zoom, keyboard focus, both theme settings, long sample counts and bottom-nav clearance. Ensure the record card is outside the skybox and the full private ledger still shows losses, pending/void/push outcomes and every original disclosure. The complete Records page contains official picks, automated research, published legs, weekly and personal summaries; styling must not imply these are interchangeable.

## Evidence limits

Chromium launch fails with `socket() failed: Operation not permitted`, including an approved elevated attempt. No screenshots, rendered-browser pass or negative-control execution is claimed in this environment. The browser script is prepared and syntax-checked, not yet executed. CSS values have unit-level contrast checks, which do not substitute for checking final rendered combinations.

## Local validation (this draft)

- Focused record/data/contrast tests: 18/18 passed.
- Full suite: 580/580 passed with `node --import tsx --test --test-concurrency=2 tests/*.test.ts` (127.4 seconds).
- The initial default-parallel `npm test` run was 577/580: NBA daily collection, NFL selection gate and notification/access SQL child processes ended with SIGKILL. All three passed in a serial rerun, and all 580 passed in the bounded full run. The earlier failed run is not hidden or counted as green.
- Final TypeScript, production webpack build, formatting, browser-script syntax and `git diff --check`: passed.
- React review: no new data effect, hook, event listener, dependency or client fetching; semantic heading/definition list and explicit loss labels retained. CSS is route/component scoped, with no added `!important` rules. All existing official/research/personal classifications remain in place.
- Browser execution, screenshots and negative controls: pending the isolated CI workflow. Combined-head acceptance and live verification remain separate. Local browser execution remains blocked as documented above.

## Hosted fixture correction

The first dedicated run (42280780650, head 90228f0) failed on a case-sensitive `Record` text check against CSS-uppercase rendered labels. The logging pipeline also lacked `pipefail`, so its positive step incorrectly reported success; the job failed in the negative-control step. The fixture now compares label text case-insensitively and preserves pipeline failures. A pre-assertion screenshot is retained, and optional onboarding prompts are pre-acknowledged in synthetic browser storage. Application source is unchanged. That failed run is preserved; no browser acceptance is claimed from it.

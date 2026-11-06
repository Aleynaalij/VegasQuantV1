# Temporary Kalshi pause

KALSHI-PAUSE-01 is a review-only preparation of the owner's request to disable
Kalshi temporarily while keeping Gambly and the rest of Vegas Quant working.
Nothing in this document establishes a production deployment or hosted migration.

## Prepared behavior

- `KALSHI_ENABLED = false` is shared by the interface and matching route. It is
  source-controlled, not an environment default that an old deployment variable
  can accidentally override. Re-enabling requires a separately approved release.
- The shared Kalshi matching button renders nothing. This covers published
  selections, saved lays, individual legs and contributor typed/screenshot flows,
  including the generic Browse Kalshi fallback. Gambly is unchanged.
- `/api/kalshi` returns HTTP 503, `KALSHI_PAUSED` and a no-store response before
  body parsing, authentication, database reads or Kalshi requests. Existing exact
  matching logic is preserved in `src/lib/kalshi-lookup.ts` and still tested; it
  is not a separate route and is not called while the pause is enabled.
- Existing contributor source cards remain readable with their original title,
  content, contributor disclaimer and a temporary-unavailability explanation.
  They have no source-open control, raw locator display or source-copy action.
  Internal card permalinks/sharing, typed legs, screenshots and records remain.
- The contributor composer accepts typed legs or screenshots, with no Kalshi
  input or preview. Ordinary admin edits retain the current stored source while
  its input is hidden, rather than clearing it as an absent form value.
- The prepared additive database migration rejects new source-bearing inserts
  and adding/changing/re-adding source links in revisions. It preserves exact
  pre-pause idempotent retries (no new insertion/notification), unchanged-source
  edits, safe removal when other content is present, and all original guards.
  No historical row, original migration, RPC body, RLS policy or grant is changed.

This pauses app-managed integration. It does not erase members' free text or
screenshots, block the independent Kalshi website, or revoke links someone
already copied. Already-open old application tabs can still have old outbound
buttons until reloaded; the deployed API and database guards protect server
operations even for those stale clients. The service worker caches only the
neutral offline page, not application pages, API responses or picks.

## Release prerequisites and order

1. Obtain separate owner approval for release. Check the exact PR head, current
   main, peer review, final CI and any later source-link changes.
2. Read back the hosted source-link schema and original RPCs. The original
   `20261105233947_ruby_kalshi_source_link.sql` must already be installed for the
   pause migration; missing prerequisites cause an explicit transactional abort.
   Do not silently install that original feature as part of this pause.
3. Apply the reviewed `20261106225003_kalshi_temporary_pause.sql` with the approved
   migration flow, then deploy the reviewed app. The database guard is needed to
   stop stale clients/direct RPC writes; hiding the input alone is insufficient.
4. Verify deployed POST `/api/kalshi` returns 503/no-store without provider calls,
   refreshed member and signed-out pages have no Kalshi actions, a retained
   source-only card is readable, and Gambly/typed/screenshot flows still work.
   Inspect hosted trigger definitions and grants without creating real-member
   test posts. Synthetic browser/SQL fixtures are not live acceptance evidence.

## Reversibility

The original matching and normalization implementations remain available in
source. To resume later, obtain explicit approval, verify current eligibility and
provider behavior, remove only the pause guards using the reviewed
`supabase/rollback/kalshi_pause.sql`, and re-enable the shared app flag in a new
reviewed release. Reverting the app alone leaves source writes blocked, which is
intentional fail-closed behavior. Keep all additive source columns and historical
originals/revisions; do not remove or rewrite them to undo the pause.

## Validation

- Unit/render tests cover the disabled route before all I/O, absent matching and
  generic browse controls, retained non-link source explanations, unchanged
  normalization and the Gambly entry/eligibility flow.
- Composed PGlite tests execute the actual pause and rollback over the existing
  contributor/revision/source contracts. They cover prerequisites, stale/direct
  clients, historical retries, unchanged edits, removal/re-addition, preserved
  authorization/quota/history/result behavior and rollback. They are synthetic,
  not hosted or multi-session concurrency proof.
- The dedicated browser workflow tests phone/desktop retained cards, source-copy
  suppression, composer rejection, ordinary typed/screenshot retry and admin
  preservation. It rejects injected outbound controls and a missing historical
  source explanation. Existing contributor and saved-lay Gambly regressions run.
- Full test, typecheck, production-build and browser results belong to the exact
  PR head. Initial concurrent local test/build runs exhausted resources and had
  killed child processes; they are not passing evidence. Final serial rerun and
  actual CI results must be read before release.

Local preparation evidence: focused pause/matching/normalizer tests passed;
standalone TypeScript and production webpack build passed. Direct composed SQL
pause/rollback and original source-link scripts passed. Independent source review
found no concrete application defect. Chromium could not start because the local
environment denied its singleton socket; an approved retry met the same block.
No local browser assertion or screenshot is claimed. Final full-suite and hosted
CI status are reported on the PR rather than inferred from these partial checks.

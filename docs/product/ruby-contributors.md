# Ruby contributor lays

Four owner-assigned accounts receive permanent `ruby_contributors` identities. Assignments are made privately against verified existing `auth.users`; emails and account IDs do not belong in git. Membership in this table grants submission access only, never admin or model privileges.

Home shows the contributor’s own composer, a compact Double Up feature and four contributor shortcuts. `/feed?view=contributors` contains all cards and history; `/feed?view=contributors&ruby=<uuid>#ruby-<uuid>` opens a particular card. Ordinary Home research is collapsible; existing Pick of the Day and Hail Mary are preserved.

Each contributor can publish **one NFL OR NBA parlay per America/New_York calendar day**. `submit_ruby` verifies age/account/profile, server-owned identity, restrictions, input and photo ownership; an advisory lock plus unique `(user_id, submission_day)` enforces the shared daily quota. Retrying the same UUID and identical payload returns the original without another notification. Clients cannot insert/update/delete cards or grant contributor rights. Account erasure still cascades. NBA submissions are member opinions; automated NBA picks and Coming soon remain paused.

Typed legs (2–20) or an uploaded screenshot render in the permanent Ruby template. Screenshot uploads reuse the existing private, bounded, metadata-stripping JPG/PNG/WebP pipeline. The full original slip is preserved inside a branded frame; there is **no OCR or invented transcription**. Screenshots stay in the private community photo bucket with short-lived signed links and card/block-based access. Members should remove sensitive balances/account details before uploading. Text is rendered as text, never HTML. Quote fields are optional, clearly contributor-reported and unverified. No forecasts/EV, grading, bankroll or official release writes occur.

Templates: OmaticsZone/orbit, SoDegenerate/diagonal, FranksCorner/corner, HoustonMikesHub/skyline. Identity and theme snapshots are fixed on publication.

On successful insert, `ruby_notify` calls the existing transactional emitter once per eligible confirmed recipient, excluding the author. In-app contributor alerts honor age, blocks, restrictions, erasure and disabled types; push queues only for opted-in subscribed devices and retains existing quiet-hours/online checks. No SMS or external message is sent. Notification settings contain a Contributor lays toggle. A queued event is not proof of delivered push.

## Double Up

A distinct `ruby_daily_features` record features one contributor opinion per Eastern date. MFA-verified admins may use **Feature as Double Up** on a current-day card in The Zone after checking the exact complete slip, sportsbook, HTTPS quote source, observed time within 30 minutes and actual combined American price **>= +100**. One immutable feature per date, no overwrite or invented combined odds. This is a curated contributor card, not the automated research Pick of the Day or an OFFICIAL challenge pick. Until a qualifying card is verified, Home states the requirement and links to contributors; no placeholder is presented as a recommendation. Existing research release gates remain unchanged. The feature is editorial curation, not an automated daily pick generator.

## Validation

`tests/ruby.test.ts` runs pure input/link tests and `tests/sql/ruby-contributors.mjs` against isolated PGlite. Covers quota across NFL/NBA, idempotency, role/immutable permissions, transactional notifications/push, exact daily feature floor/time/uniqueness and blocking. Browser smoke uses only synthetic accounts/cards; never publish fake member slips to production.

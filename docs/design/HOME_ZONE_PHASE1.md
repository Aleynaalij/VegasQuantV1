# Home + Zone Phase 1: isolated discovery integration

Status: **DRAFT. NOT AUTHORIZED FOR PRODUCTION.**

## Candidate and scope

This is the smallest additive integration slice, not a replacement of Home or The Zone. It connects compact matchup discovery and research previews to the existing readers and original destinations. No existing production component, route, publishing job, schema, RLS policy, membership check, source collector or community mutation is modified.

Entry: `/staging/discovery`. A room has a stable, shareable **within-staging** URL `/staging/discovery?event=<sport:id>`. The existing reader excludes completed/cancelled events and reads approximately six hours back/seven days ahead. **This is not yet a permanent historical game archive.** An out-of-window or unknown identifier is explicitly unresolved; the UI never silently chooses another game. Long-lived historical resolution is a later reviewed contract.

## Release gate / environment safety

The server returns 404 unless all of these are true:

- `STAGING_DISCOVERY_ENABLED=true`
- `VERCEL_ENV` is not `production`
- `NEXT_PUBLIC_SUPABASE_URL` names an HTTPS `*.supabase.co` project **other than production `uowearboulykfcwnuirn`**
- `STAGING_DISCOVERY_PROJECT` exactly matches that configured project host

The flag is not a URL parameter, cookie, membership privilege or authorization bypass. The dedicated project's own authentication, RLS and RPC access still apply. No environment changes or staging database setup are performed by this patch. The normal application shell retains existing root-level onboarding/notification behavior, so **do not point a staging build at production**. Use only authorized staging accounts and its publishable key; no production secrets, copied private users, or real notification destinations.

For synthetic validation, set `STAGING_DISCOVERY_FIXTURES=true` in the same isolated staging environment. The page explicitly labels every fixture session synthetic; it does not silently fall back to fixtures on reader failure. Query `scenario=signed-out`, `denied`, `unavailable` or `empty` exercises contract-shaped edge cases. Fixture data is not a replacement for actual signed-in staging authorization tests.

## Existing data contracts (unchanged)

| Contract                               | Use                                                                         | Preservation                                                                                                              |
| -------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `readResearchHub()`                    | Canonical schedules and already permitted research across NFL/NBA/NHL/NCAAB | `signedIn`, `denied`, `errors`, `truncated` displayed independently. No new service credential or privileged query.       |
| `ResearchEvent.key`                    | Room identity                                                               | Exact `sport:id`; no fuzzy team/date joins.                                                                               |
| `Finding`                              | Compact text preview plus disclosed full excerpt                            | `sourceAt` stays separate from `recordedAt`; original links retained. No invented freshness, confidence, odds or grading. |
| `game_zone_posts(p_sport,p_game)`      | Linked Dealer/post metadata in a room                                       | Existing session and RPC authorization. Loading, signed-out, error/malformed, empty and ready are distinct.               |
| `hubHref`, `eventHref`, `zonePostHref` | Original research, matchup and discussion destinations                      | Existing routes/IDs retained; comments, reactions, cards, downloads and corrections remain at originals.                  |

No new game follow, research-save, personalization, prediction-history or execution API is invented. Existing member follows and saved lays stay in their existing features.

## Feature preservation checklist

- [x] Home and sport pages unchanged; no legacy link redirection changed.
- [x] Existing Research lounge and full dossiers accessible from cards.
- [x] Original Dealer publications keep canonical post identity and full cards/downloads.
- [x] Comments, reactions, polls, member following, moderation and privacy stay on original community pages.
- [x] Stories and current skybox remain accessible from current Home.
- [x] My Lays/saved legs and Build a Lay retain `/parlays` routes.
- [x] Fear Index uses `/vegas-fear` and existing access policy.
- [x] Simulator availability is not relabeled operational; current Home remains authoritative.
- [x] Account/notifications/legal remain in existing shell; no new permissions.
- [x] Publishing schedules, original research and grading untouched.
- [x] MLB remains February 2027, no implementation in this candidate.
- [ ] Actual connected staging account, role and content regression verified.
- [ ] Complete cross-sport live-shaped staging coverage and historical room resolution accepted.

## User journeys and acceptance

1. Discover sport/game -> compact research -> full original dossier -> full matchup with existing lineup panel -> original Zone discussion -> Back preserves query context.
2. Search empty: explicit no-match; failed source: explicit unverified availability, not no games or no pick.
3. Signed-out/denied account: no protected findings rendered. Account change clears prior reader response; stale responses rejected.
4. Published update/correction: retain original text/timestamps/link. No synthetic immutable history or relabeling a collection time as an observation.
5. Source limit: partial coverage notice, not complete-slate claim.

## Accessibility and responsive controls

Semantic h1 and headings, native links/form/select/details, visible keyboard focus, skip link, polite result counts, minimum 44px interactive controls and scoped reduced-motion rule. Compact text does not remove full excerpts or original research. No carousel or nested scrolling added. Target checks: 360/390/1440 widths, 200% zoom, keyboard Back/Forward, disclosures, errors/retry, and account switch. Physical touch, screen reader, actual OS reduced-motion and full rendered contrast/axe must be recorded as passed or untested, never inferred from CSS.

## Rollback plan and test scope

1. **Before any production release:** this candidate is unavailable there by hard guard. Current Home/Zone routes remain unchanged.
2. Disable `STAGING_DISCOVERY_ENABLED` and rebuild the staging preview. Expected: `/staging/discovery` returns 404; `/`, `/community`, `/research` and sport routes remain unchanged.
3. Remove/revert only this additive commit if necessary. No database rollback or publication cleanup is needed because no migration/mutation is introduced.
4. Unit tests exercise gate enabled, disabled, production environment and production-database rejection. This is gate logic evidence, **not** a claim that a hosted flag-off rollback was performed.
5. A real staging toggle/rebuild and original-route smoke must be completed before calling the rollout/rollback tested end to end.

## Recommended release order

A. Review this additive staging adapter slice, resolve CI and Codex integration acknowledgment, test dedicated staging accounts/content.
B. Independently reviewed controlled production flag/entry proposal using existing Home and Zone surfaces; preserve old route/rendering fallback. Requires Mike's exact-candidate authorization.
C. Expand durable room lookup for archived games with reviewed backend contract before claiming persistent historical rooms.
D. Add optional followed games/research saves and consolidated pick timeline only after separately reviewed contracts and privacy rules.

## Remaining gates

- Codex acknowledgment of scoped contract in #65.
- Actual dedicated staging environment identity/configuration and protected preview.
- Backend compatibility on staging (readers/RPC/migrations already present there must be verified, not automatically installed).
- Full final-head CI including browser tests; no weakened assertions.
- Actual connected authorization and content regression, accessibility/mobile acceptance, hosted rollback.
- Independent review and Mike's exact release approval. Nothing here authorizes production merge or deployment.

## Inspected staging prerequisites (2026-11-15)

Read-only inspection of existing `vq-ap002-validation` found only public community_posts, community_profiles, feed_runs and nba_games; membership_status exists, but sports_slate and game_zone_posts do not. This fixture project is not currently a compatible consumer integration environment. No schema or configuration changed. Do not apply the existing zone tagging migration casually: it includes historical backfill and depends on private age/community authorization helpers, zone_post_games and comment/reaction tables. Codex must own a separate reviewed compatibility plan before connected acceptance. Use clearly labeled fixture mode for initial browser acceptance.

The existing game_zone_posts RPC returns an empty array both when no posts match and when private age/member checks deny access. The frontend therefore says “no accessible linked publications” and explicitly preserves the ambiguity rather than claiming a definitive empty or publishing pass. A typed server disposition is a future contract dependency; do not change backend authorization here.

## Synthetic integration preparation

`tests/discovery-reader-staging.test.ts` runs the actual readResearchHub adapter against synthetic Supabase response shapes, with network forbidden. It covers four sports, preserved event/full-research URLs, denied access and one unavailable sport. This verifies adapter behavior, not deployed RPC/RLS behavior.

Local isolated build with fabricated Supabase URL/key and fixture flags returned HTTP 200 for `/staging/discovery`. Chromium could not launch because the runtime forbids its process-singleton socket, including an escalation retry. Therefore this server check is not browser/a11y acceptance. Use a compatible CI browser runtime for the pending responsive, focus, contrast, reduced-motion and touch-emulation checks. Physical hardware testing remains separate.

### Follow-up isolated acceptance: access lifecycle and degraded linking

Connected staging now defaults to link-only original publications. The deployment
must explicitly opt into `STAGING_DISCOVERY_LINKED_PUBLICATIONS=true` only where
the reviewed RPC exists. Otherwise the RPC reader is not mounted and research,
original matchup, and sport-filtered Zone links remain accessible. This is not
full game-publication integration or a permanent historical archive.

Discovery-only access revalidation discards rendered protected data and invalidates
in-flight responses on auth notifications (including the same user), visibility
changes and focus. A 60-second active polling target also rechecks access; browser
throttling/offline state can delay it. This is not instant server-pushed revocation.
Auth callbacks defer reads outside the auth notification lock. Shared production
auth helpers are unchanged. Unit lifecycle checks pass; real rendered browser
account-switch/revocation testing remains a separate acceptance gate.

Prior-authorized access loss now clears the Discovery state, invalidates in-flight
responses and stops its local lifecycle listener/timer before routing to a gated
access page. Verified denial and an unverifiable access check have distinct copy.
Initial anonymous schedule access remains separate. This is not an app-wide logout:
existing global shell subscriptions and AgeAccessBoundary remain unchanged and
may show their own access state before the local page. Browser lifecycle regression
uses intercepted synthetic transport, not hosted production-policy parity.

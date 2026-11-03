# VQ Tonight — proposed daily Home experience

Status: source-backed design/release proposal, not approved implementation or release. Baseline `4140a05216cbf891719d17bc2a7d42baecc92f49`. Assignment: issue #65 comments 6611022281 and 6611197017. No production queries, new provider, schema or publishing.

## Small first release

Home opens with **VQ Tonight**, a daily navigation view of supported games, their available research and authorized community activity. It is not a new prediction engine. Keep the sport strip, account controls, saved lays and functioning Home features. Recommended hierarchy:

1. Today’s games: factual matchup, scheduled time/status, source timestamp when supplied, and **Open game research**. Group by canonical sport, sort by actual start time, stable ID tie-break. No ranking by fabricated confidence.
2. Research available: exact game-linked published material that the viewer may read; show its publication/source time and a clear research label. **No published research yet** is valid. Do not treat a game’s existence as research availability.
3. Community: signed-in recent-post rail/story viewer and **View discussion**. Preserve the difference between official publication and member opinion. Signed out: explanatory introduction and sign-in; no member activity/count/profile/photo preview.
4. Continue your lay: retain current account’s draft and canonical `/parlays` continuation without prompting automatic sharing.

The title remains VQ Tonight during daytime; the date label says **Today · Nov 3 · Eastern time**, rather than implying every game occurs at night. Tomorrow’s schedule may appear under a distinct heading on no-game days, never relabelled as today.

## Actual inputs and destinations

| Module | Existing input and identity | Time meaning / limitations | Canonical action |
| --- | --- | --- | --- |
| NFL schedule | `desk_data_compact` / existing desk games, exact `games.id` + slug | `kickoff` is scheduled start; schedule storage/update is not a live-score heartbeat | `/matchups/[slug]`, existing game-picks route; game room `/sweat/[game UUID]` |
| NBA schedule | `nba_games`, exact stored ID + slug | `tipoff`, provider status/scores; `updated_at` may mean last changed, not last fetched | `/nba/games/[slug]` |
| NHL / college schedule | `sports_home(p_sport,p_days)` → version-1 games, stored UUID + slug | `start_time`, TBD/neutral/status fields; reader availability does not establish collector health | `/nhl/games/[slug]`, `/ncaab/games/[slug]` |
| NFL research | Existing game-specific analysis/version read in `matchup-intelligence.tsx` | Publication time and source observation/cutoff are separate; weekly team form is historical context | Exact NFL game route; keep missing/error/denied distinct |
| NBA research | Existing `nba_observations`/board and game detail | Member reads; lines, props, injury facts and historical form have different timestamps | Existing NBA game route |
| NHL / college research | `sports_game` and sourced facts/markets already used by `sport-game.tsx` | Context can be missing; quotes use `observed_at` and expiry, not fetch time; college context 404s are not invented facts | Existing sport game route |
| Public proof | `public_research_status`, explicitly granted to anon/authenticated | Narrow existing aggregate/publication-proof projection only; not permission to expose full member research or social content | Existing public overview/research entry |
| Story rail | Authenticated `community_activity` | Latest eligible post per visible author, max 24; post creation time is not presence or 24-hour expiry | Authorized post detail, proposed viewer, `/community?sport=…&post=…#post-…` |
| Discussion | Existing member `community_feed`, `community_post`; NFL game comments | RLS and block rules apply; no universal cross-sport game-room mapping established | Existing room where supported; otherwise sport-filtered Zone, labelled general discussion |
| Draft / saved lay | Existing account-keyed browser draft and `member_parlays` RLS | Current selections revalidated; saved snapshots remain historical | `/parlays`, `/parlays?saved=ID#my-parlay-ID` |

Re-use the current readers and their access-shaped responses; do not add a browser aggregator with privileged credentials. Inspect each final RPC projection under anon/member fixtures before composing Home. A public grant on a schedule RPC does not make all nested data public. The existing server-enforced shape is the ceiling.

## Day/time contract

- Product day: half-open `[00:00, next 00:00)` in `America/New_York`; derive boundaries with an IANA-zone-aware method, never a fixed UTC offset or `now + 24 hours`. DST days can be 23/25 hours. Show ET explicitly; optional viewer-local time must name its zone.
- Include games by actual scheduled start in that window, not the NFL weekly `homeWeekStart` boundary. A game already live from the previous day may appear in a separate **Still in progress** section only with sourced status; never change its original date.
- TBD starts stay **Time not confirmed**, with reliable date only when supplied; exclude unknown dates from date-specific counts. Postponed/cancelled games retain their sourced label and are not “tonight’s picks.”
- At rollover, update the day label/filter on visible-tab wake and a scheduled boundary refresh. Preserve sport, open game and account draft; do not interrupt a modal or rewrite its selected game. Offer **Back to today** if viewing an older game.
- No-game days: honest no scheduled games, existing saved-lay/research navigation and authorized discussion. No fabricated filler or automatic template publication.

## Freshness and state contract

| State | Required behavior |
| --- | --- |
| Loading | Bounded skeleton/status; no zero-game claim before successful response |
| Source time known | Label the source event/observation time and timezone; keep fetched-at diagnostic separate |
| Freshness unknown/invalid/future | “Update time unavailable/unverified”; no green live/fresh badge |
| Old quote | Historical snapshot with observation time; never current/executable-price language; reuse merged clock guards |
| Weekly/history | Label sample window and cutoff; never “live” because fetched today |
| Empty research | Factual game remains usable; “No published research yet” with supported next step |
| Read denied | Sign-in/access action; no hidden content in HTML, JSON, counts, avatar rail or cached previous-account state |
| Refresh failed | Error + retry, preserve clearly labelled prior authorized snapshot where safe; account changes clear it immediately |
| Missing/deleted game/post | Unavailable + safe return to originating sport/date; no similar-name substitution |

## Acceptance fixtures

All fixtures synthetic/local; no real member, post or external transaction.

- All four sports; exact same-name teams across distinct IDs, missing slug, TBD/neutral, cancelled/postponed and no-game day.
- Games just before/at/after ET midnight, both DST transitions, prior-day still-live, resume after tab sleep; selected sport/game and draft survive.
- Signed out/member/denied/account switch: source projection limits, no member metadata flash, stale response ignored.
- Research fresh/stale/unknown/error/empty; quote observed time differs from publication/fetch time; weekly history remains historical.
- Home → exact research → discussion → builder → save → reopen → Back at 360/390/desktop, keyboard/focus and reduced motion.
- Story grouping/display/read rules and Gambly eligibility from community contract; transfer failure cannot advance the story or mark it read.
- Negative controls: intentionally wrong game ID, future quote stamp, private row in visitor payload, false save success and failed detail marked read must each fail at the intended assertion.

## Implementation and release plan

1. Finish Claude’s current U-C2–U-C4 and independently review with #203. Preserve older #139/#105 without replaying stale patches. Accept one annotated mobile/desktop proposal from Claude against this inventory.
2. PR A: isolated day-window/view-model helper and tests over existing inputs; no new RPC/schema. Explicit state for partial sport failures. Demonstrate access-shaped projections and DST fixtures.
3. PR B: Claude’s Home presentation over the agreed model; reuse existing sport/game routes and private draft; before/after screenshots and accessibility/browser checks. No parallel competing Home branch now.
4. PR C only if needed: story/community integration after its independent contract/privacy acceptance. Missing authorized sequence/transfer data remains a concrete dependency, not a placeholder promise.
5. Consolidated review: exact combined head, helper/SQL/browser/negative-control results, screenshots, bundle/request impact and unresolved real-auth/device checks. Owner then decides the concrete release candidate.
6. Authorized release verification: exact deployed commit, all sport routes, signed-out payloads and account-switch behavior, timezone rollover, known saved deep link and source time labels. Roll back the application commit if navigation/privacy/state checks fail; no data rewrite or rollback of unrelated reliability migrations.

### Decisions for Mike, routed through Elo

Recommended defaults: ET product day; game research first, community second; no public member preview; no model-derived ranking; manual opt-in Gambly handoff only. Confirm the annotated design/hierarchy and coherent implementation scope before coding a new Home experience. No purchase, new provider, user tracking or auto-publishing is proposed. Schema/access/transfer changes, if discovered, need a separate concrete proposal and are not covered by this design assignment.

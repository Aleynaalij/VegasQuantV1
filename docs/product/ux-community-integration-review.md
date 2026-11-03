# Claude UX/community review and integrated acceptance

Status: changes requested; integration candidate is DRAFT ONLY. No merge/deploy/migration application. Based on main `4140a05216cbf891719d17bc2a7d42baecc92f49`.

| Package | Exact reviewed head |
| --- | --- |
| #205 journey foundation | `46a01b5b67fa2f9ff1c869a743514124f63e1342` |
| #207 stories + #204 | `5ade0f336f843687b8c83946331481cd45655ef5` |
| #208 signed-out entry | `dfb39c5c668f281183d7109f0f2375a68e6597e7` |
| #209 Tonight | `4e64a11bfb0a52676ccefcef87362f3925b82efa` |
| #210 reactions + #206 | `19dd948c906364f6d638698cd5086ca685af0218` |
| #203 regression foundation | `0115907811ad95c3e11c498f2e1960b0c9b3c468` |

## Current-main re-review (November 3 follow-through)

Reviewed released main `4962c711cf34ffdb2145cfa432c478225af30c87` and incorporated its Tonight component/helper/unit tests/browser script verbatim. Those four files supersede the old #209 copies; other main changes merged automatically. Main was released separately by Claude under his recorded owner approval; this review performs no production action.

Resolved at this main source: schedule success/error request-generation and ET-day guards; latest-account draft-read generation; version-1/requested-sport envelope validation; NFL unconfirmed kickoff preservation. Focused helper suite now **23/23 PASS**, TypeScript PASS. The previous integrated run at `263e991` actually executed 511 app tests, six browser scripts and seven intended negative controls successfully; that result belongs to the previous tree. Updated current-main integration execution is pending until its new-head logs are read.

Still open: #207 remains `5ade0f3` and #210 remains `19dd948` after fetching; no correction commits for story re-entry/focus/history-cycle or typed Like/close behavior are available yet. Candidate original-publication query link remains outstanding in #205. Do not infer those missing regressions passed from the current green baseline cases. Next dependency is Claude's corrected source and acceptance scripts, followed by refresh of this integration candidate and actual new-case execution.

## Original prioritized correction packet (at the heads above)

1. **Story access revalidation (blocking privacy acceptance).** Elo's 6614116342 remains applicable: per-ID prior success survives re-entry/focus while the new check is pending. Gate display by the current request/entry validation, not historical `checked[id]`. Test delayed success/denial and stale responses; cover Back→Forward→reopen. Source-derived, not a production incident claim.
2. **Tonight stale request/day/account isolation.** Current schedule load resolves without generation/day guards; an old response/error may replace current-day results. Apply per-sport generation/day checks to success AND error. Also generation-bind the account/draft reader: its async getSession currently has only a live/unmount flag, so overlapping old-account reads can update the new account state. Test delayed previous-day success/error, overlapping retry/refresh and delayed old-account hydration.
3. **Typed emoji vs old Like consistency.** #210 marks old `reacted=true` for any emoji, while the legacy heart uses that as Like and deletes the row on click. Selecting Fire therefore makes the heart appear selected; the next heart action removes Fire. The open picker also retains old counts after a legacy Like change. Share one canonical mine/count state and serialize all typed-capable controls; use old Like fallback only when the new API is unavailable. Test Fire→heart, Like→picker, unlike/remove, errors and count reconciliation. Posted 6614281551.
4. **Picker explicit close must invalidate pending work.** `open()` close branch and Escape only set closed state; they do not invalidate the pending read/write generation. A late response can reopen and refocus an explicitly closed picker. Centralize close/invalidate and add delayed read/write/close, account and unmount tests. Posted with item 3.
5. **Sports response identity/version validation.** `fromSportsHome` ignores version/sport on the response. Executed a local synthetic call with version99/sport=ncaab while requesting nhl: it creates an NHL-labelled college game and `/nhl/games/sample-college`. Reject wrong version/sport/malformed envelopes as unavailable/error, not a successful no-games day. Existing primary sport desk validates version/sport. Include malformed/null rows and mixed sport fixtures. No live source/provider query used.
6. **Candidate original-publication links remain a dead end.** At #205's reviewed head, candidates still link to `/feed#release-ID`; the server's bare-feed redirect drops the research target. Use existing query-based release contract, e.g. `/feed?view=latest&release=ID#release-ID`. Cover existing/missing/denied exact releases. Earlier finding 6611911387 remains open; non-candidate `/records` fix does not cover this path.

## What checked out

- #205's closed-Home draft hydration now subscribes to account changes and guards its request generation; game-context helper rejects malformed/unlisted slugs.
- #207 source adds chronological per-author entry, bounded read eviction, explicit Back entry handling and current-item RPC checks; these changes address earlier findings but do not resolve item 1 yet.
- #208 visitor entry is explanatory/empty and does not add a public member source. No access expansion identified in that diff.
- Tonight day helpers pass 23/25-hour DST and same-UTC-date ET-boundary cases. Checked time wording distinguishes database read time from source changes; five-minute reads spend no provider credits.
- Reaction persistence draft has composed SQL/RLS/safety/rate/notification fixtures; migration remains NOT APPLIED. Typed UI honestly falls back when RPC is unavailable.

## Combined tree and validation

Composed the exact heads above with their histories. The only manual conflict resolution combined three nonconflicting imports in `community-feed.tsx` (ReactionPicker, reaction CSS, Zone-entry CSS); no behavior rewrite. All other merges automatic. Old #139/#105 remain untouched.

21 focused helper tests PASS; TypeScript PASS. Production build exits0 with the cached dependency limitation below. Local shared dependency cache reports a different Next patch version than the lockfile; exact dependency/build/browser acceptance belongs to CI's npm ci and must not be inferred from the local build. Local Chromium launch is already known blocked by socket permissions; no new local browser pass claimed.

New dedicated `UX community integration` workflow builds with locked dependencies, uses localhost synthetic stub/app, runs journey-contracts, journey-walkthrough, story-viewer, zone-entry, vq-tonight and reactions, then requires seven intended negative rejections: drop-game, no-save-id, overflow, read-on-tap, visitor-fetch, day-ahead and wrong-post. Each negative must produce its scenario-specific assertion text; setup/crash failure alone is not accepted. Screenshot/journey artifacts are synthetic. Actual execution logs/results remain pending, and new correction cases must arrive in Claude-owned scripts before they are claimed covered.

No integrated release acceptance until the correction packet, exact corrected heads, actual workflow executions/negative controls and combined compatibility checks are complete. Tonight was subsequently released separately under Claude's recorded owner approval; that does not release the remaining community drafts. Real devices/auth and production verification remain separately not run.

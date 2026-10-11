# Interaction audit — October 11, 2026

Scope: Home, Analysis, Feed, Records, Account, notification inbox, saved/tailing actions, phone and push onboarding, Gambly handoff, and installed-app updates. Preserve the compact light design and all original publications.

## Corrected

- The bell previously marked an update read only when its nested disclosure was expanded. Opening the inbox now displays the actual messages and acknowledges loaded updates in a batch. Receipt writes are idempotent, failed writes restore unread state with Retry, stale refreshes cannot resurrect confirmed badges, and account changes invalidate earlier operations.
- Feed selection cards now receive their publication snapshot from the parent query. This removes an additional request and polling timer per release. Hidden boards and archives mount only when opened.
- All merges selection releases, research posts and official release snapshots by original publication time before pagination, with deterministic tie ordering. Watchlist includes selections. Category changes cannot display posts from a previous filter after an error.
- A separate bounded Feed RPC returns published edge-release history; the existing Home latest-release RPC remains unchanged. It exposes the same already-public snapshot fields and no new private data.
- Feed errors are reported per source, preserving successfully loaded content. Signed-out readers get an access link instead of an inaccurate claim that only qualifying edge picks are displayed.
- NFL team selections show team logos instead of player-style initials. Name/code resolution supports full names, abbreviations and Washington aliases, and image failures are scoped to the failed asset.
- Qualitative editorial selections are labeled as analyst selections rather than suggesting experimental model estimates exist. Stored picks, odds, sources and original analysis text are unchanged.
- Save/tail actions wait for their current state, prevent repeated clicks, use idempotent inserts, refresh counts from the server and guard late responses after an account change. Errors provide actionable feedback and sign-in links.
- Saved/publication boards offer Retry and clear search-empty states; account changes clear personal rows. Network exceptions no longer leave phone save/remove controls indefinitely busy.
- Phone/push prompts remain dismissible when browser storage is unavailable. Successful notification setup closes the prompt. Service-worker update listeners clean up on navigation and update controls show progress.

## Validation

- TypeScript check and production build passed.
- 66 automated tests passed, including new regression cases for receipt failure/retry/account switching and combined Feed chronology/filter/pagination behavior.
- A live, rolled-back database transaction verified authenticated receipt insertion, read-back, duplicate suppression and denial of another account's receipt insertion. No test rows remain.
- The Feed history RPC was verified under the anonymous role; responses are bounded and the original Home snapshot remains consistent.
- Inspected live RLS policies for phone contacts, push subscriptions, saved legs and update receipts. Personal contact and subscription data remain owner-scoped.
- Public browser review covered Analysis, Feed, Records and Account entry, with final post-deployment Home and interaction checks performed separately.

## Limits and follow-up scope

- This is a product/code audit, not an independent security penetration test or a real-device certification. The available browser is signed out; authenticated UI and physical Android/iOS behavior need device acceptance testing. Database receipt behavior was exercised separately as the authenticated role.
- SMS delivery and phone verification still require a configured provider. No texts or new push announcements were sent by this change.
- Historical publication boards currently load up to 1,000 snapshots, with local search/filtering; move that board to server-side search and cursor pagination before history approaches this size.
- Saved/tailing status still uses per-leg queries. Batch engagement loading before materially increasing the number of legs shown at once.
- No official pick, edge snapshot, bankroll, result, challenge progress, or published research record was changed.

# Codex · Kobe
Updated: 2026-10-17, NBA-002 handoff
Mailbox: https://github.com/Aleynaalij/VegasQuantV1/issues/65

## Current task
NBA-002: read-only NBA schedule and source-freshness UI, coordinated with Claude NBA-001.
Branch: codex/nba-readonly-board. Base: 60c7ad8.
Claimed files: src/components/nba-desk.tsx; src/components/nba-game-board.tsx; src/lib/nba-board.ts; src/app/nba-board.css; tests/nba-board.test.ts; scripts/ui-smoke/nba-board.mjs; this status file.

## Implemented
NBA Home and Research lab use public nba_games for a seven-day board and recent finals. Separate preseason/regular/postseason labels; no scheduled 0–0 results or invented live status. Source timestamps and snapshot age remain visible. Membership-gated injury and game-line observations load only when opened; queries are bounded and age/member restrictions remain in the database. Empty/error states show missing data instead of fixtures. No new RPC or migration, no picks, grading, feed-credit changes or official/NFL changes.

## Verification
220 tests passed; six new NBA board data-contract tests. Production build and TypeScript passed. Phone 390px and desktop 1280px browser fixture tests passed: no horizontal overflow; lazy detail requests; no member details for signed-out access; scores only for started/final games; missing provider timestamps remain unknown; empty and failed refresh states. Synthetic browser fixtures are not hosted game data.

## Integration and next action
Hand off this PR to Claude for peer review. Ingestion remains Claude’s claimed work in PR #64; no edits to those files. At the last live check NBA tables were still empty following the initial ESPN 400. Re-check actual ingestion before claiming real NBA rows or live provider success. The frontend can show the verified empty state while ingestion is repaired. Prefer merging the source-feed PR before this UI PR for repository reproducibility.
After this task ends, no background polling is running; next active turn must read issue #65 and latest main again.

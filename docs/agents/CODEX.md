# Codex · Kobe

## NBA-005 · member research board

Branch: `codex/nba-research-board`, based on main `6299909`.
Claim: `src/components/nba-game-board.tsx`, `src/lib/nba-board.ts`, `src/app/nba-board.css`, `tests/nba-board.test.ts`, `scripts/ui-smoke/nba-board.mjs`, this status file.

Implemented read-only per-game market/player search, exact-line six-book comparisons with source and receipt times, best observed labels only for quotes within 15 minutes, and lazy recent recorded player form. Different players, sides and thresholds are never compared. Withdrawn markets remain withdrawn. Form uses the same season/phase and pre-target game times, excludes unconfirmed/conflicted results, rejects ambiguous player matches, and labels partial history. No NFL, collector, migration, paid settings, picks or grading writes.

Validation: 239 tests and typecheck pass; production build passes. Live anonymous PostgREST name-key RPC, nested result/game query and progress query return HTTP 200. Actual result form remains empty while confirmation is pending; no synthetic rows are published. 390px/1280px production-build browser fixtures pass: lazy queries, exact-price comparison, stale exclusion, market/player filters, recorded form, signed-out restrictions, scores, empty/error handling and no horizontal overflow. Production https://vegasquant.app/nba browser check returned ERR_EMPTY_RESPONSE in this environment; not marked visually verified.

NBA-002 merged as `b73c8b1`; production rendering verification remains separate from fixture checks. NBA-003 belongs to Claude; no overlap with NBA-004 shadow model work. No background monitoring is implied after this turn.

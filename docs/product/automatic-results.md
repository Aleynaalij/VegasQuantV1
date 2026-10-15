# Automatic editorial leg results

Activated October 14, 2026. This worker tracks published NFL editorial selections, not actual sportsbook tickets or the retired challenge bankroll.

## Supported selections

Single-player full-game rushing yards, receiving yards, passing yards and receptions. Accepted wordings: `Full game · 50+ rushing yards`, `FULL GAME TOTAL · 50+ total rushing yards`, `Full game · Over 49.5 rushing yards` / `Under`, and the bare `50+ rushing yards` / `Over 49.5 rushing yards`. A bare market counts as full game (sportsbook convention, overtime included) unless the market or matchup mentions a quarter or half; halftime-published `FULL GAME TOTAL` legs are full game. Trailing `· LEAN` and `· CONDITIONAL LEAN` tags are graded; `· WATCHLIST` and other qualifiers are not picks and are skipped.

The game binds from an explicit `game_id` (still gradable after its slate release expires), an ESPN game source, the team (full name, abbreviation, city or nickname) and/or the matchup line (`DEN @ LAC`, `Detroit @ Arizona`, full names), plus the publication window when no `game_id` is given. Exactly one game must match. When no team is named, the player's side is resolved from the box score and must be unique across both teams; nflverse then corroborates for that side. The immutable publication is never rewritten to make it gradable.

Parlay tickets, retrospective cards, partial periods, touchdown/other markets, NBA and OFFICIAL challenge selections remain review-only. Missing players are not assumed to have zero; injury/DNP and void rules are not inferred. Results are editorial threshold outcomes, not FanDuel/DraftKings settlement confirmation.

## Hosted flow

`result-sync` authenticates against the existing Vault-backed feed token and checks every five minutes through Supabase Cron. No browser/service secrets are exposed. Each run registers immutable contracts, checks bounded game batches, persists progress and journals per-leg blockers in `feed_runs` under `Editorial result sync`.

ESPN summary event ID, season, date, teams, player and stat column must match. Live progress may show TARGET_REACHED_LIVE, but does not settle Records. Final completion requires the exact stat to agree with nflverse's current-season weekly row for player, season, week, team, opponent and game ID. Both response hashes, retrieval times, source URLs and player IDs are retained in private immutable evidence. nflverse last-modified is retained separately; it is not a fabricated quote/stat timestamp. Corroboration does not claim the providers are independent or that they control sportsbook settlement.

The service-only transaction calculates WIN/LOSS/PUSH from the bound threshold, inserts the sourced immutable result, and publishes exactly one result post for new publications after activation. Tailed Records join the exact publication key. Both hits and misses publish. No assumed stakes, payouts or net profit. Original Pick of Day/Hail Mary tickets remain intact.

Supported older publications can receive sourced results in Records and their original cards, but do not create a flood of retrospective Feed posts. Those that cannot bind remain listed as blockers. Recent finalized contracts are rechecked hourly while inside the 21-day scan window. Conflicting corrected data marks CONFLICT; it does not silently rewrite an immutable result, and personal summary excludes the disputed outcome pending review.

Provider outages, missing weekly rows and mismatched stats remain pending. A final corroborated update can lag the final whistle until weekly stats publish. Polling is not an instant-delivery guarantee. Runs have an 80-second budget and at most six game summaries; remaining games rotate by last checked time on later polls.

## Operations and acceptance

- Admin → Data feed health shows result worker health and, on each ungraded pick, why the latest run skipped it. Admins grade review-only picks there (WIN/LOSS/PUSH, or VOID for watch notes that were never a pick) with an https source; results are immutable, so it asks for confirmation.
- Tests cover game/period ambiguity, name suffixes, no-zero behavior, live vs final, threshold boundaries, CSV schema, source mismatch, transaction dedupe and member write denial.
- First hosted run verified 16 exact published outcomes; two Cook entries correctly waited on a provider name-suffix discrepancy, subsequently resolved with standard suffix normalization and duplicate-player rejection. The second hosted run finalized those two entries, bringing verified editorial outcomes to 18. Eighty legacy entries remain unsupported/ambiguous/review-only, with exact reasons journaled.
- Existing immutable manually verified outcomes are retained. No bankroll, wager or official challenge result records are modified.

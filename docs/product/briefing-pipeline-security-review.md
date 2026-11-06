# November 6 briefing addendum: read-only findings

LOBBY-DESTINATIONS-01. Investigation on November 6, 2026, approximately 14:16–14:21 UTC. Baseline main `3d7d862`; production changes were not authorized or performed. No collector, result, publication, billing, notification or trading RPC was invoked. Reads used aggregate journals, schema/function metadata and source inspection; no member records, secrets or raw private logs are included here.

## Pipelines

The requested observation window is **November 5 12:58 UTC inclusive through November 6 12:58 UTC exclusive**. Later snapshots are explicitly separate.

| Finding | Verified cause/evidence | Actual impact and limits | Proposed next step |
|---|---|---|---|
| Sportradar: 288 partial runs, zero calls | Confirmed in `sportradar_runs`. Latest runs record `local_request_budget_reached`. Deployed `reserve_sportradar_call` enforces 150 reservations/24h and 500/30d. Readback: 0/24h, **500/30d**, last reservation November 1 19:10 UTC. The 30-day local guard is exhausted. | No new Sportradar observations in the requested day. Latest retained schedule: Nov 1 11:45 UTC; statistics: Nov 1 19:10 UTC; play-by-play: Nov 1 19:05 UTC. The collector refreshes the stale schedule before checking game windows, so it hits the guard first. `live_freshness_verified` remains false by design, even on successful collection; it is not a freshness measurement. This is a local budget block, not evidence of a provider outage or failed HTTP calls. Other feed coverage was not established by this check. | Preserve the guard. Propose explicit `budget_blocked` / last-success / next-budget-window health presentation, and avoid five-minute wakeups when no reservation is possible. Any schedule/budget/provider-spend change requires separate approval; no bypass or reset. |
| Editorial: 288 partial runs; latest at briefing checked 7, settled 0, 15 blockers | Confirmed exact Nov 6 12:55 journal. Across the same 24h, counters report **8 newly inserted settlements**, 17 live target updates and 8,450 checked attempts. `settled` increases only when `finalize_editorial_leg` reports an inserted original. | Zero settlements in the latest poll does not mean the whole day failed. Partial is set whenever any blocker exists, including deferred work. Repeated blocker totals are attempts, not distinct picks. The job remains productive, with unresolved coverage/evidence gaps; an outage is not supported. | Separate intentional deferral, identity/manual review, missing stats and corroboration failures in health reporting. Preserve immutable results and source corroboration. Do not fill missing player stats with zero or bypass review gates. |

Editorial 24-hour blocker-attempt counts: source-budget deferral 4,812; unavailable/ambiguous player stat 1,126; retrospective/ticket review 864; missing/ambiguous game binding 378; nflverse retrieval unavailable 45; missing/ambiguous weekly player row 40. These counts can repeatedly describe the same contract.

Source explanation (`supabase/functions/result-sync/index.ts`): contracts are ordered by least-recent progress check; a poll defers after six distinct ESPN game summaries or 80 seconds of run time. Final grading requires ESPN plus nflverse agreement; unsupported tickets and ambiguous identities deliberately remain ungraded. FINAL contracts are periodically rechecked for corrections, so checked counts are not counts of new work. This investigation does not demonstrate a starvation bug or justify expanding source budgets.

Later snapshot (about 14:20 UTC): all persisted `leg_result_progress` rows contain 388 FINAL and 12 BLOCKED. The BLOCKED rows' checks range from 14:00 to 14:15 UTC, which shows recent attempts rather than an entirely stuck queue. This global persisted population is not the same as the latest run's 399 in-scope contracts. The latest later poll checked 44, settled 0; blockers included 59 budget deferrals, two review cases, one missing player stat and one game-binding gap. Later counts do not replace the briefing-time figures.

## Security advisory review — proposals only

The current advisor reports two anonymous SECURITY DEFINER RPC warnings and disabled leaked-password protection. Metadata/body inspection, not anonymous live RPC invocation, was used.

| Advisory | Intended access verified | Assessment/proposal |
|---|---|---|
| `public.nba_grade(...)` | Repository migration explicitly grants anon/authenticated/service-role execute. Deployed body matches the validated-input read-only grader: STABLE, empty search_path, fixed table references, enum/side/player validation, scalar WIN/LOSS/PUSH/VOID/PENDING/REVIEW output. | Intentional public sports-result projection; no member identity, billing, mutation or provider call found in the body. Definer executes over protected result storage, so blindly switching to invoker can break public grading. Keep unchanged while reviewing/documenting the public-output contract; optionally narrow via a private implementation and reviewed invoker wrapper if that preserves required access. Public argument limits/rate limiting and source-result exposure warrant a separate bounded review, not an automatic privilege revoke. |
| `public.nba_threes_card(date)` | Migration explicitly describes its sports data as public and grants anon/authenticated/service-role execute. STABLE, empty search_path, fixed references, bounded top-eight lists. Its private helper reads prior season games/results/three-attempt stats, no member tables. | Intentional anonymous daily image data, not by itself an unauthorized member-data leak. Keep public sports output if confirmed product contract; propose explicit null/invalid/history-range input behavior and separate private implementation only where useful. Do not change grants or suppress the advisor without reviewed justification. |
| Leaked-password protection disabled | Current Auth advisor confirms disabled. | Recommend enabling after owner approval and confirming project support, with signup/password-change/recovery fixtures for compromised-password rejection and usable errors. Do not infer compromise or silently force resets. No Auth settings were changed. |

Remediation references: [anonymous definer advisory](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). These are review prompts; function-specific intended public access takes precedence over a blanket revoke proposal.

## Product and release decisions

- **Mike:** support owner/monitored inbox remain unassigned. Claude reports the decision to say direct contact is unavailable for now. No email address, working intake, response time, refund promise or revised legal commitment was invented.
- Claude later reported a Mike decision to create a separate `/parlays/tailed` draft route, preserving My lays as private saved combinations. That new route needs combined access/account/error acceptance; it must not expose admin history. The workshop adds return navigation for review. No production availability or entitlement change is inferred.
- Real checkout/payment/entitlement, consumer record access and authenticated live member notification delivery remain **not verified**. Synthetic inbox recovery is not delivery evidence.
- #223 remains intact. No migration, production settings/data/schedules/access, provider spend, merge or deployment was changed by this investigation.

## Combined code acceptance

#224 and #225 remain draft lanes. Claude ACKed selector-only changes in four shared browser scripts (issue #65 comment 6686610273). Preserve his `/nfl` path edits during draft integration. Full final-head combined results, retained viewport artifacts, negative-control outcomes and any reproduced corrections belong in the final issue/PR packet; no source-branch green run substitutes for combined acceptance.

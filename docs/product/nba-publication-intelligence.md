# VQ-AP-002 · NBA publication intelligence

## Baseline and evidence authority

PR #280 merged as `284418b459e6c61c1d6a5ac35945e06b9062e7ec`. The production homepage deployment marker matched the READY Vercel production deployment `dpl_644RWPL11q68ksjyRaarWA65K39k` during the November 13 read-only audit. Both synthetic panels are served after the MFA administrator gate in production.

| Source | Evidence and limits |
| --- | --- |
| `cron.job` and `cron.job_run_details` | `nba-threes-post` is active with `20 14,15 * * *` in GMT. Scheduler success means the job returned successfully. The publisher can return WAITING, SKIPPED, NO_GAMES, or even record FAILED while the cron call succeeds. |
| `nba_games` and latest ESPN NBA `feed_runs` | Mirror the publisher's season-type-2 Eastern tipoff predicate. Current eligibility requires the latest successful schedule run to cover the day and be no more than 30 minutes old. A positive count establishes that the publisher has stored games matching its slate predicate. A zero count requires a fresh, explicit completeness attestation for the exact Eastern slate. The authoritative signal must come from the schedule ingestion boundary after a complete upstream response for that date has been validated and reconciled with the stored slate. It must carry the Eastern slate, evaluation timestamp and an explicit complete flag. A batch date range, a successful cron run or an empty stored slate alone cannot establish completeness. The current collector has no such attestation, so the SQL returns null for coverage and a zero count remains EVIDENCE_UNAVAILABLE. |
| `private.nba_threes_posts` | Day-keyed latest disposition. POSTED must bind to an actual post. An overwritten journal cannot reconstruct every attempt. |
| `community_posts` and private Dealer binding | Match the journal ID, Eastern publication time, exact card and sport, research content markers and the configured publisher's verified Dealer identity. Duplicate card markers invalidate unique attribution. Structural content verification does not recompute stats or simulate member-specific visibility. |

The observation deadline is a proposed monitoring convention, 15 minutes after the last configured tick. It changes no job cadence. A suspected overdue or missing result is separate from an explicit publisher FAILED disposition. A verified unique Dealer card retains PUBLISHED when the journal says FAILED. The contradiction stays open for human reconciliation and suppresses the failure proposal. Invalid offsets, scheduler state/end-time conflicts, and invalid or wrong-day journal timestamps produce visible integrity warnings and suppress deadline inference. Each refresh recomputes stable incident IDs and a decision record. Review acknowledgments are browser-memory only. Duplicate rows are bounded to the number needed to detect duplication. Evidence snapshots expire after one minute. Raw bodies, scheduler commands/errors and Dealer UUIDs are excluded.

## Isolation and setup

`scripts/operations/nba-publication-evidence.sql` is a review artifact outside production migrations. Install only in a separately approved isolated Supabase project with the compatible schema, cron metadata and an existing MFA administrator. The RPC is stable, parameterless, uses a fixed search path and reuses the complete Operations list authorization gate. Anonymous and service-role execution are revoked. The server calls it via the verified user bearer and a read-only GET RPC only when Vercel is in preview, the server-only VQ_PUBLICATION_PREVIEW_LIVE_ENABLED switch is explicitly true, and both the explicit preview project reference and the Supabase URL match a non-production project. Neither a service key nor an arbitrary caller URL is used. The default hosted preview serves labeled fixtures and reports live-source unavailability. The existing Operations shell may continue using its configured backing project for baseline reads.

A future production observation requires separate CEO approval, a least-privilege function owner with narrowly reviewed read grants, production-scale query plans, and a shadow validation of provider coverage, timeouts and day boundaries. Start with seven days of on-demand admin observations. Reconcile each proposal against the cron, journal and actual card, track false positives, and require zero production writes. A later durable audit or alerting rollout requires separate review.

## Supervised diagnosis design

The preview renders deterministic observations and draft investigation steps. A later model may take only the sanitized report and approved historical summaries and emit a schema-validated facts-with-evidence-IDs list, separate hypotheses, draft tasks and proposed runbook notes. A human verifies each fact and decides whether to act. The model has no tools, credentials, publisher, task executor or release authority. Model integration, historical retrieval and persistent audit storage are outside this preview batch.

## November 12 · unresolved

Two scheduler runs succeeded at 9:20 and 10:20 a.m. ET. The journal was WAITING with no linked post at 10:20 a.m. ET. Read-only inspection found four stored season-type-2 games and zero matching card markers, with the current Dealer binding verified. A November 11 journal-to-Dealer-card match served as the positive control. Historical source completeness, causation and final member-visible outcome remain unresolved.

## Branch protection and rollback

The branch rules endpoint returned an empty list. Propose PR-only updates, one independent human approval of the latest push, dismissal of stale reviews, resolved conversations, blocked force pushes and deletions, and no automation bypass. Require uniquely named always-reported GitHub Actions checks for tests, types, build and browser smoke, including a conditional Operations acceptance gate that reports success explicitly for out-of-scope changes. Require branches current with main. Verify that the independent reviewer has a distinct eligible GitHub identity. Rules are proposed only.

Retire the preview or revert its branch commit. If installed in isolation, drop only the proposed RPC there after withdrawing the preview. The incident queue and review acknowledgments have no durable records to reverse.

## Skip policy

The RPC projects a bounded reason code from the private journal, plus current verification of the configured Dealer. A verified expected skip requires the recorded insufficient-player-history reason, a verified Dealer, fresh positive eligibility, a same-slate journal timestamp within the latest consistent successful scheduler attempt, and no linked or observed post. Only this assessment suppresses overdue and scheduler-without-post proposals based on a skip. Unexplained, unauthorized, contradictory and insufficient-evidence skips remain reviewable. A verified Dealer post conflicting with a skip remains published and is proposed for reconciliation. The current Dealer check is a present-time observation. Historic identity and manual recovery that lacks a matching cron attempt remain insufficient evidence.

The current hosted staging RPC predates these optional fields. Its skips remain conservative until a separately authorized staging SQL update can exercise the new projection.

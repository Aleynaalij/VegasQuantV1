# Simulator capture contract v0.1 — October 27, 2026

Status: proposed for Claude's migration implementation; no model trained, production migration applied or capture claimed.

## Separate research journal

Use private.sim_pregame_runs with insert-only service-only RPC and admin-only read RPC. No member SELECT/INSERT, service credentials in client, publication triggers, pick/result/bankroll writes. Historical replay and DEMO do not enter this prospective journal.

Required row fields:
- id UUID server generated; schema_version text = vq-sim-capture/0.1
- run_key text unique; game_id UUID FK to authoritative public.games
- model_id text, artifact_sha256 text, protocol_id text
- mode text enum pregame|scenario; scenario_id nullable text
- generated_at timestamptz; recorded_at timestamptz server clock
- historical_cutoff timestamptz
- kickoff_at_capture timestamptz from authoritative games, not caller
- seed text; requested_runs integer; actual_runs integer
- inputs jsonb immutable source manifest and reviewed model inputs
- input_sha256 text; output_sha256 text computed server-side from documented canonical JSONB text
- output jsonb margin/total/team-score distributions, quantiles and ensemble win/tie counts
- blockers jsonb array; replay_manifest jsonb (method, seed, event hash or immutable object reference)
- parent_run_id nullable UUID FK for scenario baseline; no overwrites.

RPC rules: actual_runs > 0 and <= requested_runs; timestamps historical_cutoff <= generated_at <= recorded_at < authoritative kickoff; reject TBD/cancelled/live/final games. Maximum caller clock skew 5 minutes, historical cutoff not inferred from latest download. registered model artifact/protocol exact-match required; registration is not approval. Per-source manifest has HTTPS URL, downloaded byte SHA256, source_updated_at (nullable), retrieved_at, usable_through and category. Every retrieved_at <= generated_at; observations after cutoff cannot silently enter features. SHA strings lowercase 64hex. Validate finite numeric values, ordered quantiles, nonnegative bin counts, sum bin counts=actual_runs, home/away/tie counts summing actual_runs and consistent n. Store explicit missing-category blockers; fresh weather cannot make stale injury inputs appear current.
Duplicate run_key + same content returns original; conflicting replay fails. Store server digests and document canonicalization; client file hashes remain separately attributed, not compared to a different serialization.
Separate append-only outcome/correction records later; do not put mutable actuals on this forecast row. No backdated captures, updates or deletes. Limit payload size/run count and protect admin read response.

## Evaluation freeze BEFORE fitting
Training <=2022; calibration 2023. 2024 is a once-only simulator test only after recording prior exposure and freezing code/acceptance criteria; it is not globally unseen because existing research viewed it. All already completed 2025/2026 games are retrospective diagnostics. Prospective means only genuinely future kickoff with server timestamp. Target Week10 is operational goal, not permission to backfill.
Metrics: empirical-sample CRPS on margin(home-away)/total; Brier on home-win with ties explicitly defined/excluded and reported; 80% interval coverage and width; score MAE; game-level bootstrap uncertainty. Compare simple frozen historical baselines and same-time market snapshots. Closing spread/total are later evaluation benchmarks, never pregame inputs unavailable at capture. A market point line alone is not a probability distribution: do not compute market CRPS/Brier without a predeclared distribution/probability mapping or exact comparable moneyline pair.
Initial collection is SHADOW_ONLY. Full adoption thresholds require a separate frozen numeric protocol before holdout scoring; this draft does not authorize qualification or invent a pass rule. Do not retrofit existing v0.3 protocol.

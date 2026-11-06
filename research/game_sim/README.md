# NFL game simulator: first integration fixture

Tracking: GitHub #132. Schema version `vq-game-sim/0.1` is a provisional renderer
handoff, not a production forecast API. Claude owns the TypeScript adapter and UI.

`python research/game_sim/demo.py` regenerates `demo.json` deterministically.
`python -m unittest discover -s tests/game_sim -v` checks continuity, field direction,
score reconciliation, metadata and rejected corruptions. Standard library only.

This is a hand-authored partial first-quarter sequence with synthetic teams and
players. Requested/actual ensemble runs are zero. There are no probabilities,
odds, fitted parameters, source-data claims, real player forecasts or database writes.
The fixed generated_at value identifies the fixture, not a prospective capture.
The input hash identifies canonical event bytes; it is not external notarization.

## Adapter contract

Lowercase modes follow Claude's proposal. Only demo is implemented/accepted here.
`teams` has home/away keys. `runs` is requested/actual. `ensemble` is null and
`players` is empty until a real supported batch exists. `replay.selection` discloses
synthetic_script and no distance. Metadata includes model_version/artifact_hash,
input_hash, historical_cutoff, sources and blockers. Null is unknown/not applicable.

Each event has sequence, play_type, possession, period, clock_before_s,
clock_after_s, yardline_100, ball_start_x/end_x, participants, flags, score_delta,
stat_deltas and complete before/after states. Clock is seconds remaining in period.
The first before-state is the initial state; every following before equals prior after.
Absolute x runs left to right on the rendered field. home_defends states which end
home defends; it can change only at an explicit period transition. yardline_100 is
remaining yards to the offense's scoring goal. ball_end_x is the play's dead-ball
position before a possession reset, not necessarily the next snap's ball location.
No player tracking coordinates are present. Stats and scoreboard come from events.
This slice includes rushes, completions, a touchdown, extra point and touchback.
It is not a full rules engine; unsupported football events must not be advertised.

## Next engine milestones

1. Freeze shared JSON schema after UI adapter review; compare fixture acceptance.
2. Audit actual historical play-by-play coverage, licensing, player IDs, missingness,
   source hashes and retrieval/cutoff semantics before fitting. Weekly player logs
   and NGS summaries alone cannot train a play-state transition model.
3. Write temporal evaluation protocol before inspecting holdout: season splits,
   baselines, probability calibration, interval coverage, game-cluster uncertainty,
   full coverage failures. Existing viewed 2025/2026 samples are not untouched tests.
4. Implement isolated seeded state transitions, legal scoring/special teams/period
   rules, workload allocation, correlated batch outcomes and benchmark run counts.
5. Keep demo/pregame/scenario data separate. Real forecasts need immutable hosted
   capture before kickoff; no predictions from retrospective reconstructed inputs.

Do not modify v0.3, adopt rejected NGS v0.4, change NBA pause, publication gates,
provider settings, bankrolls or result ledgers through this work. No production
migration or public route is introduced by this fixture.

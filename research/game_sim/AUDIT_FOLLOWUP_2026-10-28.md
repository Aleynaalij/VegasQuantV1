# Audit follow-up package

Addresses Claude6483151774/6483170765.0.2.10.1 fixes canonical duration ordering,
certifies saved-model semantics and fixes source-independentCI verification.
0.2.11 fixes source-stopped no-call gaps. Every previous artifact/runtime retained.
Canonical reloaded0.2.10.1full10k ensemble and coverage exactly match the original
0.2.10in-memory certified batch; explicit numeric-key regression added.

Latest0.2.11mechanical tests pass, but statistical clock checks DO NOT.
Original8checks:all4scoringPASS;TO7.3488vs7.78229FAIL;FGattempt/lateFG/late decisions
PASS. Ninth diagnostic:late stopped continuing ordinary plays1.995vs4.48339FAIL.
Original diagnostic source-counter bug is preserved in v0.2.11 and corrected,
without re-simulation/model change, in v0.2.11-evidence-correction. The corrected
manifest explicitly marks diagnostic_correction_only. Exactbatch/model hashes
match original. Tests cover blank administrative timeout possession/down fields.
Prefix1000:2053flagged-source no-call continuing plays,0unreplaced phantom gaps.
No inference that repaired bookkeeping establishes late-game strategy accuracy.

Claude: audit the corrected numeric ordering, saved-file build, source-independent
CI check and source no-call runoff logic. Then diagnose remaining lookahead/late
exposure policy from the complete saved run. Do not adjust a constant to target
4.48 or7.78. Keep team-layer protocol frozen and separate; don't use successful
league aggregates as permission for team/player win/margin forecasts. Read our
team-protocol amendments6483704618 before declaring a never-downloaded holdout
or a market-supplied normal distribution. No memberrelease/modelapproval/DBwrites.

Evidence commands:
python -m unittest discover -s tests/game_sim
python -m research.game_sim.verify_package --folder research/game_sim/artifacts/v0.2.11-evidence-correction --source /path/play_by_play_2022.csv.gz
Without --source, integrity/replay/diagnostics verify but source bytes explicitly
remain unverified. CI must keep source-independent tests active; no blanketskip.

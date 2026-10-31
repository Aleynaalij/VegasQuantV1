# Baseline corrections: all attempts retained

Every run: 10,000 games, seed 1701, old opening-TD overtime, same 271 complete
2022 REG games and source SHA. These are in-sample diagnostics, not calibration.

- 0.1.2: kickoff inversion and penalty LTG corrections; fails total and TD.
- 0.1.3: restored representable enforced live-ball penalties; fails total and TD.
  New regression fixtures then found yardage-first-down source rows were wrongly
  excluded after distinguishing automatic-first from gained-first downs.
- 0.1.4: includes that source-row acceptance fix. Punts/FG pass; total/TD fail.
- 0.1.5: predeclared finer distance/field/goal-to-go bins. TD improves, but field
  goals deteriorate; total/TD/FG fail. NOT accepted or declared better overall.

No thresholds changed, no seed shopping, no fabricated scoring. No team coupling
is enabled. Historical v0.1.1 artifacts remain unmodified but are known to contain
incorrect kickoff possession; their archived output is not a usable predictor.
Current correction branch uses model0.1.5 solely to reproduce the latest failed
experiment, not as a promoted replacement. Full missing-scoring diagnosis remains
open: next investigation must trace drive termination, field-goal attempt/make
selection, clock and red-zone transitions against source states before another
model change. Adding points or rebranding a failed gate is not a correction.

Reproduce the latest run:
`python -m research.game_sim.reproduction --source <actual-2022-pbp.csv.gz> --output <report.json>`
Report also writes a deterministic compressed model beside it (`.model.gz`).
Earlier model snapshots can be reconstructed from the distinct development code
changes recorded in the protocol/results; only latest implementation is executable
here. No old snapshot is overwritten. Do not run older-model IDs with new code.

## 0.1.6 survival censoring + accepted-only penalty routing
10,000/10,000 completed, zero failures. Total41.1329 vs43.7638 (FAIL),
TD4.7279 vs4.8524 (PASS), madeFG2.728 vs3.3321 (FAIL), punts8.4309 vs8.1181
(PASS).142 unsupported censoring samples additionally block the gate. Pooled
conditional non-TD gains can be missing for long touchdown origins; no short
support was fabricated. Artifact/model+manifest preserved under artifacts/v0.1.6.
This replaces no prior artifact and enables no coupling or live forecast.

## 0.1.7 timeouts and finer late-half clock buckets
Accepted1973 timeout source rows;98 ambiguous timeout contexts excluded. Exhausted
team budgets cannot be sampled.53tests pass.10000complete/0failed;total40.6925
vs43.7638 FAIL,TD4.6889vs4.8524 PASS,FG2.6706vs3.3321 FAIL,punts8.4145vs8.1181
PASS.167unsupportedcensoring samples additionally block. This experiment did not
improve the FG deficit and is not adopted. The old n6→n4 prefixbackoff still
removes clock in sparse contexts; inspect its contribution before another change.
Empirical elapsed times also remain unchanged after timeouts; a complete stopping/
running-clock policy is not modeled. Preserve model/manifest under0.1.7.

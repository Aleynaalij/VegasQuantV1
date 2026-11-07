# Field context correction 0.2.1 — frozen before fitting

Diagnostic: v0.2.0 source-state replay, fixed seed1701, 39347 valid2022REG
scrimmage states sampled once, sampled785FG/blocked-FG vs1044sourceFG;
569late Q2/Q4 <=30s states at<=35 produced46FG vs132sourceFG.
These are diagnostic draws, not an independent validation sample.

Preserve field position in every scrimmage backoff. Context order becomes
phase,clock,field,down,distance,score. Minimum support30 remains; floor is
phase+clock+field even below30, counted as thin support. Non-scrimmage field
uses a constant underscore, since try/kick source coordinates are not the
scrimmage yardline. Missing floor rejects the simulation, never borrows a
kick decision from another field zone. This is a source conditioning change,
not a fixed kick distance, forced score, or tuned action probability.

Keep2022only training, same10000 seed1701 oldOT, original four reproduction
metrics and3combined-SE limits, actual2023 already-inspected calibration,
source and implementation hashes, replay checks. No changing outcomes or
thresholds to pass. Preserve0.2.0 files. No production/model approval,
team/player coupling, database writes, or notifications. Full failure is saved.

## 0.2.2 support correction — frozen after 0.2.1, before fitting
0.2.1: 9995complete/5missing-context failures; four reproduction metrics pass,
0unsupported survival samples. Missing keys are sparse goal-to-go decorated
field zones. Add one final plain-field floor aggregating goal and non-goal
states in that SAME clock and field zone. Never drop the physical field zone
or clock. Retain decorated contexts above it; count all thin contexts as before.
Every fit observation contributes once to each distinct context. No other
sampler/gate/source changes. Preserve failed0.2.1 and run same fixed fullbuild.

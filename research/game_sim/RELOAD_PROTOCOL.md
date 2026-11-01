# Saved-runtime reproducibility correction0.2.10.1 — frozen before fit

Claude6483151774 identifies numeric-vs-lexical stopped-duration iteration.
Sort eligible (integer_duration,count) pairs before rng.choices. No other
probabilities/durations/keys change. Integrated build canonicalizes and reloads
fitted model BEFORE the certified batch, so saved-file semantics are tested.
Regression uses reordered string duration keys and fixed seeds; retain earlier
0.2.10model/batch as immutable evidence of the historical defect.
Same10000seed1701oldOT, original8checks and2023inspectedcalibration. No retuning.
CI package integrity checks do not require local source data: verify manifests,
model and replay without it, explicitly source_hash_verified=false. Separate
source-byte verification runs when supplied; never claim it was done otherwise.
No forecasts/adoption/memberrelease. Phantom-source-stop finding remains open
and is handled only in separately frozen0.2.11, not hidden by this correction.

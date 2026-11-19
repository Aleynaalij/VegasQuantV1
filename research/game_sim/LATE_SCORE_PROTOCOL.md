# Late-score correction 0.2.3 — frozen before fit

Claude independent review6456315074 confirms0.2.2 scoring reproduction and
identifies score-dropping backoff as a blocker for margins/win probabilities.

For non-normal clocks order phase,clock,field,fine-score,down,distance.
After exact/fine-score contexts, use coarse ahead/tied/behind floor; retain
clock+physical field in every context. Goal-status may relax at the floor in
that same field zone. Never use a scoreless late floor. Missing empirical
floor remains a hard failure, thin support remains counted. Normal contexts
unchanged. Every source observation contributes once per distinct context.

Add source-state kneel shares for leading/trailing Q4<=120s, with source counts
and denominators separate from sampled counts. Also identify <=10s trailing
1–3 states to test the reported failure. These are training-state diagnostics,
not new gate thresholds, independent accuracy or actual-game predictions.

Same2022REG fit/10000seed1701/oldOT, unchanged four3combined-SE gates, actual
2023 already-inspected calibration and immutable hashes/replay. Preserve earlier
artifacts. No tuning, forced kneel prohibition, approval, coupling or release.
Timeout gap remains unresolved. Any failed complete experiment is preserved.

# Source-stop/no-call consistency0.2.11 — frozen before fit

Preserve0.2.10.1fixed saved-model reproducibility andallolder evidence.
Claude6483151774found source_followed_timeout=True templates keep a short source
gap without an actual simulated timeout. Fit separate non-followed gap tables
at the same stop_contexts half/band/kind hierarchy. On a continuing late ordinary
run/completion, if the source was timeout-followed but no simulated timeout is
chosen, replace its source stopped gap with an observed non-followed gap.
Do this also when budgets are exhausted or stopped-gap support is absent. Score,
possession and phase changes naturally stop clocks and remain outside this change.

Preferred min30 + same-band/kind thin floor counted. No cross-half/clock borrowing.
Absent non-followed support raises; never silently retains a phantom gap. Draw in
numeric duration order; apply existing min(source_gap,remaining_clock) expiry rule.
A no-call cache refers to the actual state after the committed replacement gap.
Queued timeout paths keep stopped duration. Record original/committed gap,
source-followed flag, runoff replacement, and queued timeout in trace metadata.

Same10000seed1701oldOT andunchanged8checks,2023inspectedCRPS,clockprefix1000,
three kneel seeds. New frozen diagnostic: continuing Q2/Q4<=300run/completions
followed by actual timeout per game, source-vs-sim3combined-SE; additionally
source-flagged no-call continuing plays must have runoff_replaced=true (or fail).
No retuning when any check fails. Report no-call lookahead bias and any residual
late timing/mix discrepancy. No team/player coupling or approval/memberrelease.

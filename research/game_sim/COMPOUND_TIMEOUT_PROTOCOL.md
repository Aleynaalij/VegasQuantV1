# Compound play/timeout source recovery 0.2.7 — frozen before fit

Implement Claude review6458038581 on top of0.2.6; sampler unchanged.
A supported real play with timeout=1 contributes independent ordinary-play
and timeout observations. Ordinary play uses its original field/down/clock and
observed gap. Timeout uses the following same-game/quarter scrimmage state,
within8rows; a later clock is allowed only for compound real plays and must
be within60seconds. Standalone no_play timeout requires identical clock.
Map caller against timeout context possession, reconstruct caller pre-event
budget from original row home/away post-event balances. Reconstruct ordinary
play budgets as well. Never discard a valid play because timeout recovery fails.
Count original rows once, expanded attempts/accepted/excluded events separately.
Retain original source hashes; no synthetic outcomes or clock refunds.

Same2022REG fit,10000seed1701oldOT, unchanged scoring and rawtimeout gates;
2023 already-inspected CRPS; preserve all earlier models and failures. Raw
source includes OT but training remains regulation only: disclose this coverage
gap without replacing the metric/threshold. No two-stage sampler in this version,
no coupling/model approval/member release or notifications. Check event identity,
clock/caller/budget semantics and exclusion counts before full build.

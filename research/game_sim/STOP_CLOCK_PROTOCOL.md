# Stop-aware late-play experiment0.2.9 — frozen before fit

Preserve0.2.8 and all failures. This experiment changes timeout/runoff coupling,
not scoring probabilities, role denominators, priors or thresholds.
Scope: REG source run/completed-pass plays, Q2/Q4 <=300s. Tag whether original
row carries a timeout or immediate next row is a timeout. Observed delta to the
next row for such plays is an empirical stopped-play gap, NOT verified snap-end
tracking or a known pure physical play duration. Keep source counts/hashes.
Duration hierarchy same half + clock band + kind + field20, then same half/band/
kind + coarse lead, then same half/band/kind. Bands10/30/120/300s. Min30 preferred;
last same-band/kind empirical floor may be thin and is counted. No cross-half or
cross-clock pooling; absent support blocks when needed. Select only positive
observed gaps <= original action gap and strictly less than remaining clock;
no arbitrary clock refunds or fabricated durations. No eligible duration leaves
the action uncoupled, counted visibly as missing eligible stopped duration.

Sampler retains its ordinary pre-event timeout decision. For a continuing late
run/completion (same side, no score, scrimmage), sample a candidate stopped gap,
project the actual resulting field/down/score/budgets with that gap, then evaluate
next state's timeout decision once. If selected, commit stopped gap and queue
that exact timeout. Otherwise commit original gap and mark the resulting state
so its already-read timeout decision is not sampled again. Exact-state cache
expires across period/possession/score changes. Consecutive timeouts still legal.
This is a disclosed empirical lookahead approximation: if no timeout chosen,
the decision used candidate stopped-clock context rather than full-runoff clock.
It is not a physically identified clock-control policy or live tracking model.
OT uses h2 source support as existing timeout model does; no OT training expansion.

Freeze same10000seed1701oldOT, unchanged four scoring and timeout/late-decision
checks, source/modeled elapsed by half/band/lead/kind, supported exposure, prefix
trace1000, three kneel seeds and2023 inspectedCRPS. No tuning/seed shopping.
Missing duration support and thin support remain visible; a passing aggregate
alone does not authorize team/player forecasts, model adoption or member release.
Team/player coupling requires base adequacy and separately frozen validation;
never fit or promote another layer just to call the product finished.

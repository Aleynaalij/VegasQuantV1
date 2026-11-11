# Half-specific late decisions 0.2.4 — frozen before fit

Claude review6456820780 found Q2/Q4 pooling suppresses leading Q4 kneels even
in full exact contexts. Separate late-clock contexts with @h1(Q2) or @h2(Q4/OT).
Retain same-clock physical field and coarse lead in every floor.

Selection order: first half-specific context with >=30 source rows and at least
one budget-eligible action; otherwise an eligible existing thin half-specific
coarse floor (decorated, then plain physical zone); otherwise half-pooled coarse
same-clock/field/lead floor; otherwise reject. An exhausted timeout-only bucket
must continue down this hierarchy. Condition eligible action weights BEFORE
the random draw, not after a failed timeout sample. This changes random-stream
consumption; do not compare a single game across versions as a controlled pair.
Normal-clock hierarchy unchanged. Each observation enters each distinct context
once. Count thin support, pooled fallback and exhausted-context skips.

Same2022REG fit,10000seed1701oldOT, unchanged four3combined-SE gates; actual2023
already-inspected calibration, original hashes/replay and all previous artifacts
preserved. No tuning or forced kneeling/kicking. Source-state kneel diagnostics
retain their original denominators; add Q4 leading4–8/9+ bands and report three
fixed seeds1701,1702,1703 as diagnostic draws, not validation. No new outcome gate.

Timeout-rate diagnosis remains separate/read-only for Claude. No approval,
team-player coupling, margins/win probabilities or member publication.

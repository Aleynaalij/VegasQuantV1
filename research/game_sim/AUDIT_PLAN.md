# Independent audit plan for a candidate base package (Claude)

Applies to any package proposed as the TEAM_LAYER_PROTOCOL §0 base. Every step runs on a clean
checkout of the exact published commit, writing into a new directory; no stored evidence is ever
overwritten. Results are posted on #144/#65 in full, including failures.

## 1. Provenance
- The commit is reachable from a remote ref; record the SHA and tree hash.
- Every artifact listed in the package manifest exists, with matching byte count and SHA256.
- The play-by-play source is `play_by_play_2022.csv.gz` with the recorded SHA256 (`0c69a71e…`) and
  retrieval record; no other season is read by the base fit.
- `implementation_sha256` entries match the files in the commit.

## 2. Tests
- `python -m unittest discover -s tests/game_sim -v` passes in full on the clean checkout; the count
  matches the handoff.

## 3. Reproduction
- `verify_package` passes for the candidate.
- Reload `model.json.gz` and run the gate batch (10,000 runs, seed 1701, old OT): ensemble, coverage
  counts and research metrics are byte-identical to the stored batch.
- Re-fit from source with the committed code: the model file hash matches.

## 4. Gates (unchanged thresholds)
- All four scoring gates and all five diagnostics pass on the full 10,000-run denominator.
- Zero failed runs and zero unsupported samples. A survivor subset never counts.

## 5. Kernel and state checks
- Legal states only: down 1–4, distance ≥ 1, yardline 1–99, clock non-negative and monotone within a
  period, timeouts 0–3 per half, possession changes only on defined events.
- Score conservation: final score equals the sum of scoring events.
- Credited stats reconcile with events where the engine claims support.
- OT follows the requested rule (old opening-TD for 2022/2024 regular season).

## 6. Approximation review
- Every backoff, pooling or fallback path is listed with its count in the 10,000-run batch.
- Any path that drops a clock, budget or score dimension is identified and justified in the frozen
  protocol, or reported as a finding.
- Band traces (timeouts by quarter/band), kneel audit and late-game diagnostics are compared with
  the source and reported.

## 7. Calibration context (not a gate)
- The already-inspected 2023 CRPS / Brier / 80% coverage comparison is reproduced and reported. It
  does not qualify or disqualify the base; it is context for the team layer's Arm A.

## 8. Outcome
- PASS only if sections 1–5 all pass. Section 6 findings are either accepted as disclosed or block.
- On PASS, a separate commit writes the base SHA, `model_sha256`, `implementation_sha256` map and
  source hash into TEAM_LAYER_PROTOCOL §0. On FAIL, the team layer keeps waiting.

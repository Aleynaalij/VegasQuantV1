# NGS risk flags: holdout result (October 22, 2026)

Plan: `docs/research/ngs-backtest-plan.md`, written before any result.
- Dataset: NGS-002 (`research/ngs/backtest.py`, #102), 25,473 candidate legs for 2018–2025. Rebuilt on main after #103 and identical in row count to Codex's run.
- Evaluator: `research/ngs/evaluate_holdout.py`, committed in `53d4073` before it ran.
- Holdout: 2024–2025, run once. Full output with the dataset hash is in `ngs-backtest-results.json`.

**No flag becomes a rule proposal.** A flag needed a clear-rate gap of at least 8 points, at least
150 flagged legs and a 95% interval excluding zero. No flag met the gap condition: the largest gap
in the warning's direction was 1.8 points.

| Flag | Statistic | Flagged | Clear rate flagged | Unflagged | Difference (95% interval) |
|---|---|---:|---:|---:|---|
| F1 low separation | receiving yards | 398 | 65.1% | 63.0% | +2.1 (−3.4, +7.3) |
| F3 YAC over expected | receiving yards | 435 | 62.3% | 63.9% | −1.6 (−6.9, +3.6) |
| F1 low separation | receptions | 214 | 70.6% | 67.6% | +3.0 (−4.0, +9.3) |
| F2 low catch rate | receptions | 128 | 66.4% | 68.2% | −1.8 (−10.7, +6.2) |
| F4 low RYOE | rushing yards | 176 | 67.6% | 65.7% | +1.9 (−5.9, +9.1) |
| F5 stacked boxes | rushing yards | 258 | 65.1% | 66.2% | −1.1 (−7.9, +5.3) |
| F6 low CPOE | passing yards | 104 | 64.4% | 65.7% | −1.3 (−11.5, +8.1) |

F2 and F6 also have fewer than 150 flagged legs. Three flags (F1 twice, F4) point the opposite way:
flagged legs cleared slightly more often.

## What it means

These weekly NGS warnings say nothing reliable about whether a leg that already passes our
recent-form rules will hit. This matches the model result in #101 (v0.4): weekly NGS summaries add
little beyond each player's recent volume and output.

## Limits

- Prices are an assumed -200 (R1 at 66.7% + 5), not historical quotes.
- nflverse files are corrected snapshots, not point-in-time publication vintages.
- Missing flags (player under NGS volume minimums) are excluded, not counted as unflagged.

## Decision for the owner

The plan allows failed flags to "stay as descriptive context or be removed from the risk text."
Recommendation: keep the NGS numbers in the leg's "why", but stop presenting F1–F6 as **risks**.
Calling them risks implies they predict misses, and this test says they don't. The defensive
matchup line (#103) has not been tested; it should be described the same way until it is.

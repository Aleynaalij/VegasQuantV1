# Frozen empirical baseline protocol — October 27, 2026

Freeze before first fit or batch evaluation in this implementation. League baseline
only, not a claimed team-strength or current-player forecasting system. No model
approval or numeric edge is implied.

- Fit: 2022 regular-season PBP only. Existing 2023 file is calibration/diagnostics
  only; never added to training. No test seasons downloaded by fitting code.
- Empirical template sampling conditions on phase, down, distance bucket, field
  bucket, late-half clock and score lead/tie/trail. Use deepest prefix with at
  least30 templates; phase fallback otherwise. Record backoff/rejected-template
  coverage. Sampling legal outcomes after rejections changes the conditional
  distribution; expose counts rather than claiming calibrated probabilities.
- Clock: empirical gap to next source event capped only to remaining period clock.
  Missing/>60-second/non-positive snap gaps excluded. This includes pre-snap
  timing, not a fitted strategic timeout/two-minute policy.
- Rules: explicit normalized no-play penalties, field boundaries and turnovers;
  both-possession ten-minute regular-season OT configurable separately from old
  opening-TD sudden death. Source training kickoff placement remains historical.
  Compound live-ball penalties, possession-exception details and unrepresented
  source outcomes are excluded/countable limitations, not magically supported.
- Replay: smallest L1 distance of home/away final scores to their ensemble medians;
  lowest seed tie-break. Never select after seeing actual results.
- Summary: actual completed runs only, requested/failed counts prominent; failed
  runs must block forecast qualification. Keep ties separate. Bins sum to actual n.
- Evaluation: margin/total empirical CRPS, home-win Brier with ties excluded and
  counted,80% central interval coverage/width and score MAE. Compare frozen league
  historical and same-time market baselines where actually observed. A spread or
  total point estimate alone is NOT a distribution or win probability.
- Freeze calibration adjustments before holdout. No historical reconstruction is
  prospective. Any future matchup forecast needs current verified team/roster,
  availability, applicable rules, input/source timestamps and pre-kickoff hosted
  immutable capture. Current baseline does not meet that requirement.
- No acceptance threshold/model adoption in this first operational baseline.
  Qualification still requires its own frozen scope/sample/uncertainty criteria;
  no report can promote this artifact.

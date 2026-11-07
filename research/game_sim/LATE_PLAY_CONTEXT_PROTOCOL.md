# Q4 two-to-five-minute play contexts v0.2.23 — frozen before fit (Claude)

Base: v0.2.22 (`artifacts/v0.2.22`, 8 of 9 checks; preserved failure on late timeout-followed
continuing plays, 4.0997 vs 4.4834, tolerance 0.327). One change.

## Finding
The frozen diagnostics were re-run on v0.2.22; definitions unchanged.
- `diagnostics/budget-at-opportunity-0.2.22.json`: Q4 121–300 s running opportunities are
  4.74 per game vs 5.59 in the source, while the call rate there matches (0.192 vs 0.188). This is
  the largest single remaining shortfall (about 0.14 calls per game).
- `diagnostics/late-elapsed-0.2.22.json`: in the same band, no-timeout completions still take
  31.1 s vs 23.1 s, runs 33.1 vs 30.7 and sacks 34.5 vs 28.1. Inside 120 s they match.
- **Cause:** play contexts (`model.bucket`) have only `last10`, `last30`, `last120` and `normal`
  clock flags. Q4 plays at 121–300 s draw from whole-game `normal` contexts and inherit normal-pace
  gaps, while real offenses speed up there. The timeout model already treats this window
  separately (`last300@h2`); play selection does not.

## Change
1. `bucket` gets a `last300` clock flag for period 4 and OT at 121–300 s. Periods 1–3 are unchanged,
   and so is every other flag.
2. For a `last300` state, every late key needs at least 30 plays: the existing late-key shapes
   (`phase|last300@h2|field|fine-lead|down|distance` → … → floor `phase|last300@h2|zone|coarse`).
   No thin `last300` floor is drawn from.
3. If no `last300` key has 30 plays, the state falls back to exactly the contexts v0.2.22 would use
   (the `normal` branch), counted as `last300_normal_fallback`.
4. Support, audited before fit (`diagnostics/last300-play-support.txt`, source `0c69a71e…`): 2,281
   source scrimmage plays in Q4 121–300 s (8.42 per game). 6 of the 21 zone × lead floors are under
   30, mostly tied games, and those states use the fallback.

Unchanged: the v0.2.22 two-minute warning and censoring, the v0.2.21 residual timeout cells, stop
and runoff tables, all other contexts and rules, and the gates.

## Acceptance (unchanged)
10,000 runs, seed 1701, old OT, all nine checks at the existing tolerances, zero failed or
unsupported runs, and saved-model reload. Reported alongside: fallback counts and the two frozen
diagnostics re-run on the new package. A failure is preserved; no retuning.

## Result (2026-11-07, appended after the run; nothing above was changed)
Package `artifacts/v0.2.23`, built from `915fbaa`. `verify_package`: 6 files and 25 implementation
hashes verified against the source. 10,000 / 10,000 complete, 0 failed, 0 unsupported samples.
**All nine unchanged checks PASS:**

| check | sim | source | tolerance | |
|---|---:|---:|---:|---|
| total | 44.7862 | 43.7638 | gate | PASS |
| touchdowns | 5.0143 | 4.8524 | gate | PASS |
| field goals | 3.2714 | 3.3321 | gate | PASS |
| punts | 7.7713 | 8.1181 | gate | PASS |
| timeouts | 7.6400 | 7.7823 | 0.389 | PASS |
| FG attempts | 3.8560 | 3.9188 | 0.322 | PASS |
| late FG attempts | 0.4400 | 0.4871 | 0.110 | PASS |
| late decisions | 1.7567 | 2.0996 | 0.375 | PASS |
| late timeout-followed continuing plays | 4.2462 | 4.4834 | 0.327 | PASS |

- Saved-model self-check (`diagnostics/reproduction-0.2.23-selfcheck.json`): the refit model hash
  matches, and the reloaded 10,000-run batch differs only in `generated_at` and `runtime_seconds`.
- Counters: 2,833 `last300_normal_fallback` draws; 14,869 warning-censored gaps resampled and 379
  unresolved (kept and counted); 50,169 thin-context samples (existing behaviour, disclosed).
- 2023 already-inspected CRPS, context only: margin 8.1822 vs 8.0656, CI [−0.033, 0.262]; total
  7.6492 vs 7.5984. No superiority shown. This is not a gate, and it reminds us the league baseline
  is not a forecast.

**Status against TEAM_LAYER_PROTOCOL §0:** v0.2.23 meets the nine checks, 10,000 / 10,000 with zero
unsupported samples, and saved-model reproduction. §0 also requires an **independent audit**. I built
this package, so my own checks are a self-check, not that audit. It is a §0 *candidate*, not the
selected base. §0 is not filled in until an independent audit per `AUDIT_PLAN.md` passes.

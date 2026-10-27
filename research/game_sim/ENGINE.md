> Milestone1 historical record. For the completed runnable research baseline, see RUNNING.md.

# Game engine milestone 1: actual PBP audit and regulation transition kernel

Owner direction October 27, 2026; #132. No changes to v0.3, UI, provider settings,
publishing, model approvals, results or bankrolls. This is implementation, not a
qualified simulator. No fitted team/player probabilities or prospective runs yet.

## Delivered

- `audit_pbp.py` discovers actual CSV assets through the nflverse GitHub release,
  verifies download length, hashes downloaded bytes and records source update /
  retrieval times, complete field names, per-field nonmissing counts, play types,
  row/game counts and duplicate game/play keys. Missing is never zero.
- `state.py` is an immutable, deterministic regulation transition kernel. Ordinary
  snaps advance field position/down/distance, touchdowns require a conversion,
  sacks/kneels lose yardage, safeties score the other team, turnovers flip field
  direction, kicks reset possession, missed field goals use the kick-spot/20-yard
  rule, quarter breaks preserve down/spot, halftime resets possession and ties at
  regulation expiry explicitly require unimplemented overtime.
- `check_pbp_kernel.py` compares supported ordinary consecutive snap transitions
  against the actual next row. This is rules consistency, NOT prediction accuracy.
  The checked subset excludes complex/discontinuous/missing states with counts.
- Unit tests cover first downs/goal-to-go, possession flips, scoring, end-of-half,
  quarter retention, full four-quarter scripted score conservation and rejected
  illegal/unsupported events. Reproducible check uses standard library only.

## Actual source audit

| Season | Role | Rows | Distinct game IDs | Duplicate game/play IDs |
|---|---|---:|---:|---:|
| 2022 | training source audit | 49,434 | 284 | 0 |
| 2023 | calibration source audit | 49,665 | 285 | 0 |

Exact source URLs, downloaded-byte SHA256, asset timestamps and required-field
coverage: `pbp-audit-2026-10-27.json`. Game IDs include source-listed games; these
counts are not a claim that every listed game has a verified final result.
No 2024/2025/2026 PBP downloaded or scored in this milestone.

## Rules gaps / diagnostics

Not a complete NFL rulebook: penalties, overtime, kick returns/blocks, onside kicks,
fumble recoveries/advances, laterals, defensive scoring returns, timeouts and clock
management policy remain unsupported. Kickoff placement is an explicit caller
input, not a fabricated season-independent touchback rule. No season-specific OT
or kickoff rules are claimed. The conversion abstraction does not decide whether
a meaningless end-game try is necessary. Production fitting/run generation stays
blocked until these gaps have explicit handling and validation.

The initial consistency report is preserved as `kernel-pbp-check-initial-2026-10-27.json`.
Its mismatch examples exposed recovered-fumble advances absent from yards_gained.
The follow-up explicitly excludes ALL fumbles/laterals, not just lost fumbles, in
line with the kernel's unsupported-event scope. It does not count those rows as
correct transitions. Residual mismatches remain visible, not silently corrected.
Neither file is an untouched holdout or a performance/EV claim.

## Reproduce

```
python -m unittest discover -s tests/game_sim -v
python research/game_sim/audit_pbp.py --seasons 2022 2023 --cache /path/data --output /path/audit.json
python research/game_sim/check_pbp_kernel.py --data /path/data/play_by_play_2022.csv.gz /path/data/play_by_play_2023.csv.gz --output /path/check.json
```

## Next milestones

1. Classify residual rule mismatches; implement explicit penalties/returns/OT
   handling without deleting unsupported coverage from reports.
2. Freeze statistical training/calibration and evaluation protocol before fitting:
   train <=2022, calibration 2023; disclose prior exposure to later seasons. Already
   completed games can be retrospective diagnostics, never prospective captures.
3. Fit context-conditioned play/outcome/clock/workload distributions from audited
   source rows; record exclusion reasons and coverage. No multiplication of v0.3
   marginal prop probabilities to make same-game parlay probabilities.
4. Seeded batch runner, representative replay selection, quantiles, calibration/
   score interval validation and runtime benchmarks. Only then wire actual run
   outputs to the UI and existing immutable prospective capture contract.

## Sources / attribution

Play-by-play: nflverse / nflfastR, https://github.com/nflverse/nflverse-data/releases/tag/pbp
and https://nflreadr.nflverse.com/reference/load_pbp.html . Repository declares
CC BY 4.0: https://github.com/nflverse/nflverse-data . This integration does not
include proprietary participation, live tracking or GSIS/NGS vendor entitlements.
Retain attribution, source URLs, hashes and any applicable provider-specific terms.

### Follow-up consistency results (not model validation)

Supported-pair checks: 2022 29,607/29,608 matched; 2023 29,893/29,893.
Remaining source discrepancy is 2022_16_LAC_IND play3371: yards_gained=13,
description says12 and next field position54 from starting66 also implies12.
The kernel uses the structured13; the discrepancy remains in the report and is
not "fixed" by overwriting source data. Excluded recovered-fumble/lateral rows
need their own state/credited-stat representation before training can use them.

# Runnable research engine — v0.1.1

The engine now runs full regulation games and regular-season overtime with seeded
empirical sampling, replay selection and batch distributions. It is an operational
**league-level research baseline**, not a finished current-matchup predictor.
Do not remove its blockers or expose it as approved picks.

## Completed code

- Accepted no-play/dead-ball penalty enforcement, half-distance abstraction,
  automatic first downs/loss of down, recovered fumbles, turnovers, blocked kicks,
  defensive/kick-return TDs, onside recovery position, timeout budgets and halftime
  reset. Actions are normalized inputs, not an inference of compound NFL penalties.
- Old opening-TD sudden-death and newer both-possession **regular-season** ten-minute
  overtime; kickoff-return TD, second-team conversion and clock-expiry cases tested.
- 2022 empirical phase/down/distance/field/clock/script templates with transparent
  backoff, missing-data exclusions and illegal-template rejection counts.
- Stable seeded batches, actual/failed counts, ties, histograms, quantiles and a
  declared typical replay (minimum L1 team-score median distance; lowest seed tie).
- Separate-RNG workload scenario allocator: caller supplies reviewed identities,
  explicit weights and timestamped hashed sources. Unknown availability is rejected.
  Ordinary credited stats reconcile; incomplete target/compound-fumble/lateral stats
  stay unsupported. Scenario assumptions are not independent proof of clearance.
- Retrospective CRPS/Brier/80%-interval diagnostics and game-resampled intervals.
  No betting-price benchmark is guessed from a spread or total point line.
- Research render handoff, explicit before/after quarter clocks and extended play
  types. It is **not** silently mapped into the existing demo-only0.1 adapter.

## Reproduce

```
python -m unittest discover -s tests/game_sim -v
python -m research.game_sim.batch --model research/game_sim/artifacts/v0.1.1/model.json.gz --runs 10000 --seed 1701 --output /path/batch.json
python -m research.game_sim.render --batch /path/batch.json --output /path/research-render.json
python -m research.game_sim.evaluate --batch /path/batch.json --training /path/play_by_play_2022.csv.gz --calibration /path/play_by_play_2023.csv.gz --output /path/diagnostics.json
```

To reproduce fitting, add `--train /path/play_by_play_2022.csv.gz` and write a new
`--model /path/model.json`. Calibration file2023 is never fitted. The source downloader
and exact hashes are in the milestone1 audit. Workload scenarios are opt-in using
`--workload-context /path/reviewed-scenario.json`; never populate them with guesses.

## Artifact/results

`artifacts/v0.1.1/manifest.json` identifies the actual canonical model bytes and
compressed bytes, source audit and implementation hashes. `benchmark-summary.json`
contains exact run counts/runtime/coverage. Compressed full benchmark, per-game
calibration diagnostics and renderer output accompany it. Runtime is measured on
this machine, not a phone or hosted service promise. JSON object key ordering and
prepared-table caching do not change seeded outcomes (regression tested).

The initial0.1 batch revealed fit/save/reload key-order instability; it was corrected
in0.1.1 before adopting an artifact. Original hashes/summary are preserved in
`superseded-summaries.json`. No calibration-driven parameter tuning occurred.
A subsequent rare OT kickoff-return correction was tested and the final10k batch
was regenerated; prior benchmark metadata is preserved, not called final output.

## What this does NOT establish

The2023 calibration diagnostics do **not** show an advantage over the historical
league baseline (especially total-score CRPS). Keep that failure visible. No
2024/2025/2026 holdout has been downloaded/scored by this experiment and no current
matchup forecast is published or journaled. Source data is historical; conditional
sampling and operational correctness do not make probabilities calibrated.

Current-team offensive/defensive adjustments, current verified player workload,
full compound penalty/return-credit semantics, postseason OT, current-season
kickoff distribution and model calibration/qualification are not complete.
Do not claim this league baseline answers those questions. Current-game support
requires that work and documented current inputs; historical team/player labels
are never current roster/availability evidence. The journal exists separately,
but this baseline cannot truthfully satisfy its complete pregame-source contract.

No wagers, prices, provider settings, platform publications, notification triggers,
model approvals or bankroll/result ledgers were changed.

## Rules references

NFL Football Operations2025 rulebook, including Rule16 regular-season overtime:
https://operations.nfl.com/media/ntif5hxb/2025-nfl-rulebook-final.pdf
https://operations.nfl.com/rules-officiating/featured-rules
Historical kickoff samples are retained rather than silently calling them current
2025/2026 dynamic-kickoff placement. This normalized kernel is not a claim to
implement every exception in the NFL rulebook.

## Integrated build v0.2.0
Run the complete research pipeline once:

```
python -m research.game_sim.integrated \
  --source /path/to/play_by_play_2022.csv.gz \
  --calibration /path/to/play_by_play_2023.csv.gz \
  --output /path/to/new-artifact-directory
```

The output directory must not already exist. This fits only2022, runs10,000
seed1701 games under2022oldOT, computes the unchanged reproduction gate and2023
retrospective CRPS diagnostics from the SAME batch, verifies its typical replay
against the kernel, and writes compressed model/batch/gate/calibration/replay plus
source/implementation/file SHA256 manifests. See INTEGRATED_BUILD_PROTOCOL.md.
Do not route these research artifacts to the current-matchup renderer or journal
as approved forecasts. The model still has no fitted current team/player layer.

Actual v0.2.0 checks:10,000complete/0failed/0unsupportedcensoring. Total42.6743
vs43.7638 andTD5.0241vs4.8524 pass; madeFG2.5561vs3.3321 andpunt8.8385vs8.1181
fail.1,429samples used thin clock support.2023totalCRPS7.60956vs7.59845historical,
margin8.14466vs8.06563; neither bootstrap difference demonstrates superiority.
The entire reproduction gate is FAILED. No model approval/coupling/publication.
The integrated software build is prepared; independent review remains required.

## Field-preserving build 0.2.2

The prior 0.2.0 field-goal/punt failures were traced to backoff dropping field
position. `FIELD_CONTEXT_PROTOCOL.md` freezes the correction and its same-zone
goal-status support fallback. `audit_decisions.py` reproduces the source-state
sampling diagnostic; it is not held-out validation.

Actual 2022REG, 10000 runs, seed1701, old opening-TD OT: **10000complete,
0failed, 0unsupported censoring**. Original unchanged3combined-SE gate PASS:
points43.4079vs43.76384;TD4.8218vs4.85240;madeFG3.2637vs3.33210;
punts8.1626vs8.11808. 4126thin-context draws are counted. 0.2.1 remains
preserved: all four metrics passed but5missing-goal-context failures blocked it.

Remaining diagnostic: timeouts6.2731vs7.78229 FAIL. FGattempts andlateFGattempts
now pass their diagnostic bands. 2023 already-inspected calibration272games:
totalCRPS7.610956vs7.598449historical; margin8.146463vs8.065627. No demonstrated
superiority, no adoption. Calibration, source hashes, implementation hashes,
reproduction and replay are immutable under `artifacts/v0.2.2`. The complete
build can be reproduced with the integrated command above and a NEW output
folder. Existing directories cannot be overwritten. Model remainsSHADOW_ONLY;
no team/player coupling, current-matchup forecasts, approval or public release.

Check: `python -m unittest discover -s tests/game_sim` —62testsPASS.

## Late-score build 0.2.3 (Claude review6456315074)

Frozen in `LATE_SCORE_PROTOCOL.md` before fitting. Late contexts retain coarse
lead status in every floor as well as clock and physical field; fine score is
before down/distance. Source-state kneel diagnostic reproducible with
`python -m research.game_sim.audit_decisions --model <model.gz> --source <2022.gz>`.

10000seed1701oldOT:10000complete,0failed,0unsupported censoring. Original
reproduction gatePASS: total43.6432vs43.76384,TD4.8444vs4.85240,
FG3.2894vs3.33210,punts7.7557vs8.11808. 23211thin-context draws disclosed.
Timeouts6.1558vs7.78229stillFAIL. LateFGattempts.5417vs.48708pass.

Single-seed source-state diagnostic, never held-out prediction:
leading Q4<=120s kneel118/692=.17052 vs308/692=.44509 source (0.2.2draw69);
trailing23/1214=.01895 vs8/1214=.00659 source (0.2.2draw72);
trailing1–3 Q4<=10s5/33=.15152 vs0/33source (0.2.2draw7).
Thus score mixing is reduced but game-management behavior is NOT fixed.
Coarse behind floors still pool narrow deficits with strategic surrender.
No hard prohibition or tuning added. Margins/win probabilities remain blocked.

2023 already-inspected totalCRPS7.609437vs7.598449historical,
margin8.137279vs8.065627; no demonstrated superiority/adoption.
63Python testsPASS including missing-score rejection and leading/trailing floor
isolation; source/file/implementation hashes and replay verified. No current
matchup/model approval/team-player coupling/public release. Preserve0.2.3 and
its remaining diagnostic failures for independent review before next protocol.

## Half-specific late decisions 0.2.4

Claude6456820780 verified0.2.3 and traced kneel dilution to pooling Q2/Q4 even
in exact contexts. Protocol `HALF_CONTEXT_PROTOCOL.md` frozen before fitting.
Late contexts/floors separate @h1(Q2) and @h2(Q4/OT); prefer existing thin
half-specific floors to pooled ones. Timeout-ineligible contexts continue down
the hierarchy. No action is forced or invented. Normal hierarchy unchanged.

Actual10000seed1701oldOT:10000complete,0failed,0unsupported survival.
Original unchanged reproduction gatePASS: total43.6212vs43.76384;
TD4.8700vs4.85240;FG3.2204vs3.33210;punts7.9687vs8.11808.
41651thin-context draws;222430half-preserved/268half-pooled late draws.
Timeout6.0829vs7.78229 remains a diagnosticFAIL. LateFGattempt.4518vs.48708pass.

Three fixed-seed training-state kneel diagnostics (1701/1702/1703) are NOT
held-out validation. Leading Q4<=120s249mean sampled vs308source, up from
123mean in0.2.3. Trailing8.667vs8source, down from22; trailing1–3last10s0vs0,
down from4.667. Leading4–8 band75vs104source;9+band126.667vs155source.
Leading kneels still under-reproduced. Exact rows/denominators/source/model
hashes retained in diagnostics/half-context-0.2.4.json and baseline0.2.3 file.

2023 already-inspected totalCRPS7.609583vs7.598449historical;
margin8.145091vs8.065627. No demonstrated superiority/adoption.65Python
checks pass including half isolation, thin-floor precedence, exhausted-timeout
context continuation, source/file/implementation hashes and replay.
No margins/win-probability approval, current-matchup forecast, team/player
coupling or member release. Timeout diagnosis delegated read-only to Claude.

## Timeout correction builds 0.2.5–0.2.6 (research only)

0.2.5 reads actual source snap budgets and reconstructs pre-timeout balances
from administrative post-event balances. Late scrimmage keys preserve both
budget flags. 8751/10000 complete:1249missing-context failures; BLOCKED.
0.2.5.1 adds separately counted nested <=30/<=120 clock-window evidence after
all exact-clock contexts fail.9922complete/78failed; BLOCKED.
0.2.5.2 adds final <=300 source-window support without changing normal-clock
decisions.9993complete/7failed; BLOCKED. Saved support grid isolates tied,
near-goal, both-budgets-zero cases. Every failed build/runtime is preserved.

0.2.5.3 adds last-resort NON-TIMEOUT-ONLY source action pools only when BOTH
budgets are zero, where no timeout is legally possible. This is disclosed
conditional-action pooling across budgets, never a fabricated timeout rate.
10000complete/0failed; all4original gatesPASS; rawtimeouts7.0889vs7.78229FAIL.

Only after that passing support build,0.2.6 separately introduces Q4/OT121–300s
last300 decisions; Q2 stays normal and <=120 windows never include later rows.
Frozen protocols precede each fit.10000seed1701oldOT:10000complete/0failed,
0unsupported censoring. Original gatesPASS:total43.2011vs43.76384,
TD4.8008vs4.85240,FG3.2286vs3.33210,punts7.6661vs8.11808.

Rawtimeout7.0997vs7.78229 stillFAIL at unchanged3combined-SE tolerance.38948.
Accepted-source timeouts are7.28044/game; rawsource additionally counts excluded
ambiguous-clock/OT events. This explains part, not an excuse to replace the
original target. Remaining gap requires independent review; no readiness claim.
Late_decisions1.7445vs2.09963 narrowlyPASS(tolerance.37484), retained visibly.

Same-seed first1000replays:1000complete,0failed. Q4 121–300timeouts1.270/game
vs1.247source (prior incomplete-prefix .159). Q1.460vs.435;Q3.519vs.391;
Q2 2.903vs3.280;Q4 3.280vs3.535. Period-band rates, zero-budget shares and
snap denominators retained in diagnostics/timeouts-0.2.6.json. No extra ensemble.
3seedsource-state kneels:leading278.667vs308source,trailing8.667vs8,
narrowdeficitlast10s0vs0;leading4–8band97vs104,9+band128.667vs155.

72Python testsPASS. All source/file/implementation hashes and representative
replay verified.0.2.6 has110177thin-context draws,3133clock-window fallbacks,
1466last300-window fallbacks,11zero-budget pooled-action fallbacks and4234
half-pooled fallbacks, all disclosed.2023inspectedCRPS:total7.604447vs7.598449,
margin8.178088vs8.065627historical; no demonstrated superiority/adoption.
No approval/current forecasts/margins/winprobabilities/team-player coupling or
member release. The owner explicitly authorized uploading this code and model-artifact package
to the public VegasQuantV1 repository for review. This is not model approval
or authorization for member-facing forecasts or release.


## Source-only0.2.7 — compound play/timeout recovery
Frozen COMPOUND_TIMEOUT_PROTOCOL.md at c46a313 before fitting. No sampler
redesign. Original row indices retained; both events fitted independently.
71 REG ordinary plays recovered,70 attached timeouts accepted. Across all rows
75compound flags include4non-REG rows, excluded from both branches. Ambiguous
timeout exclusions95→28. Accepted timeouts1973→2043 (7.28044→7.53875/game).
No OT fit expansion; raw diagnostic still includes sourceOT. Existing artifacts
and exact0.2.6runtime archive preserved. No thresholds changed.

10000seed1701oldOT:10000complete/0failed/0unsupported censoring. Four unchanged
reproduction gatesPASS:total43.0851vs43.76384,TD4.7905vs4.85240,
FG3.2208vs3.33210,punts7.6772vs8.11808. Rawtimeouts7.244vs7.78229
STILL FAIL tolerance.389461. Late decisions1.7406vs2.09963 narrowlyPASS
(.374842 tolerance).111533thin contexts disclosed; this is not readiness.
2023 already-inspected CRPS:total7.603299vs7.598449historical;
margin8.140916vs8.065627historical, difference.0752885,95%gamebootstrap
[-.0436272,.1918812]. No demonstrated superiority.77Python testsPASS.
No coupling/current forecasts/model approval/member release/notifications.
Owner-approved public research package is for independent review only.


## Separate timeout model0.2.8 — implemented, diagnostic failures preserved
Frozen TWO_STAGE_TIMEOUT_PROTOCOL.md6d3cf7c before fit. Ordinary-play bucket,
context_options and contexts functions exactly0.2.4 by AST comparison; timeouts
removed from play buckets. Budget flags/nested windows/zero-budget pooling gone.
Source0.2.7compound recovery retained. Timeout model stores separate empirical
role opportunities/call counts, min30, half/quarter/lead/field20 hierarchy.
Offense Bernoulli first, then defense conditional on no offense call; no forced
calls. Raw snap eligibility uses recorded source budgets; timeout eligibility
reconstructs pre-event balances. Source37059snap+2043timeoutopportunities,
eligibleoffense37778/defense38043. No missingtimeoutcontext or thin timeoutfit.

Actual10000seed1701oldOT:10000complete/0failed/0unsupported. Four original
scoring gatesPASS:total43.6712vs43.76384,TD4.8593vs4.85240,
FG3.254vs3.33210,punt7.8292vs8.11808. Rawtimeouts7.2678vs7.78229
FAIL tolerance.389564;late_decisions1.7191vs2.09963 FAIL tolerance.374743.
Do NOT call this all-checks-pass or reproduction of Claude's7.886 prototype.
Original target/seed/limits unchanged; failed diagnostics preserved, no tuning.
FGattempt3.8165 andlateFG.4217pass their unchanged checks.46432thin ordinary
play contexts;timeout depth0/1/2/3 counts2808784/95045/25305/6856.
2023already-inspected CRPS margin8.160064vs8.065627historical (difference.094437,
95%CI[-.038028,.223947]);total7.610271vs7.598449. No superiority established.
Three fixed source-state audits:mean leadingkneels250vs308source,
trailing6.667vs8,narrowlast10s0vs0;leading4–8mean86.667vs104,
leading9+124vs155. Source-state diagnostic, not independent validation.
Same1000seed-prefixtrace and exact runtime archived.83Python testsPASS,
including source compound opportunity counts, budget exclusion, min30failclosed,
role priority and prepared-table path reproducibility. Historical artifacts kept.
Claude was asked for exact tested prototype/counts to resolve measured mismatch;
no new sampling revision until diagnosed. No coupling/current forecasts/model
approval/member release/DBwrites/notifications.

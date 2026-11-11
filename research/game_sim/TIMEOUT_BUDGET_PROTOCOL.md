# Budget-conditioned late timeouts 0.2.5 — frozen before fitting

Per Claude6457379831/6457397249, source scrimmage states read validated integer
posteam/defteam_timeouts_remaining (0..3) into the correct home/away budgets.
Missing/invalid source budgets are excluded, never assumed3. For late SCRIMMAGE
contexts add oTO:y/n,dTO:y/n immediately after clock/half and retain both in every
floor, including half-pooled floors. Non-scrimmage and normal-clock hierarchy
unchanged. Legal-budget filter remains a safety check; no flag-dropping fallback.

Actual source-row audit shows timeout administrative rows and their following
snap contain POST-timeout balances. For timeout templates, retain the original
exact-clock following field/down context, but reconstruct PRE-timeout budgets
from the timeout row's home/away balances by adding one to its verified caller.
Do not borrow a future snap's balance across consecutive same-clock timeouts.
Caller must reconstruct to1..3; unknown/invalid budgets are excluded and counted.

No last300 change here. Same2022REG fit/10000seed1701oldOT, original four
3combined-SE reproduction gates and raw timeout diagnostic unchanged. Raw
source timeout count includes OT and excluded events; additionally disclose
accepted-fit count and period x band diagnostics (timeouts/game, timeouts/100
snaps, zero-budget snap share) with explicit denominators and missing counts.
Keep late_decisions and source-state kneel diagnostics. Same2023 inspected
calibration, immutable hashes/replay, all prior experiments preserved.

If quarter-shape error remains, separately freeze0.2.6 last300 AFTER seeing
0.2.5, before fitting. No tuned probabilities, forced timeouts, count correction,
model approval/current forecasts/team-player coupling/member release.

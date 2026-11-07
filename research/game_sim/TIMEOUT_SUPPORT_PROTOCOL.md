# Budget support correction 0.2.5.1 — frozen before fitting

0.2.5 preserved:8751complete/1249missing empirical-budget-context failures.
Do not score the survivors as a successful model. Budget flags, physical field
and coarse lead remain mandatory; no reverting to an unconditioned timeout rate.

Only AFTER exhausting the original exact-clock hierarchy (including pooled
same-clock floors), allow nested source clock WINDOW coarse floors:
- <=10s states: same-half <=30s window, then same-half <=120s window;
- 11–30s states: same-half <=120s window;
- 31–120s: same-half <=120s window.
Then half-pooled <=120s window only if none of those has eligible actions.
All windows retain both budget flags, physical field and coarse lead. Training
aggregates actual rows whose clock falls inside the stated window, once each;
this is explicit temporal coarsening, NOT exact-clock support. Count coarsened
clock and pooled-half draws separately. No synthetic plays or timeout rates.

Every exact-clock eligible draw remains preferred, even thin. No 121–300s
source exposure added; last300 remains a separate experiment. Same10kseed1701,
unchanged gates, source hashes/replay,2023inspected calibration. Preserve failure
if support is still missing. Source-state and period-band diagnostics remain
required. This support approximation needs Claude review; no release/approval.

## 0.2.5.2 — frozen before fitting
0.2.5.1 still rejects78/10000;12/504 representative categorical states have no
support (notably tied near-goal with both exhausted). Add one LAST-resort
same-half <=300s source window, then half-pooled <=300s window, preserving
field, both budget flags and coarse lead. Aggregate actual Q2/Q4 scrimmage rows
inside300s, including normal-clock121–300s rows, only as fallback evidence;
normal-clock sampling hierarchy stays unchanged. No last300 decision band yet.
Count300windowdraws separately. This is explicit wider-clock extrapolation for
rare support gaps, not actual exact-time observations; independent review needed.
Same10kseed/gates. Any remaining unsupported state still blocks, no fill.

## 0.2.5.3 — frozen before fitting
0.2.5.2:9993complete/7unsupported. Representative support grid isolates remaining
missing category: tied,<=5yards, BOTH teams have zero timeouts (6clock/half cells).
When BOTH budgets are zero, timeout probability is zero by rule, not an estimate.
Only if all strict-budget contexts/windows are absent, allow a separately labelled
NON-TIMEOUT-ONLY empirical coarse pool at same exact clock/half/physicalfield/lead,
then half-pooled exact-clock equivalent. Fit these pools from actual non-timeout
source actions across budgets, once per row. Never use when either side has a
remaining timeout; never include a timeout template. This borrows the conditional
non-timeout action mix across budgets, an explicit model approximation requiring
review; it does not fabricate timeout rates or imply full-state historical support.
Count zero-budget pooled-action draws separately. Same10kseed/gates. All prior
failed evidence remains unchanged; no last300 decision band in this correction.

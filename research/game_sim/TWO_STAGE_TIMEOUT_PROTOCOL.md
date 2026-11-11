# Separate timeout decision0.2.8 — frozen before fit

Implement Claude6465157702 /6457679254. Preserve0.2.7 source recovery and
all older artifacts. Ordinary-play context keys exactly0.2.4: no budget flags,
nested clock windows or both-zero pooling; timeout actions never enter play buckets.
Timeout source fit separately uses regulation2022only. Opportunities are valid
run/pass/qb_kneel/qb_spike/punt/field_goal source states plus accepted timeout
states (including recovered compounds). Compound source rows supply both events.
Use source snap budgets as recorded for denominator eligibility; timeout states
reconstruct pre-event budgets as0.2.7. Invalid states excluded/countable, never
impute budgets. All eligible roles enter denominator at an opportunity; numerator
increments only for the actual caller. Retain counts at each distinct key.

Timeout hierarchy min30: band|role|fine-lead|field20, band|role|fine-lead,
band|role|coarse-lead,band|role. Fine lead ahead/behind1–3,4–8,9+ or tied;
field20=min(4,(yardline-1)//20) clamped0..4. Bands last10/30/120@h1/h2;
Q4/OT121–300last300@h2; normal@q1..q4 (OT normal borrowsq4, disclosed).
Sampler offense Bernoulli first if eligible, then defense Bernoulli if eligible;
otherwise ordinary play. This imposes ordering (defense conditional on no offense
call), not a calibrated competing-risk model. Exhausted roles have zero chance;
no empirical support>=30 raises, not artificial probability. Report hierarchy
usage and support failures. Ordinary play sampler retains thin-support counts.

Same10000seed1701oldOT, original scoring/rawtimeout/late-decision3combined-SE
checks; same-prefix1000bandtrace, three kneel audit seeds1701/1702/1703, inspected
2023CRPS. Preserve failures; no seedshopping/tuning or relaxed gates. Rawtimeout
metric includesOT though source fit does not. Late<=10timing overshoot remains
explicit. No team/player coupling, model approval, live forecasts/member release,
DBwrites or notifications. Passing reproduction alone is not predictive accuracy.

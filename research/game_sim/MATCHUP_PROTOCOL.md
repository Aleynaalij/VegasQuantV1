# Matchup development protocol — 2026-10-27

Status: development, unapproved. Existing v0.1.1 remains immutable.
Freeze this specification before fitting the new module. 2023 has already been
examined; it is development data, never an untouched holdout. No 2024+ evaluation
until a separate frozen validation specification and input manifest are committed.

First layer: fit regular-season ordinary pass/run EPA per play using an additive
league + offense + opposing defense ridge model. Fit pass and rush separately.
Use 100 zero-effect pseudo-plays per team, 100 fixed coordinate updates, no tuning
on outcomes. Defense effect is EPA allowed (positive means weaker defense).
Exclude penalties, sacks from rush (include in pass), two-point plays, missing EPA,
postseason and overtime. Count exclusions. No EPA-to-yardage/probability conversion
is authorized: EPA is context, not a player yardage forecast.

Player opportunity: use the same accepted plays and source GSIS IDs, ordinary
rushes, pass attempts and identifiable intended targets (including incompletions).
Shrink within historical team shares toward an explicit researcher-supplied role prior using
20 pseudo-opportunities; require separately sourced current roster/availability and
explicit role prior before scenario allocation. Historical team labels are not a
current roster. Unknown/out players block allocation; don't silently redistribute.

Each source supplies exact HTTPS URL, SHA256 and retrieval timestamp. Historical
cutoff mode rejects sources retrieved after cutoff; revised historical files cannot
be described as pregame-known. Rows at/after target kickoff are excluded regardless
of file retrieval time. Missing game timestamps block fitting; duplicate game/play
keys fail rather than double-count. Preserve source row and exclusion counts.

This layer is not coupled to action sampling until a separately tested mapping
from team effects to outcome distributions exists. No numeric player forecast,
market probability, EV, public release or model approval follows from fitting it.
Required next validation: rolling-origin team EPA comparison against league-only,
player share log loss against last-game and trailing-share baselines, then end-to-end
margin/total/player distribution calibration on a separately frozen later period.
A future holdout result cannot be claimed before actual execution.

## Superseding correction rule (v0.1.1 features)
See CORRECTION_PROTOCOL.md, frozen before corrected fitting. Require verified
`game_end_utc < cutoff` as well as kickoff before cutoff; a game in progress is
excluded in full. Reject completion before kickoff. Restrict to 730 preceding
days, apply fixed 120-day exponential half-life to EPA fitting and player
opportunities. Output raw counts separately from weighted opportunity counts.
QB scrambles use rushing EPA and QB carries and have an explicit coverage count.
These changes do not enable team coupling or forecasts.

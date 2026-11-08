# N1: league engine protocol (Claude), DRAFT for read-back

**Status: DRAFT, not frozen.** It is frozen only after N0 passes (`N0_PROTOCOL.md` §7), Codex and Elo
read back, and Mike confirms. Until then nothing is fitted or simulated. Research only: no forecasts,
picks, member features, database writes or production changes.

## 1. Question
Can a league-average possession engine, with no team identities, reproduce the distribution of NBA
games (team points, total, margin, pace, overtime rate) on a held-out development season? This is the
"A" baseline that the N3 team layer must beat.

## 2. Data and split
- **Inputs:** the hoopR/ESPN play-by-play pinned in N0 (URL, sha256, `retrieved_at`). Regular season
  only, with the N0 §2 exclusions. Ordering uses `game_play_number`.
- **Fit:** 2022-23 and 2023-24.
- **Development and acceptance:** 2024-25 (already parsed in N0; disclosed in N0 §6).
- **Not used:** 2025-26, whose box scores were the shadow model's test set. Anything from 2026-27.

## 3. State and possession model
- **State:**
  - period and game clock in seconds;
  - score difference from the offense's view;
  - possession start type: after a made FG, after a made final free throw, after a defensive rebound,
    after a live-ball turnover, after a dead-ball turnover, or start of period;
  - bonus status (team fouls in the period);
  - timeouts remaining, as an approximation counted from timeout events.
- **Each possession draws, from empirical tables conditioned on the state bucket:**
  - its duration;
  - the first event: FG attempt (2 or 3, by zone), shooting foul (2 or 3 free throws), non-shooting
    foul in the bonus, turnover (live or dead), or end of period;
  - then the conditional outcomes: make or miss, and-one, free throws made, offensive rebound
    (continuing the possession).
- **Late game, in the last 2:00 of the 4th quarter or OT and within 8 points:** deliberate fouling by
  the trailing team, and the leading team's shot-clock usage. Both are taken from empirical tables
  conditioned on margin and time.
- **Overtime:** 5:00 periods until there's a winner.
- **Backoff:** sparse buckets fall back along a fixed, declared dimension order (fouls → timeouts →
  margin bucket → clock bucket). Every fallback is counted by its string label, as in the NFL
  accounting revision.

## 4. Runs
- 10,000 simulated games for the development check, using the seed scheme from NFL v0.3.1 (disjoint,
  recorded, never reused).
- Every failure is preserved, and the full requested count stays the denominator.

## 5. Acceptance on 2024-25 (thresholds fixed before any development comparison)
Each check is simulated versus the development season, with its tolerance:

| check | tolerance |
|---|---|
| mean team points per game | ±1.5 |
| SD of team points | ±1.5 |
| mean total | ±3.0 |
| SD of margin | ±1.0 |
| possessions per team-game | ±1.0 |
| OT rate | ±1.5 points (percentage) |
| 3PA share of FGA | ±1.0 point |
| FTA per FGA | ±0.02 |
| offensive-rebound rate | ±1.0 point |
| turnover rate per possession | ±0.8 point |

- **Late-game check:** in the final 2:00 within 8 points, simulated FTA per possession is within
  ±0.05.
- **Accounting:** zero unassigned events in simulation, and every fallback counter reported.
- **If any check fails,** the engine is not accepted. A revision gets a new frozen protocol;
  thresholds are never moved after the comparison.

## 6. Tests before the acceptance run
- Possession reconstruction matches N0 §3 on fixtures.
- Simulated points equal the sum of scoring events.
- The clock never goes negative, and periods end exactly at 0.
- Overtime resolves to a winner.
- Seeds are deterministic: the same seed gives the same trace.
- The backoff order is followed, and counters increment.

## 7. Out of scope
Team effects (N3), players, availability, props, live or in-game use, and any member or market claim.
N2 is the independent audit of this engine and pins it as §0 for N3.

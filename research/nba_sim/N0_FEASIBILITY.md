# N0 feasibility check: NBA play-by-play source (Claude, 2026-11-08)

Read-only check before any N0/N1 protocol. Nothing is fitted or simulated, and no outcomes were
analysed beyond field coverage and counts.

## Source
hoopR / sportsdataverse ESPN play-by-play, release `espn_nba_pbp`, file `play_by_play_<season>.csv`
(the season is labelled by its end year, so 2024-25 is `2025`).

| file | result |
|---|---|
| `play_by_play_2023.csv` (2022-23) | available (HTTP 206 on a range request) |
| `play_by_play_2024.csv` (2023-24) | available |
| `play_by_play_2025.csv` (2024-25) | downloaded in full: 278,232,752 bytes, sha256 `9b89f85cda34d983cdaa6080317f054c5b210ad82aa48446cf201b2152d6c307` |
| `play_by_play_2026.csv` (2025-26) | gateway timeout through this session's proxy; not yet verified |
| `play_by_play_2027.csv` (2026-27) | gateway timeout; the current season is probably not published as a season file |

## 2024-25 file
- **Size:** 624,997 rows and 1,324 games. That's 1,234 regular-season games (`season_type` 2) plus
  play-in and playoffs.
- **Fields a possession engine needs:**
  - event type and text (shot types, free throws "1 of 2", rebounds by side, turnovers by type, fouls
    by type, timeouts, substitutions, jump balls, end of period);
  - period, game clock, and seconds remaining in the quarter, half and game;
  - running home and away score, plus the scoring flag, points attempted and score value;
  - shot coordinates;
  - the acting team (missing on only 1.3% of rows, mostly administrative events);
  - home and away timeout flags.
- **Possessions:** these can be derived (made basket, defensive rebound, turnover, end of period),
  as in the NFL engine's drive logic.
- **Spreads:** the rows carry an ESPN game spread for 1,231 of the 1,234 regular-season games. Its
  capture time is unknown (opening, closing, or something in between), so it is **not** a verified
  closing line. Per Mike's decision, market (B) stays prospective only. This field may be reported
  descriptively, never used as the (B) comparator.

## Implications for N0/N1
- **Seasons:** training on 2022-23 and 2023-24 and development on 2024-25 is feasible from the
  published files.
- **The current season (2026-27)** has no season file, so the prospective team layer would read each
  game's play-by-play from ESPN's per-game summary as games finish. Our `nba-sync` feed already ingests
  ESPN schedule and score data. N0 must pin that per-game source, and its as-of rules, before N3.
- **2025-26 still needs verifying.** Its retry is part of N0. It is not a decision set either way.

Next: the N0 protocol (pinned URLs, hashes, `retrieved_at`, exposure ledger), then N1 with Codex/Elo
read-back.

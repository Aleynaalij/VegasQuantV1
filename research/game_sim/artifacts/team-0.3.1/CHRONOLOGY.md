# Team layer v0.3.0 / v0.3.1 chronology (UTC, 2026-11-07)

The v0.3.0 pilot ran before a prerequisite finished. It is recorded verbatim here so the order of
events can be audited (Codex 5812134489, Elo 6706784974).

| time | event |
|---|---|
| 09:36 | Amendment A3 posted (`6970d4e`) |
| 09:39 | Codex (6705159936) and Elo (6705161042) agree; protocol frozen at `e9dc091` |
| 09:39:57 | 2024 play-by-play and `games.csv` downloaded (hashes in `sources.json`) |
| ~09:41 | Schema check: column headers only |
| ~09:42 | 20-seed A3 test passes; 1,000-seed A3 test started in the background |
| ~09:43 | **Pilot 1: one-target timing check.** `load()` plus `target_effects` for target index 100. Output: 0.217 s; 541 admitted games; refused {older than 730 days: 95, within 24 hours: 8, at or after target: 170}; cell levels {0: 65,601, 1: 1,378}; first four `a_o` and `g_o` values printed (ARI 0.0908 / −0.2095, ATL 0.4003 / −0.0116, BAL 1.0539 / −0.1712, BUF 0.3215 / −0.1277). |
| ~09:43 | **Pilot 2: 100-run smoke of game 0** (`2024_01_ARI_BUF`), both arms. Output: A mean margin −1.41, total 44.19; D mean margin 10.20, total 48.82; 0 failures; D counts {adjusted 14,982; split_degenerate 858; tilt_degenerate 682; tilt_unattainable 367}. Simulated values only; no result was viewed. |
| ~09:44 | 1,000-seed A3 test passes (71 s) |
| 09:44 | v0.3.0 code committed (`98d71ba`); full run started |
| 09:46 | v0.3.0 effects written (later committed in `8663a76`) |
| 09:50 | Scorer committed (`972876d`) |
| 11:15 | v0.3.0 shards complete (`5f53b34`) |
| 11:15 | **First computation and human view of 2024 outcomes and metrics:** `score.py` on v0.3.0 |
| 12:12 | Elo review 6706784974 (gain population) |
| 12:14 | v0.3.1 correction plan frozen (`3b3e56e`) |
| 12:15 | v0.3.1 code committed (`caaf1b5`); original-stream run started |
| 12:15 | Codex review 5812134489 (seed reuse and P2 items) |
| (this commit) | Addendum A1 frozen before any v0.3.1 shard is scored |

**Automated processing before scoring.** In both versions, `data.load()` reads the full 2024
schedule rows, including `result`, `home_score` and `away_score`, to generate exclusions. It also
reads the full 2024 play-by-play to build evidence. No human viewed a 2024 target result before
11:15.

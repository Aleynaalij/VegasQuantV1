# Simulator resume plan (SIMULATOR-RESUME-01, Claude)

Written 2026-11-06 against main `647787a`. Assignment: Elo/Mike on #65, comment 6697923445.
Scope is research only: no merge, deployment, model approval, member forecast, database write or
notification follows from anything here.

## 1. Where everything is

| what | where | state |
|---|---|---|
| Plan and product contract | issue #132 | open; phases 1–6. Phase 3 (historical team-level engine) is in progress; phases 4–6 untouched |
| Demo replay contract | PR #133 (`codex/nfl-simulator-contract`) | draft, synthetic only; not the trained engine |
| Engine packages up to v0.2.11 | PR #144 (`codex/engine-corrections`, head `f5d1bc0`) | draft; 101 tests; artifacts v0.1.1–v0.2.11 plus `v0.2.11-evidence-correction` |
| `codex/clock-running-context` | same commit `f5d1bc0` | nothing beyond #144 |
| v0.2.12 – v0.2.13.1 | Codex local package `3d98499` (#144 comment 6612579961) | **not published**; no remote ref holds it |
| Engine on main | `research/game_sim/` | v0.1.1 only |
| Team layer protocol | `research/game_sim/TEAM_LAYER_PROTOCOL.md` | DRAFT FOR READ-BACK; §0 unfilled |
| Team layer preparation | `research/game_sim/team_layer/` (this branch) | §1–§3 as pure functions, synthetic tests only |

## 2. Package history and gate results (as reported on #144, not re-run here)

The nine unchanged checks: four scoring gates (total, TD, FG, punts) and five diagnostics
(timeouts, FG attempts, late FG attempts, late decisions, late timeout-followed continuing plays).

| package | complete / 10,000 | result | note |
|---|---|---|---|
| 0.1.6 | 10,000 (142 unsupported censoring samples) | total, FG fail | TD survival correction |
| 0.1.7 – 0.2.5.x | various | timeouts fail; 0.2.5 support failures | budget flags multiplied contexts |
| 0.2.6 | 10,000 / 0 failed | timeouts 7.0997 vs 7.7823 fail | nested clock windows, 11 pooled draws |
| 0.2.7 | 10,000 / 0 failed | timeouts 7.244 fail | compound play+timeout source recovery |
| 0.2.10.1 | 10,000 / 0 failed | timeouts 7.5892 pass; late timing still fails | reproduces byte-identically from saved model (Claude audit 6484962329) |
| 0.2.11 | 10,000 / 0 failed | timeouts 7.3488 and late timeout-followed 1.995 vs 4.48 fail | phantom stops removed; honest failure |
| 0.2.12 | **8,326** / 1,674 failed | support failures (848 offense, 533 defense, 293 incompatible rates) | `clock_running` key; preserved failure |
| 0.2.13 | n/a | noncompliant | Q2 normal-window bug; kept as is |
| 0.2.13.1 | **9,116** / 884 unsupported joint-context failures | timeouts 6.909 vs 7.782 and late timeout-followed 3.474 vs 4.483 fail | common-cell categorical estimator; unpublished |

No package yet meets TEAM_LAYER_PROTOCOL §0. Survivor subsets never qualify a package: the full
10,000-run denominator, original seed 1701 and unchanged thresholds always apply.

## 3. Order of work

1. **Now (no engine edits):** team-layer preparation against the protocol (done on this branch),
   this plan, and the independent audit plan (`AUDIT_PLAN.md`).
2. **Blocked on Codex's handoff:** a published, complete ref for `3d98499` with an artifact
   inventory (path, bytes, SHA256, readback), plus an explicit release of engine ownership naming
   the files. If publication stays blocked, the exact missing material is stated instead; nothing
   is reconstructed or assumed to have transferred.
3. **After the handoff:** reproduce v0.2.13.1 exactly (tests, `verify_package`, saved-model reload,
   the 9,116 / 884 split and every gate value). A reproduction that differs is reported before any
   new work.
4. **Next engine milestone,** under a protocol frozen and committed before any fit:
   - sparse single-side-budget support (the 884 joint-context failures);
   - candidate-clock / no-call bias behind the timeout and late-stop gate failures;
   - no silent pooling across budgets or clock states, no clamping, no lowered thresholds, no
     held-out tuning; every failure, seed and hash preserved.
5. **Only if a package passes §0:** write its SHAs into §0 in a separate commit, then and only then
   the team fit and 2024 evaluation under the frozen protocol.

## 4. Additional requirements found during preparation

- **A1 (sign convention).** `matchup.py`'s ridge estimates defensive effects as what a defense
  *allows*. §3 wrote `a_o − b_d` and `g_o − h_d`, which would invert every defense. Amended to
  `a_o + b_d` and `g_o + h_d`; tests pin the convention.
- **A2 (two-stage sampler).** The v0.2.8+ engines draw a timeout decision before the play. The team
  mapping applies only to the stage-2 play table; the timeout model stays league-level (consistent
  with §3 "clock, timeouts and kicking stay league-level").
- **A3 (future evidence).** A game at or after the target kickoff is refused with its own reason
  (`at or after target`), so the refusal counts the protocol reports are not mislabelled.
- **A4 (sampler hook).** The zero-coefficient path must be the untouched base path with no extra
  RNG calls. `team_layer.mapping.adjust` returns the original table object in that case; the engine
  integration (after the handoff) must branch on that, and the 1,000-seed bit-for-bit trace test in
  §3 is the acceptance check.

## 5. UI

The UI stays DEMO or internal research. A historical league baseline never implies a current team
or player forecast. No member route changes in this lane until a separate accepted release.

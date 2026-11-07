# Team layer v0.3.0: frozen protocol draft (Claude), amended per Codex read-backs 6483704618 and 6507924056

Status: DRAFT FOR READ-BACK. Nothing is fitted, downloaded or evaluated under this protocol until
both agents agree.

**Status update (2026-11-07): AGREED AND FROZEN as amended through A3 (`6970d4e`).** Mike (owner)
relayed that Codex and Elo agree and gave the go-ahead to execute in this session. Their written
read-backs are requested on #65; this note does not stand in for them. Nothing above or below is
changed after this point. A result is appended after the run, and failures are preserved. This protocol never approves a model, publishes forecasts, writes to a database
or sends notifications. Player workloads are out of scope and get their own protocol.

## 0. Base engine (selected after the clock experiments, before any 2024 download)
- The base is the first engine package that meets all of these:
  - it passes all nine unchanged checks: the four scoring gates plus the five diagnostics (timeouts,
    FG attempts, late FG attempts, late decisions, late timeout-followed plays);
  - it has 10,000 of 10,000 runs complete with zero unsupported samples;
  - it reproduces byte-identically from its saved `model.json.gz`, as 0.2.10.1 does;
  - Claude has audited it independently.
- If no package passes, the team layer waits. It is never fitted on a base that fails a check.
- Before anything else happens, a separate commit writes the base's exact commit SHA,
  `model_sha256`, `implementation_sha256` map and source hash into this section.
  - Arm A (section 5) means exactly that package with zero team coefficients.

### Pinned base (provenance only, written 2026-11-07 after Elo's final disposition)
- **Disposition:** Elo accepted v0.2.24 as the league-level research baseline, eligible for this pin
  ([#237 comment 6705087332](https://github.com/Aleynaalij/VegasQuantV1/pull/237#issuecomment-6705087332)).
  - Independent reviews: the scientific re-audit at `bd575b9`
    ([review 5809312645](https://github.com/Aleynaalij/VegasQuantV1/pull/237#pullrequestreview-5809312645)) and
    the reporting follow-up at `05a0c79`
    ([comment 6702835305](https://github.com/Aleynaalij/VegasQuantV1/pull/237#issuecomment-6702835305)).
    Codex independently reproduced the preceding v0.2.23 accounting package
    ([review 5809232082](https://github.com/Aleynaalij/VegasQuantV1/pull/237#pullrequestreview-5809232082)).
  - Roles have swapped since this section was drafted: Claude built this package and Elo audited it.
    The fourth criterion above is therefore met by Elo's independent audit, not by Claude's.
  - Elo recorded these review limits, which still apply. The final reporting review ran 23 focused
    tests and skipped the source-gated checks. Its local broad run had errors because historical
    packages were missing from its snapshot. Exact-head kernel CI ran 157 tests and passed with 3
    skips. None of this is a fresh full-source rerun. The full-source evidence is the `bd575b9`
    review.
- **Commits:**
  - Build (engine source the package was built from): `ad175550a3dc805dc335d163d731113a17135b38`
  - Package committed: `df433313d27ee685e3dc5ed2e39e1486f13f07af`
  - Reviewed head for the final disposition: `05a0c79a8a2af4d183b3686ad2c77e9c6f997c0e`
- **Package:** `research/game_sim/artifacts/v0.2.24`, model `vq-empirical-game/0.2.24`.
- **`model_sha256`:** `f0b8ab26b0605ad50e0212b23b3186f7a78eeced281989e2655505950977512d`
- **Source:** `play_by_play_2022.csv.gz`, SHA256 `0c69a71eb39498956c7b1d5c1ca52ce7fe679934a95d1af249facb5ea9829ea4`.
- **Run:** seed 1701, 10,000 / 10,000 runs, 0 failed, old opening-TD OT.
- **Package flags (unchanged):**
  - `approval: false`
  - `current_matchup_supported: false`
  - `team_player_coupling_enabled: false`
  - blockers: UNCALIBRATED_LEAGUE_BASELINE, NOT_A_CURRENT_MATCHUP_FORECAST, NO_CURRENT_ROSTER_OR_AVAILABILITY, PLAYER_WORKLOAD_NOT_YET_SUPPORTED, HISTORICAL_KICKOFF_DISTRIBUTION, COMPOUND_LIVE_BALL_PENALTIES_EXCLUDED
- **Arm A** (section 5) is exactly this package with zero team coefficients.

Archived `implementation_sha256` map, copied verbatim from the package manifest. The head copies of
the reporting tools changed after the build (`05a0c79`); those newer hashes are deliberately **not**
used here.

| file | sha256 (as archived in the package) |
|---|---|
| `integrated.py` | `3e7c7cf76f51fe36b3e8ad33b4f1c480a776458cd30fc7c0f04ab587598e3a9e` |
| `model.py` | `a40f8a271202c3386ebc65e754ae4eb2fa2edf40472c91aef5b615c9ca380e2d` |
| `state.py` | `7ea5e495e06e082badce0aba5cd9bed0f06764352c6ad5f965a3db9cb245c16d` |
| `batch.py` | `0195777806f8c1552a02aadd2f79c0f0529efa663d4f8294c270902fadb1d5a6` |
| `evaluate.py` | `529a0e5c4d869049cd736045d9720208b8c93c6af5c007bcc0454e91742bf0d1` |
| `render.py` | `f3fb9d395e8d069c4733cbbc0da0427b6031c66804669b714c9c4a995a007450` |
| `workload.py` | `fbbdcc3de9358d00d7eafc5094d52b782ccc2e6972fac959e0bfe58434189750` |
| `timeout_cells.py` | `5eb9783b8c231f331447ee2881ffda26b01ca07bdcad137fb529eadecdaf0b63` |
| `INTEGRATED_BUILD_PROTOCOL.md` | `9f6b36fdfb1a76b2b1e28e2a8294ecf589c4ba4bf4c5c053379164eca95b9a1f` |
| `FIELD_CONTEXT_PROTOCOL.md` | `450b171ca212c7bf462bf87e98f5f14deff4bb9fd91204131405fdec29aa5632` |
| `LATE_SCORE_PROTOCOL.md` | `a6b6b3a8709c54b5001a5a8168574bbabd6031f9d633d10698361e8c9b86095d` |
| `HALF_CONTEXT_PROTOCOL.md` | `6619c3aa81b35b7f57ef3503f79bfa6d1963be0e7223d90379bf1f13adadec72` |
| `TIMEOUT_BUDGET_PROTOCOL.md` | `abe8f2ad6b8c3b80f5dde5d8a14c0654e63d72959cadcf51485313f9b9f3ea0e` |
| `TIMEOUT_SUPPORT_PROTOCOL.md` | `beedd471ad8bfcde55c843a503552210061259247509d531a2a32e812d59cea8` |
| `LAST300_PROTOCOL.md` | `e9c110f68438ff5d03ca9c10e5cb44a1a76ea8400213f1f9a52e0f53c20a6cfb` |
| `COMPOUND_TIMEOUT_PROTOCOL.md` | `69496ce56ad41cc61289b4015a7dfc754bde6eef231ebdb8b9ee79612ca3f422` |
| `TWO_STAGE_TIMEOUT_PROTOCOL.md` | `fd32157850b849776849ce997342516ef00f5a8cf94f13c10bd40e4d7e032434` |
| `STOP_CLOCK_PROTOCOL.md` | `8c4cc7170a04cc7404f0509f7f375bd715429414b62096ad37ca65860e8ea330` |
| `COMPETING_TIMEOUT_PROTOCOL.md` | `a64aba1199e0eb1a4c21fe930397029ce6a210d1162b458340d4b0af319a0161` |
| `RELOAD_PROTOCOL.md` | `890f3c69dd41e1a17795636fd0f3d534b6f0a7e95e56a8a5a94d25cd49922447` |
| `PHANTOM_STOP_PROTOCOL.md` | `31e17ca78643a576d9c6daa51629381d6b58fb2f3d8ad0670240ecec5a6f7c75` |
| `RUNNING_CLOCK_PROTOCOL.md` | `29751194d64dae2f8b615e98469244960bff375fb3dd420bc81fc2f75065a1c2` |
| `RESIDUAL_BACKOFF_PROTOCOL.md` | `6a506548059300cfda997f47140872642f5ec6542d453c68880d5500663c07b4` |
| `TWO_MINUTE_WARNING_PROTOCOL.md` | `cd0444d2df3d1730b844acee8455282479398ce77cadfb302ebf675040cce21e` |
| `LATE_PLAY_CONTEXT_PROTOCOL.md` | `af423726a37f40089d9c4875ef4a8f8429039178bc58d15a239190890d15a308` |
| `ACCOUNTING_PROTOCOL.md` | `93ebff10bc13e8626391a9e44a699217319c0da83c1bcbd0f0c639427eb50d4f` |
| `accounting.py` | `ef34d0e08f7cc29efe75843fce8b892153d1a82b604bf8ed0bb0cfec427428d1` |
| `ROLE_MARGINAL_PROTOCOL.md` | `69f4a0b52c595645b26be643df9308960459a3025118f64622d443b84993fd38` |
| `role_marginal_check.py` | `6ec3c3f2486bccd5ac93d1f577f17284ac463f8099ce93a46cc9c1840a97715e` |

Package files (from the manifest):

| file | sha256 | canonical sha256 |
|---|---|---|
| `model.json.gz` | `b62de8ad6051e57efa2286178ab87eb9ba9464ed95380fe98c0ef42a7ff299c9` | `f0b8ab26b0605ad50e0212b23b3186f7a78eeced281989e2655505950977512d` |
| `batch.json.gz` | `4dd95a405c458a1206d59b71af4d324f9db27903ec1ea1b43a7ae419fc8c3b77` | `32b9d8ef2b93bf29f5c901c490ec77e2233256e4312dda06def8ae5cac3a87c6` |
| `gate.json.gz` | `13400aee4d60cfa0ddeeb0702a57f6b316abd8e1224d996bb28aedfaaf39ff8b` | `85a464b55dce9ca3486e80f4cd45d64be4552d54e9ada25a09a3f6ec9893ce82` |
| `calibration.json.gz` | `6b10388ecf5d5a80368d24f1a9ef8de5b78c084df604a08c0dee719bf0ddfaed` | `6b3ade2c8cdf2d6689ea07a86849d27abbbfad456d8fffb93b3f8b4319b3ea49` |
| `replay.json.gz` | `b2169a6c07fd7de7ae008d7c589e520f29496b037e509699383bd1e17c999331` | `5548c35e777b5ebfff741169703191d828e56ffa0be8040ad5bc6f5dde0a7527` |
| `runtime-source.json.gz` | `cdfffe8041011da0311ab45e3b8df1b3bd6f776e0ae001b9f5b96229f135696e` | `439d361e8e7d01b546555e64c6ef6e0c84fca753cbf085f0c9fcf1a394bc855d` |

Still held after this pin: team fitting, any 2024 download or evaluation, and further team-layer
work. These wait for the pin read-back and this protocol's separate agreement. The 2023 comparison
shows no superiority, and the disclosed kneel and approximation limitations remain.

## 1. Evidence eligibility (cutoff safety)
- An evidence game E may inform target game G only if all of these hold:
  - E's scheduled kickoff (nflverse `games.csv` gameday + gametime, America/New_York) is at least
    **24 hours** before G's kickoff;
  - E has a final result in the source (`result` and both scores present);
  - E is not canceled, suspended, abandoned or rescheduled.
- **Exclusions are generated by code from the sources, never written by hand.** For each `game_id`:
  - a `games.csv` row with `game_type = REG` and a missing `result`, `home_score` or `away_score`
    is excluded with the reason `no final result in source`;
  - a game with no `END GAME` row in its play-by-play is excluded with the reason
    `no end-of-game row`;
  - a game present in one source but not the other is excluded with the reason
    `missing from games.csv` or `missing from play-by-play`.
  - The generated list is committed with the run, next to the two source hashes. For example, 2022
    BUF–CIN week 17 is expected to appear because its result is missing, not because anyone listed
    it.
- We make no claim about when any game ended, and we never invent `game_end` timestamps. The 24-hour
  gap is a conservative design rule: it relies only on no admitted game lasting 24 hours.
  - Suspended and unfinished games are excluded outright rather than relied on.
  - The rule excludes some legitimate evidence. For example, a Saturday 8:15 pm game is not used for
    a Sunday 1 pm target. That cost is accepted and the number of excluded pairs is reported.
- Recency follows the existing `matchup.py` rule: evidence older than 730 days is excluded, and
  weight is `2^(-age_days/120)`, where age is measured from E's kickoff to G's kickoff.
  - Raw play counts and weighted support are both reported for every team and every target.
- A test proves that, for every target, no evidence row fails the rule.

## 2. Team effects
Per team and target game we estimate:
- offensive gain effect `a_o` and defensive gain effect `b_d`, in yards per gain play;
- offensive pass-rate effect `g_o` and defensive pass-rate effect `h_d`, in logit units.

Estimation reuses `matchup.py`'s alternating ridge (`RIDGE_PLAYS = 100`, 100 iterations) and its
recency weights. EPA is not used to set outcome sizes.

**Gain effects.** Ridge on signed gain yards over evidence plays in `G_run ∪ G_pass`, defined as
in section 3. Each play's residual is taken against the league mean of its own group (run or pass)
in the same evidence window.

**Pass-rate effects: from indicator to logit.**
1. The evidence plays are scrimmage `run` or `pass` plays, with kneels and spikes excluded.
   - `pass = 1` when `play_type = 'pass'`, which includes sacks.
   - Scrambles count as runs, because the source records them as `play_type = 'run'` and the
     engine's `G_run` holds them.
2. Each play gets an expected pass rate `e`: the weighted league pass rate in its cell (down ×
   distance band {1–3, 4–7, 8+} × half × lead status {ahead, tied, behind}) from the same evidence
   window.
   - A cell with fewer than 30 weighted plays falls back to down × distance band, then to down
     alone.
3. Ridge on the residual `p − e` gives `g'_o` and `h'_d` in probability units.
4. These are converted to logits at the team's weighted mean expectation ē:
   `g_o = logit(ē_o + g'_o) − logit(ē_o)` and `h_d = logit(ē_d + h'_d) − logit(ē_d)`.
   - If `ē + g'` lies outside (0.01, 0.99), that effect is set to 0 and counted as
     `rate_degenerate`. It is never clamped to the boundary.

## 3. Mapping effects to action outcomes
The engine's empirical template distribution is kept for each sampled context. Within a context the
templates split into four groups:
- **G_run:** run templates (including QB scrambles as the source records them);
- **G_pass:** pass_complete, pass_incomplete and sack templates;
- **F (fixed):** all other kinds — interceptions, fumbles, penalties, timeouts, kicks, kneels,
  spikes and anything else.
  - F's total probability mass and its internal proportions never change.
  - So turnover, penalty, kick, timeout and clock-event shares stay at league level.

**Sign convention (amendment A1, 2026-11-06).** `b_d` and `h_d` are what a defense *allows*: the
shared ridge (`matchup.py`, `defense_allowed`) estimates them from residuals with the offense
effect removed, so a positive value means opponents gain more or pass more against that defense.
They are therefore **added**. The earlier draft's `a_o − b_d` and `g_o − h_d` would have inverted
every defense; no fit or evaluation ever used them.

The adjustment works in two steps.
1. **Run/pass split.** The combined mass `M = P(G_run) + P(G_pass)` is fixed. The pass share
   `q = P(G_pass)/M` becomes `q' = logistic(logit(q) + g_o + h_d)`.
   - **Degenerate contexts:** when `M = 0`, `q = 0` or `q = 1`, the split is left unchanged and
     counted as `split_degenerate`. A one-sided context is never given a group it has no
     templates for.
   - A group with zero mass after the split skips step 2.
2. **Gain tilt within each group.** Each template weight is multiplied by `exp(λ·y_t)`, where `y_t`
   is the template's source-recorded signed yards: sacks are negative and incompletions are 0.
   - The group is then renormalized back to its new mass.
   - λ is the numerical root of `E_λ[y] = E_0[y] + (a_o + b_d)` on the group's own templates.
     - Solved by bisection on λ ∈ [−0.5, 0.5].
     - Stops at |residual| ≤ 1e-6 yards or after 200 iterations.
   - If the target is outside the attainable range at the bracket ends, nothing is clamped:
     - the context uses λ = 0;
     - the failure is counted as `tilt_unattainable` with team, context and target.
   - A context with fewer than 2 distinct `y` values uses λ = 0, counted as `tilt_degenerate`.

**TD censoring:** `y_t` is the recorded gain, which is censored at the goal line. The tilt therefore
moves mass between recorded templates. The existing survival correction then runs after the draw,
unchanged. This is disclosed as an approximation.

**Zero coefficients (amendment A3, 2026-11-07, before any fit):** when every coefficient for a game
is 0, the sampler takes the **unchanged code path of the §0-pinned base**: v0.2.24, model
`f0b8ab26…512d`, with the runtime archived in `artifacts/v0.2.24`. It makes no extra RNG calls.
- A test checks bit-for-bit equality of full traces for 1,000 seeds (1701–2700, old OT).
- The comparison is against the pinned package's saved `model.json.gz` run under its archived
  runtime.
- No other baseline may be substituted.
- The earlier draft named the 0.2.10.1 code path, which predates the pin. Elo flagged this on #237
  (comment 6705128172).

**Clock, timeouts and kicking stay league-level** in v0.3.0. This is listed as a limitation. With a
two-stage base (timeout decision, then play), the mapping applies only to the stage-2 play table
(amendment A2).

**Reference implementation:** `research/game_sim/team_layer/` implements sections 1–3 as pure
functions with synthetic tests. It is not wired into any engine before the section-0 base exists.

## 4. Data, exposure and splits
- **Fit / evidence seasons:** 2022 and 2023 REG play-by-play, which is already inspected, plus
  2024 REG play-by-play as evidence for later 2024 targets, under rule 1 only.
- **Evaluation:** every 2024 REG game (272 games), each forecast only from evidence admitted by
  rule 1.
- **Exposure statement, frozen:**
  - Codex fetched the full nflverse `games.csv`, which contains 2024 schedules and outcomes, during a
    source-input probe. Codex states it did not inspect the 2024 rows.
  - Claude has not downloaded or viewed 2024 data.
  - 2024 play-by-play has not been downloaded by either agent.
  - We therefore do **not** call 2024 "untouched". We call it "2024 play-by-play not yet inspected;
    2024 outcomes present in one fetched file, not analyzed".
- Every downloaded source is recorded with its URL, SHA256 and `retrieved_at`.

## 5. Comparators
| arm | what it is |
|---|---|
| A | League-only negative control: the section-0 base with zero team coefficients. |
| B | The existing historical baseline. |
| C | Market reference (see below). |
| D | The team layer. |

Arm C is an **assumed** distribution, not a supplied market distribution:
- it is a normal with mean equal to the nflverse `games.csv` closing `spread_line` / `total_line`;
- its SD is the residual SD from the 2022–2023 training seasons.

The line values come from nflverse's retrospective attribution. They are not independently verified,
timestamped FanDuel snapshots, and we make no as-of-price claim.

## 6. Simulation runs
- Arms A and D are run **paired**: for each game, both arms use the same per-game seed,
  `1701 + index`.
  - `index` is the game's position after sorting all 272 `game_id`s.
- 2,000 runs per game per arm, which is 1,088,000 simulated games in total. Overtime follows the
  2024 regular-season rule: the old opening-TD rule (`both_possessions=False`). The both-possession
  rule only reached the regular season in 2025.
- **Execution:**
  - work is split into deterministic shards of 34 games across 4 processes;
  - each shard writes a checkpoint file carrying its SHA256;
  - a resumed run must reproduce the hashes of every completed shard.
- **Expected runtime:** about 5.5 CPU-hours, roughly 1.5 hours wall-clock on 4 cores.
- No subset of games, no reduced run count, and no silent drops are allowed.
  - Coverage, failures (by message), Monte Carlo standard error per game and per metric, and every
    `tilt_*` count are reported.

## 7. Metrics and decision rule (frozen before any 2024 outcome is read)
- **Metrics:**
  - CRPS for margin and total;
  - Brier score for the home win, with ties counted as half;
  - 80% interval coverage for margin and total.
- **Confidence intervals:** paired game-level bootstrap, 10,000 resamples, seed 20261028, 95%
  percentile intervals on D−A and D−C.
There are two separate decisions, and the second never follows automatically from the first.

**(A) Research acceptance: "the team layer adds value". All three must hold:**
- D−A margin CRPS < 0 with a CI excluding 0;
- D−A total CRPS either has a CI that includes 0 or is significantly < 0;
- D's 80% coverage is within ±5 points for both margin and total.

Passing A only allows work to continue: the team layer can become the base for the player protocol.
It says nothing about members or markets.

**(B) Member / market qualification: considered only after A passes, and all must hold:**
- D−C margin CRPS and D−C total CRPS each have a CI that includes 0 or lies below 0, meaning D is
  not shown to be worse than the assumed market reference;
- the Brier score for home win is no worse than C's, by the same CI rule;
- the owner gives explicit approval after reading the full report.

Passing B still does not publish anything. Publication needs its own release step and the owner's
go-ahead.

- D−C is reported in full, whatever it shows, including when A fails.
- If D fails A or B, the result is preserved as-is. Nothing is tuned on 2024, and no new metric or
  threshold is added after outcomes have been read.

## 8. Not in scope
Player workloads, weather, QB-specific effects (absorbed by the team effect and disclosed),
2025/2026 forecasts, database writes, notifications, member UI.

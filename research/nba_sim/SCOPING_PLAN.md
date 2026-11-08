# NBA game simulator — scoping plan (Claude), for read-back

**Status: SCOPED; decisions recorded 2026-11-08 (§8). N0 in progress.** No model is fitted or run and no code is written; data downloads and inspections are listed in `N0_PROTOCOL.md` §6. Every
stage below gets its own frozen protocol and Codex/Elo read-back, and Mike confirms before any data
work starts. This plan never approves a model, publishes forecasts, writes to a database, sends
notifications or touches shared lobby or VQ Tonight files.

Mike asked for this to wait until NFL was done; NFL was called done on 2026-11-07.

## 1. What this is, and what it is not
- **Goal:** a possession-level NBA game simulator. It produces distributions of margin, total and
  win probability per game, the NBA counterpart of the NFL engine in `research/game_sim`.
- **Relation to the existing shadow model:** the NBA shadow model (`research/nba/MODEL.md`) forecasts
  player points and rebounds and is in prospective scoring. It is a separate product with a separate
  protocol. The simulator does not replace it, read its journal or change it.
- **Not in scope:** player props, live/in-game use, member UI, picks, wagers.

## 2. Lessons carried over from NFL (these shape the plan)
1. **League engine first, then a team layer.** The NFL team layer beat league-only (decision A) but
   lost to the market normal (decision B). So the plan budgets for the realistic outcome: a sound
   research engine that does *not* beat closing lines.
2. **Accounting from day one.** Every fallback, unsupported state and failure gets a string-labelled
   counter. In NFL, the accounting revision and the zero-call cell fix came late. NBA builds them in
   from the start.
3. **Disjoint seed streams and paired arms** from the first evaluation run, never added afterwards.
4. **Exposure ledger.** Each season used is recorded as train, development or decision, with who has
   seen its outcomes, before any fitting.

## 3. Stages (each is its own protocol and gate)

| stage | content | decision it supports |
|---|---|---|
| **N0 sources** | pin play-by-play and schedule sources (immutable URL, SHA256, `retrieved_at`); exposure ledger | none (provenance) |
| **N1 league engine** | possession states (start type: live-ball turnover, defensive rebound, made basket, dead ball); outcome tree (shot zone and value, FT trips, turnover, offensive rebound); pace from the possession clock; end-of-period and end-of-game fouling and timeouts; OT | reproduces league margin/total distributions on a development season |
| **N2 audit** | independent audit (Elo) of accounting, unsupported states and late-game logic; pin engine as §0 | engine frozen |
| **N3 team layer** | per-team offense/defense effects on the outcome tree (four-factor style) plus pace; cutoff-safe recency evidence, ridge-shrunk, as in NFL v0.3.1 | (A) beats league-only; (B) beats market normal |
| **N4 availability** *(optional)* | star absence via the injury feed already captured; only if N3 (A) holds | separate protocol |

## 4. Data and exposure (proposal)
- **Play-by-play:** hoopR / sportsdataverse ESPN play-by-play, so game ids match `nba_games.provider_id`
  without a crosswalk. A cross-check source is named in N0.
- **Seasons:** 2022-23 and 2023-24 for training, 2024-25 for development.
- **Decision set:** two candidates, for read-back:
  - **2025-26 retrospective.** Exposure caveat: its *player* box scores were the shadow model's test
    set, so game outcomes are not unseen. This must be disclosed and probably rules it out as a clean
    held-out set.
  - **2026-27 prospective (recommended).** Forecasts are frozen and stored before tip, then graded
    later. This is clean, but slow: about 4–5 months to reach a few hundred games.
- **Market comparator for (B):** the NBA feed stores odds observations only since 2026-10-18
  (`public.nba_observations`, kind `odds`). That is enough for a prospective (B), but there is no
  verified historical NBA closing-line source in the repo. A retrospective (B) would need one named in
  N0, plus Mike's approval for any paid source.

## 5. Effort estimate (rough)
- **N0:** about 1 session.
- **N1:** the bulk. Basketball has many more possessions than NFL has drives, but a simpler state
  space; about 4–6 sessions including tests.
- **N2:** depends on audit rounds; NFL took several.
- **N3:** about 2–3 sessions, reusing the NFL team-layer design.

## 6. Ownership and gates
- **Files:** new code lives only in `research/nba_sim/` and `tests/nba_sim/`. Nothing goes in
  `src/`, `supabase/`, workflows, the shadow model, or shared lobby/VQ Tonight files.
- **Approvals:** no merge, deployment, migration, live data, provider budget, permission change,
  notification or official forecast without Mike's separate approval. Any UI stays DEMO/internal
  research.
- **Preservation, as in NFL:** every failure, seed, full denominator, threshold and source/runtime
  hash. No held-out tuning.

## 7. Questions for Mike
1. **Decision set:** is a prospective 2026-27 decision set acceptable, given the slow clock?
2. **Market (B):** run it prospectively only, or seek a historical NBA closing-line source? A paid
   source needs your approval.
3. **Scope:** stop at N3, or keep N4 (availability) in view?

## 8. Decisions (Mike, 2026-11-08)
1. **Decision set: 2026-27, prospective.** Forecasts are frozen and stored before tip and graded after.
   2025-26 is not used as a decision set.
2. **Market (B): prospective only.** The comparator is the closing line captured by our own NBA feed
   (`public.nba_observations`, since 2026-10-18). No paid historical line source.
3. **Scope: stop at N3** (league engine plus team layer). N4 (availability) stays out of scope unless
   it is re-scoped after N3's decision (A).

Every stage still gets its own frozen protocol, Codex/Elo read-back and Mike's confirmation before any
fitting. Nothing here approves a model, a forecast or a member-facing feature.

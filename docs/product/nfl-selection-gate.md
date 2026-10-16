# NFL publication gate — 2026-10-16.r1

The owner's current R1–R8 standing rules in `research/lessons/README.md` supersede older unpriced-pick and long-parlay allowances. The unchanged seven-file NFL bible still governs. This gate applies prospectively, including entertainment/Hail Mary candidates. Existing tickets, tails, grades, original quotes and bankrolls are untouched.

## Enforcement points

Database BEFORE INSERT triggers guard `candidate_releases` and `official_picks`, including direct privileged writes. A separate trigger prevents ungated target-leg extras in `edge_releases`. New NFL Decision prose cards must use the gated release structure; research-only Watchlist, Injury watch and Market update posts and result-linked updates remain available. No existing publication is changed by this migration.

Rejection raises SQLSTATE 23514 / `NFL_SELECTION_GATE_BLOCKED`, with rule-specific JSON detail. The whole insert rolls back, before push or result side effects. Exact selection identities have a unique constraint for concurrent deduplication, seeded from historical publications. Equivalent integer targets such as 40+ and Over 39.5 share an identity. Repricing/status updates should be observations or analysis updates, not duplicate selection releases.

## Evidence contract

Every individual candidate requires `selection_gate`, with:

- `version: "2026-10-16.r1"`, `phase: "pregame" | "halftime"`, `position`, team abbreviation, `stat` (`rushing_yards`, `receiving_yards`, `passing_yards`, `receptions`), `direction` (`at_least`, `over`, `under`), numeric `threshold`.
- `history_window: "latest_consecutive_games"`, `history_source_url`, and `history`: at least five entries containing distinct `game_id`, numeric `value`, timezone-qualified `played_at`, and `source_url`. These must be the latest consecutive eligible games, not a cherry-picked window. The gate recomputes the clear rate and median, and rejects duplicate/future games. Source truth, actual chronology/completeness and position/role still require analyst verification; an SQL schema cannot authenticate arbitrary external source claims.
- `model_id`, numeric `model_probability` on a 0–1 scale, `forecast_source_url`, timezone-qualified `generated_at` and `historical_cutoff`, and nonempty `input_hashes`. Model ID must exist in the private validation approval registry and support this market. All legs require at least three percentage points over price break-even under the bible; historical clear rate is only an additional screening gate.
- `quote_observation_id` and `initial_quote_observation_id`: immutable `source_observations` IDs. The exact FanDuel player, direction, provider market, point and price must match. The initial ID must identify the earliest stored matching selection quote; using today's quote as an artificial baseline is rejected. The latest snapshot for that market must be used, including if it removed the selection. Candidate `quote_observed_at` equals provider timestamp; `quote_source_url` equals the observation's source. Database receipt remains separately available in the observation. No screenshot-time guesses or unknown prices pass.
- `opportunity_case`, `failure_path`, `game_script_review`, `role_source_url`, `availability_source_url`, `availability_verified: true`.
- Halftime additionally requires sourced `live_status: "STATUS_HALFTIME"`, `live_observed_at`, `live_source_url`, numeric `team_lead`, and `first_half_yards` for rushing. These are reviewed evidence, not automatically fetched live stats.

Candidate `name` is the exact provider player name; `market` is `Full game · 40+ receiving yards` (or `Full game · Over 39.5 receiving yards` / corresponding Under/stat); `copy_text` is only player and target, e.g. `Test Player 40+ receiving yards`. Structured evidence must match the displayed target and clipboard text exactly. `book` is `FanDuel`, `odds` is a numeric integer American price.

Official picks take the same evidence from the linked immutable analysis version's `sections.selection_gate`, additionally containing `player_name`, `market`, `copy_text`, `quote_observed_at`, and `quote_source_url`. Selection, numeric line, direction and official probability must match it. Existing admin authorization and official release gates remain mandatory; this migration does not authorize official publication.

## Exact policy behavior

- R1: last-5+ clear rate >= break-even + 0.05. For negative odds, break-even is abs(odds)/(abs(odds)+100); for positive odds it is 100/(odds+100). No rounding before comparison.
- R2/bible: require approved priced-model evidence and >=0.03 probability edge. The preferred -150 through -249 band additionally requires an over target below the supplied history's median. The model exception cannot use SHADOW_ONLY output or self-attested `validated:true`.
- R3: POD -150 through -300 inclusive, one per release; -500 or shorter only in a validated bundle, never standalone/POD.
- R4: maximum three halftime leaves, no mixed pregame/halftime card, overs only, -150 through -249 inclusive. No receiving/receptions overs for a team leading by >=10. Rushing remaining yards <=30% of first-half yards. Halftime status and quotes must be <=120 seconds old.
- R5: TE selections require receptions; yardage is rejected.
- R6: three or four fully qualifying leaves for pregame parlays; halftime parlays exactly three (or publish one/two singles). One bundle, exact same-release `leg_keys`, matching displayed `parlay_legs`, `parlay_group` on every leaf, `correlation_review` and `failure_scenarios`. No entertainment/count exemption.
- R7: conservative lock enforcement: pregame publication is allowed only in the two hours before confirmed kickoff with a <=15-minute quote. Earlier work stays research/draft. A >=15 American-price-cent increase from the initial exact quote rejects the leg (e.g. -240 to -220); this is the owner's market-against-selection convention, not a claim the bettor receives a worse payout. Later quote/line changes remain research observations; this migration is not a live withdrawal worker.
- R8: exact FanDuel quote required; unknown/stale/mismatched prices or duplicate exact selections fail. New NFL Decision selections cannot bypass the gate via prose posts.

## Models and readiness

`private.nfl_selection_model_approvals` starts EMPTY. v0.3 remains SHADOW_ONLY. Consequently new NFL selections will be blocked until a documented independently validated model is explicitly approved. This is intentional enforcement of the owner's bible, not evidence that the app has gained a validated model. Do not add an approval merely to unblock publishing. No model was approved or retrained by this change.

Rules are append-only records in `private.nfl_selection_rule_versions`; the current version is stored with every accepted decision. Future policy adjustments require a reviewed new version and corresponding contract/tests, not changing historical evidence.

## Audit and preflight

Authorized admin/service callers should run `public.preflight_nfl_selection(candidate)` for each considered leg before composing the card. It returns a decision ID, rule errors and pass/fail and appends the evidence even on failure; it never grants publication authorization. Bundle structure, race-safe duplication and current freshness are checked again at insertion. A raised trigger exception rolls back its entire transaction, so direct rejected INSERTs cannot leave a durable failure journal. Use the preflight RPC to preserve rejected candidates for weekly comparisons.

Accepted publication evidence is append-only in private gate decisions. Only preflight decisions and accepted publications are journaled; do not claim every external attempted publication was captured. Tables are not exposed to members. Historical baseline reports and retrospective rejected-candidate outcomes require independently verified finals; a rules pass never establishes EV by itself or changes a result.

Verification: `node tests/sql/nfl-selection-gate.mjs` uses isolated PostgreSQL/PGlite fixtures, including a test-only approved model. Never insert those fixtures or approvals into production.

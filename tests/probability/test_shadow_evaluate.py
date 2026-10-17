from pathlib import Path
import random
import sys
import unittest
import unittest.mock
import pandas as pd
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "research" / "probability"))
import shadow_evaluate as e

URL, SHA = "https://example.test/stats_player_week_2026.csv", "a" * 64


def frame(rows):
    return {2026: (pd.DataFrame(rows), URL, SHA)}


def pending(fid, player="p1", team="SEA", week=7, market="rushing"):
    return dict(forecast_id=fid, player_id=player, season=2026, week=week, market=market, team=team)


class Outcomes(unittest.TestCase):
    def test_yards_and_missing_rows_left_pending(self):
        frames = frame([
            dict(player_id="p1", season=2026, week=7, recent_team="SEA", season_type="REG", rushing_yards=-3.0, receiving_yards=12.0),
            dict(player_id="p2", season=2026, week=7, recent_team="SEA", season_type="REG", rushing_yards=40.0, receiving_yards=0.0),
        ])
        graded = e.outcomes([pending("f1"), pending("f2", market="receiving"), pending("f3", player="p9"),
                             pending("f4", team="KC"), pending("f5", week=8)], frames)
        by = {g["forecast_id"]: g for g in graded}
        self.assertEqual(by["f1"]["yards"], 0.0)          # negative rushing yards clear nothing
        self.assertEqual(by["f2"]["yards"], 12.0)
        self.assertNotIn("f3", by)                        # no row: may have played without a stat, stays pending
        self.assertEqual(by["f4"]["yards"], 0.0)          # the prop follows the player's own row, whatever the team
        self.assertNotIn("f5", by)
        self.assertEqual(by["f1"]["source_sha256"], SHA)


def row(i, game, odds=-200, p=0.75, yards=60, line=40.5, direction="over", no_vig=0.66, edge=5.0, recorded="2026-10-18T12:00:00Z", player=None):
    return dict(forecast_id=f"f{i}", game_id=game, kickoff="2026-10-18T17:00:00Z", recorded_at=recorded,
                player_id=player or f"p{i}", player_position="RB", market="rushing", direction=direction, line=line, odds=odds,
                research_probability=p, push_probability=0, no_vig_probability=no_vig, estimated_edge_pp=edge,
                yards=yards, void=False, closing_odds=-220)


class Report(unittest.TestCase):
    def test_settle(self):
        self.assertEqual(e.settle(row(1, "g", yards=41, line=40.5)), "win")
        self.assertEqual(e.settle(row(1, "g", yards=40, line=40.5)), "loss")
        self.assertEqual(e.settle(row(1, "g", yards=40, line=40.5, direction="under")), "win")
        self.assertEqual(e.settle(row(1, "g", yards=40, line=40)), "push")
        self.assertEqual(e.settle(dict(row(1, "g"), void=True, yards=None)), "void")

    def test_first_observation_only(self):
        early = row(1, "g1", recorded="2026-10-18T10:00:00Z", player="p1", odds=-180)
        late = row(2, "g1", recorded="2026-10-18T14:00:00Z", player="p1", odds=-240)
        other_line = row(3, "g1", recorded="2026-10-18T14:00:00Z", player="p1", line=50.5)
        main = e.first_observations([late, early, other_line])
        self.assertEqual(sorted(r["forecast_id"] for r in main), ["f1", "f3"])

    def test_small_sample_fails_floors(self):
        rows = [row(i, f"g{i % 5}") for i in range(30)]
        r = e.build_report(rows, "m")["scopes"]["rushing:RB"]
        self.assertFalse(r["floors"]["player_games"])
        self.assertEqual(r["eligible_slices"], [])

    @staticmethod
    def sample(win_rate, seed, n=400, **kw):
        rng, rows = random.Random(seed), []
        for i in range(n):
            rows.append(row(i, f"g{i % 50}", p=0.8, yards=60 if rng.random() < win_rate else 10, **kw))
        return rows

    def test_strong_sample_passes_and_weak_sample_does_not(self):
        # Outcomes at 0.8 beat a 0.66 no-vig price; at 0.45 the market is closer than the model.
        g = e.build_report(self.sample(0.8, 1), "m")["scopes"]["rushing:RB"]
        b = e.build_report(self.sample(0.45, 2), "m")["scopes"]["rushing:RB"]
        self.assertEqual(g["eligible_slices"], [[40.5, 59.5]])
        self.assertEqual(g["slices"][1]["eligible_cohort"]["clv_coverage"], 400)
        self.assertEqual(b["eligible_slices"], [])
        self.assertFalse(b["slices"][1]["criteria"]["beats_no_vig_brier"])

    def test_unsupported_scope_is_diagnostic_only(self):
        rows = [dict(r, market="receiving", player_position="TE") for r in self.sample(0.8, 1)]
        r = e.build_report(rows, "m")["scopes"]["receiving:TE"]
        self.assertFalse(r["supported"])
        self.assertTrue(r["slices"][1]["criteria"]["beats_no_vig_brier"])
        self.assertEqual(r["eligible_slices"], [])

    def test_slice_floor_is_per_line_slice(self):
        # Two line slices of 30 each: the band holds 60 but neither slice reaches 50.
        rows = self.sample(0.8, 1, n=60)
        rows = [dict(r, line=40.5 if i % 2 else 60.5, yards=(70 if r["yards"] == 60 else 10)) for i, r in enumerate(rows)]
        rows += [dict(row(1000 + i, f"g{i % 50}", player=f"q{i}", odds=-120)) for i in range(300)]  # outside the band
        r = e.build_report(rows, "m")["scopes"]["rushing:RB"]
        self.assertTrue(all(r["floors"].values()))
        self.assertEqual([s["decided"] for s in r["slices"][1:3]], [30, 30])
        self.assertFalse(any(s["criteria"]["review_floors"] for s in r["slices"]))

    def test_pending_forecasts_are_counted_not_scored(self):
        rows = [row(1, "g1"), dict(row(2, "g1"), graded=False, finished=True, yards=None, void=None),
                dict(row(3, "g2"), graded=False, finished=False, yards=None, void=None)]
        d = e.build_report(rows, "m")
        r = d["scopes"]["rushing:RB"]
        self.assertEqual((d["captured_forecasts"], d["graded_forecasts"]), (3, 1))
        self.assertEqual((r["counts"]["win"], r["counts"]["pending_finished"], r["counts"]["pending_upcoming"]), (1, 1, 1))

    def test_whole_yard_lines_outside_reported_slice_bounds(self):
        rows = [dict(r, line=40.0) for r in self.sample(0.8, 1)]
        r = e.build_report(rows, "m")["scopes"]["rushing:RB"]
        self.assertEqual([s["decided"] for s in r["slices"]], [0, 0, 0, 0])
        self.assertEqual(r["slices"][0]["lines"], [20.5, 39.5])
        rows = [dict(r, line=30.0, yards=40 if r["yards"] == 60 else 10) for r in self.sample(0.8, 1)]
        self.assertEqual(e.build_report(rows, "m")["scopes"]["rushing:RB"]["slices"][0]["decided"], 400)

    def test_no_vig_coverage_floor(self):
        # Only two paired games carry a no-vig price: the interval can be negative, the claim cannot pass.
        rows = [dict(r, no_vig_probability=r["no_vig_probability"] if i < 4 else None)
                for i, r in enumerate(self.sample(0.8, 1))]
        c = e.build_report(rows, "m")["scopes"]["rushing:RB"]["slices"][1]["criteria"]
        self.assertFalse(c["no_vig_coverage"])
        self.assertEqual(e.build_report(rows, "m")["scopes"]["rushing:RB"]["eligible_slices"], [])

    def test_historical_baseline(self):
        history = pd.DataFrame([dict(player_id="p1", season=2026, week=w, recent_team="SEA", season_type="REG",
                                     rushing_yards=y, receiving_yards=0.0)
                                for w, y in [(1, 50.0), (2, 30.0), (3, 40.0), (4, 60.0), (5, 41.0), (7, 99.0)]])
        rows = [dict(row(1, "g1", line=40.5), season=2026, week=6, team="SEA"),
                dict(row(2, "g1", line=40.0, direction="under", player="p1"), season=2026, week=6, team="SEA"),
                dict(row(3, "g1", player="p1"), season=2026, week=6, team="KC")]
        e.add_baselines(rows, {2026: (history, URL, SHA)})
        self.assertEqual(rows[0]["baseline_probability"], 3 / 5)   # week 7 is after the target week
        self.assertEqual(rows[1]["baseline_probability"], 1 / 4)   # the 40-yard push is excluded
        self.assertIsNone(rows[2]["baseline_probability"])          # no same-team history
        m = e.build_report(rows[:1], "m")["scopes"]["rushing:RB"]["all_lines"]["historical_baseline"]
        self.assertEqual(m["paired"], 1)

    def test_return_claim_needs_its_own_floor(self):
        # 400 decided observations, but only two are eligible (over, edge >= 3): the return cannot pass.
        rows = [dict(r, estimated_edge_pp=5.0 if i < 2 else 1.0) for i, r in enumerate(self.sample(0.8, 1))]
        c = e.build_report(rows, "m")["scopes"]["rushing:RB"]["slices"][1]["criteria"]
        self.assertFalse(c["return_sample"])
        self.assertTrue(c["beats_no_vig_brier"])
        self.assertEqual(e.build_report(rows, "m")["scopes"]["rushing:RB"]["eligible_slices"], [])

    def test_provenance(self):
        sources = [{"season": 2026, "source_url": URL, "sha256": SHA}]
        rows = [dict(row(1, "g1"), outcome_source_url=URL, outcome_source_sha256=SHA, outcome_version=None),
                dict(row(2, "g1"), outcome_source_url=URL, outcome_source_sha256="c" * 64, outcome_version="v2"),
                dict(row(3, "g2"), graded=False, finished=False, yards=None, void=None)]
        p = e.build_report(rows, "m", sources)["provenance"]
        self.assertEqual(p["baseline_inputs"], sources)
        self.assertEqual(p["outcome_sources"], [(URL, SHA), (URL, "c" * 64)])
        self.assertEqual(p["corrected_outcome_versions"], ["v2"])
        changed = [dict(rows[0], yards=0), *rows[1:]]
        self.assertNotEqual(p["scored_outcomes_sha256"], e.build_report(changed, "m", sources)["provenance"]["scored_outcomes_sha256"])

    def test_scan_coverage_reports_unpriced_candidates(self):
        runs = [dict(coverage=dict(cards=696, priced=0, unavailable=696), recorded_forecasts=0,
                     blocker_counts={"No verified exact-player prop quote": 206, "Workload is below validated cohort threshold": 303}),
                dict(coverage=dict(cards=2001, priced=1416, unavailable=585), recorded_forecasts=0, blocker_counts=None,
                     per_game=[dict(blockers={"Quote older than 15 minutes": 111}), dict(blockers=["stale quotes"])]),
                dict(coverage=dict(cards=10, priced=10, unavailable=0), recorded_forecasts=8, blocker_counts={})]
        c = e.build_report([row(1, "g1")], "m", runs=runs)["scan_coverage"]
        self.assertEqual((c["runs"], c["runs_with_forecasts"], c["recorded_forecasts"]), (3, 1, 8))
        self.assertEqual(c["candidates"], {"cards": 2707, "priced": 1426, "unavailable": 1281})
        self.assertEqual(c["blocker_counts"]["Quote older than 15 minutes"], 111)
        self.assertEqual(c["blocker_counts"]["stale quotes"], 1)
        self.assertEqual(c["blocker_counts"]["No verified exact-player prop quote"], 206)

    def test_correlated_alternate_lines_do_not_count_as_extra_observations(self):
        # Plenty of other games satisfy the scope floors, but the 40.5-59.5 slice is 400 alternate
        # quotes from 4 players in 2 games: far below its own player-game and game floors.
        others = [dict(r, line=70.5, yards=80 if r["yards"] == 60 else 10) for r in self.sample(0.8, 1)]
        rng, crowd = random.Random(3), []
        for i in range(400):
            crowd.append(row(1000 + i, f"x{i % 2}", player=f"q{i % 4}", line=40.5 + (i % 9),
                             yards=60 if rng.random() < 0.8 else 10, recorded=f"2026-10-18T12:{i % 60:02d}:00Z"))
        r = e.build_report(others + crowd, "m")["scopes"]["rushing:RB"]
        mid = r["slices"][1]
        self.assertEqual(mid["decided_effective"], {"player_games": 4, "games": 2})
        self.assertFalse(mid["criteria"]["review_floors"])
        self.assertFalse(mid["criteria"]["no_vig_coverage"])
        self.assertFalse(mid["criteria"]["return_sample"])
        self.assertNotIn([40.5, 59.5], r["eligible_slices"])

    def test_first_capture_ties_break_on_provider_time_then_ids(self):
        same = "2026-10-18T12:00:00Z"
        alt = dict(row(1, "g1", recorded=same, player="p1", odds=-230), quote_observed_at="2026-10-18T11:59:30Z", observation_id="o2")
        main = dict(row(2, "g1", recorded=same, player="p1", odds=-200), quote_observed_at="2026-10-18T11:58:00Z", observation_id="o1")
        self.assertEqual([r["forecast_id"] for r in e.first_observations([alt, main])], ["f2"])
        self.assertEqual([r["forecast_id"] for r in e.first_observations([main, alt])], ["f2"])

    def test_scan_coverage_sums_fanduel_specific_counts(self):
        runs = [dict(coverage=dict(cards=10, priced=9, unavailable=1), recorded_forecasts=2,
                     fanduel_coverage=dict(candidates=6, priced=2, unavailable=4),
                     fanduel_blocker_counts={"No FanDuel quote for the player-market": 4}),
                dict(coverage=dict(cards=3, priced=0, unavailable=3), recorded_forecasts=0)]
        c = e.scan_coverage(runs)
        self.assertEqual(c["fanduel"], {"candidates": 6, "priced": 2, "unavailable": 4})
        self.assertEqual(c["fanduel_blocker_counts"], {"No FanDuel quote for the player-market": 4})
        self.assertEqual(c["runs_without_fanduel_coverage"], 1)

    def test_eligible_cohort_is_price_band_overs_with_edge(self):
        rows = [row(1, "g1", odds=-300), row(2, "g1", odds=-140), row(3, "g1", direction="under"),
                row(4, "g1", edge=2.0), row(5, "g1")]
        r = e.build_report(rows, "m")["scopes"]["rushing:RB"]
        self.assertEqual(r["all_lines"]["eligible_cohort"]["n"], 1)


class Paging(unittest.TestCase):
    class Db:
        def __init__(self, n):
            self.ids, self.calls = [f"{i:05d}" for i in range(n)], []
        def request(self, path, body=None):
            self.calls.append((path, body))
            if path.endswith("record_nfl_shadow_outcomes"):
                return {"inserted": len(body["p_outcomes"]), "replayed": 0, "corrected": 0}
            after = body.get("p_after")
            rest = [i for i in self.ids if after is None or i > after][: body["p_limit"]]
            return [dict(forecast_id=i, player_id="p1", season=2026, week=7, market="rushing", team="SEA") for i in rest]

    def test_paged_reads_every_row_past_the_api_cap(self):
        db = self.Db(2500)
        rows = e.paged(db, "nfl_shadow_pending_outcomes", {}, "forecast_id")
        self.assertEqual(len(rows), 2500)
        self.assertEqual([b["p_after"] for _, b in db.calls], [None, "00999", "01999"])

    def test_grade_writes_outcomes_in_chunks(self):
        db = self.Db(2500)
        frame = pd.DataFrame([dict(player_id="p1", season=2026, week=7, recent_team="SEA", season_type="REG", rushing_yards=50.0, receiving_yards=0.0)])
        with unittest.mock.patch.object(e, "load", lambda seasons, fetch=None: {2026: (frame, URL, SHA)}):
            out = e.grade(db)
        writes = [b for p, b in db.calls if p.endswith("record_nfl_shadow_outcomes")]
        self.assertEqual([len(b["p_outcomes"]) for b in writes], [1000, 1000, 500])
        self.assertEqual((out["pending"], out["graded"], out["inserted"]), (2500, 2500, 2500))


if __name__ == "__main__":
    unittest.main()

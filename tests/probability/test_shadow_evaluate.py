from pathlib import Path
import random
import sys
import unittest
import pandas as pd
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "research" / "probability"))
import shadow_evaluate as e

URL, SHA = "https://example.test/stats_player_week_2026.csv", "a" * 64


def frame(rows):
    return {2026: (pd.DataFrame(rows), URL, SHA)}


def pending(fid, player="p1", team="SEA", week=7, market="rushing"):
    return dict(forecast_id=fid, player_id=player, season=2026, week=week, market=market, team=team)


class Outcomes(unittest.TestCase):
    def test_yards_void_and_unpublished(self):
        frames = frame([
            dict(player_id="p1", season=2026, week=7, recent_team="SEA", season_type="REG", rushing_yards=-3.0, receiving_yards=12.0),
            dict(player_id="p2", season=2026, week=7, recent_team="SEA", season_type="REG", rushing_yards=40.0, receiving_yards=0.0),
        ])
        graded = e.outcomes([pending("f1"), pending("f2", market="receiving"), pending("f3", player="p9"),
                             pending("f4", team="KC"), pending("f5", week=8)], frames)
        by = {g["forecast_id"]: g for g in graded}
        self.assertEqual(by["f1"]["yards"], 0.0)          # negative rushing yards clear nothing
        self.assertEqual(by["f2"]["yards"], 12.0)
        self.assertTrue(by["f3"]["void"])                 # team played, player did not
        self.assertNotIn("f4", by)                        # team's week not published yet
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
        self.assertFalse(r["meets_protocol"])

    def test_strong_sample_passes_and_weak_sample_does_not(self):
        good_rng, bad_rng = random.Random(1), random.Random(2)
        good, bad = [], []
        for i in range(400):
            game = f"g{i % 50}"
            win = good_rng.random() < 0.8  # outcomes beat a 0.66 no-vig price; the model says 0.8
            good.append(row(i, game, p=0.8, yards=60 if win else 10))
            lose = bad_rng.random() < 0.55  # the market (0.66) is closer than the model (0.8)
            bad.append(row(i, game, p=0.8, yards=60 if not lose else 10))
        g = e.build_report(good, "m")["scopes"]["rushing:RB"]
        b = e.build_report(bad, "m")["scopes"]["rushing:RB"]
        self.assertTrue(g["meets_protocol"], g["criteria"])
        self.assertFalse(b["meets_protocol"])
        self.assertFalse(b["criteria"]["beats_no_vig_brier"])
        self.assertEqual(g["eligible_cohort"]["clv_coverage"], 400)

    def test_eligible_cohort_is_price_band_overs_with_edge(self):
        rows = [row(1, "g1", odds=-300), row(2, "g1", odds=-140), row(3, "g1", direction="under"),
                row(4, "g1", edge=2.0), row(5, "g1")]
        r = e.build_report(rows, "m")["scopes"]["rushing:RB"]
        self.assertEqual(r["eligible_cohort"]["n"], 1)


if __name__ == "__main__":
    unittest.main()

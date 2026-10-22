from pathlib import Path
import sys
import unittest
import numpy as np
import pandas as pd
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "research" / "probability"))
from ngs_features import NgsIndex, FEATURES, MAX_WEEKS


def rec(season, week, pid, sep, targets=8, share=20.0, yac=0.0, receptions=5, season_type="REG"):
    return {"season": season, "week": week, "season_type": season_type, "player_gsis_id": pid,
            "avg_separation": sep, "targets": targets, "percent_share_of_intended_air_yards": share,
            "avg_yac_above_expectation": yac, "receptions": receptions}


def rush(season, week, pid, ryoe, att=15, box=20.0):
    return {"season": season, "week": week, "season_type": "REG", "player_gsis_id": pid,
            "rush_yards_over_expected_per_att": ryoe, "rush_attempts": att, "percent_attempts_gte_eight_defenders": box}


class NgsFeatureTests(unittest.TestCase):
    def index(self, receiving, rushing=None):
        return NgsIndex({"receiving": pd.DataFrame(receiving), "rushing": pd.DataFrame(rushing or [rush(2024, 1, "x", 0.0)])})

    def test_only_earlier_weeks_count(self):
        league = [rec(2024, w, f"L{i}", 3.0) for w in range(1, 6) for i in range(5)]
        base = league + [rec(2024, 3, "P", 5.0)]
        before = self.index(base).features("receiving", "P", 2024, 4)
        # The game's own week and later weeks, a postseason row and a season-total row change nothing.
        leaky = base + [rec(2024, 4, "P", 9.0), rec(2024, 5, "P", 9.0), rec(2024, 0, "P", 9.0), rec(2024, 2, "P", 9.0, season_type="POST")]
        after = self.index(leaky).features("receiving", "P", 2024, 4)
        np.testing.assert_allclose(before, after)
        self.assertGreater(before[0], 0)  # separation above league mean
        self.assertAlmostEqual(before[-1], 1 / MAX_WEEKS)

    def test_no_rows_is_the_league_mean_with_zero_coverage(self):
        idx = self.index([rec(2024, 1, "L", 3.0), rec(2024, 2, "L", 4.0)])
        np.testing.assert_allclose(idx.features("receiving", "Nobody", 2024, 3), np.zeros(len(FEATURES["receiving"])))
        np.testing.assert_allclose(idx.features("receiving", "L", 2024, 1), np.zeros(len(FEATURES["receiving"])), err_msg="nothing before week 1")

    def test_shrinkage_volume_weighting_and_season_window(self):
        league = [rec(2025, w, f"L{i}", 3.0) for w in range(1, 4) for i in range(10)]
        idx = self.index(league + [rec(2025, 1, "P", 6.0, targets=2), rec(2025, 2, "P", 2.0, targets=14), rec(2023, 5, "P", 10.0)])
        f = idx.features("receiving", "P", 2025, 3)
        # Volume-weighted (6*2 + 2*14)/16 = 2.5 before shrinkage; 2023 is outside the two-season window.
        self.assertLess(f[0], 0)
        self.assertGreater(f[0], 2.5 - 3.0)  # shrunk toward the mean
        self.assertAlmostEqual(f[-1], 2 / MAX_WEEKS)

    def test_rushing_inputs(self):
        idx = self.index([rec(2024, 1, "L", 3.0)], [rush(2024, w, f"L{i}", 0.0) for w in (1, 2) for i in range(4)] + [rush(2024, 1, "R", -1.0, box=40.0)])
        f = idx.features("rushing", "R", 2024, 2)
        self.assertEqual(len(f), len(FEATURES["rushing"]))
        self.assertLess(f[0], 0)
        self.assertGreater(f[1], 0)

    def test_duplicate_player_week_rejected(self):
        with self.assertRaises(ValueError):
            self.index([rec(2024, 1, "P", 3.0), rec(2024, 1, "P", 4.0)])


if __name__ == "__main__":
    unittest.main()

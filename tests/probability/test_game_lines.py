from pathlib import Path
import sys
import unittest
import numpy as np
import pandas as pd
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "research" / "probability"))
from game_lines import GameLines, line_features


def game(season, week, home, away, spread, total, game_type="REG"):
    return {"season": season, "week": week, "game_type": game_type, "home_team": home, "away_team": away,
            "spread_line": spread, "total_line": total}


class GameLineTests(unittest.TestCase):
    def test_each_side_gets_its_own_margin_and_implied_points(self):
        lines = GameLines(pd.DataFrame([game(2025, 3, "KC", "DEN", 7.0, 44.0)]))
        home = lines.features("rushing", "KC", "DEN", 2025, 3)
        away = lines.features("rushing", "DEN", "KC", 2025, 3)
        np.testing.assert_allclose(home, [np.log(25.5 / 22), 0.7])
        np.testing.assert_allclose(away, [np.log(18.5 / 22), -0.7])

    def test_receiving_gets_no_inputs(self):
        lines = GameLines(pd.DataFrame([game(2025, 3, "KC", "DEN", 7.0, 44.0)]))
        self.assertEqual(lines.features("receiving", "KC", "DEN", 2025, 3).size, 0)

    def test_missing_or_mismatched_games_are_refused(self):
        lines = GameLines(pd.DataFrame([game(2025, 3, "KC", "DEN", 7.0, 44.0),
                                        game(2025, 19, "KC", "BUF", 2.0, 48.0, "WC"),
                                        game(2025, 4, "LV", "LAC", None, None)]))
        for args in [("KC", "BUF", 2025, 19), ("KC", "LV", 2025, 3), ("LV", "LAC", 2025, 4)]:
            with self.assertRaises(ValueError):
                lines.features("rushing", *args)

    def test_implied_points_never_fall_below_one(self):
        self.assertAlmostEqual(line_features(10.0, -30.0)[0], np.log(1 / 22))
        with self.assertRaises(ValueError):
            line_features(float("nan"), 3.0)


if __name__ == "__main__":
    unittest.main()

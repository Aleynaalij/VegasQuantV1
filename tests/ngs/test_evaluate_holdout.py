from pathlib import Path
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "research" / "ngs"))
from evaluate_holdout import evaluate, newcombe, wilson


def leg(split, flag_value, cleared, stat="rushing_yards", flags="F4,F5", f5=""):
    return {"split": split, "statistic": stat, "applicable_flags": flags, "cleared": str(cleared),
            "F1": "", "F2": "", "F3": "", "F4": flag_value, "F5": f5, "F6": ""}


class HoldoutTests(unittest.TestCase):
    def test_wilson_and_newcombe_match_known_values(self):
        lo, hi = wilson(81, 263)  # Newcombe (1998) example
        self.assertAlmostEqual(lo, 0.2553, places=3)
        self.assertAlmostEqual(hi, 0.3662, places=3)
        d, lo, hi = newcombe(56, 70, 48, 80)  # Newcombe (1998) method 10 example: 0.0524 to 0.3339
        self.assertAlmostEqual(d, 0.2, places=6)
        self.assertAlmostEqual(lo, 0.0524, places=3)
        self.assertAlmostEqual(hi, 0.3339, places=3)

    def test_rule_needs_all_three_conditions(self):
        strong = [leg("holdout", "1", i % 2) for i in range(200)] + [leg("holdout", "0", int(i % 10 < 7)) for i in range(800)]
        r = evaluate(strong)["holdout:rushing_yards:F4"]
        self.assertEqual(r["flagged_legs"], 200)
        self.assertAlmostEqual(r["difference_points"], -20.0)
        self.assertTrue(r["rule_proposal"])
        few = [leg("holdout", "1", i % 2) for i in range(100)] + [leg("holdout", "0", int(i % 10 < 7)) for i in range(800)]
        self.assertFalse(evaluate(few)["holdout:rushing_yards:F4"]["checks"]["at_least_150_flagged"])
        small_gap = [leg("holdout", "1", int(i % 100 < 66)) for i in range(300)] + [leg("holdout", "0", int(i % 10 < 7)) for i in range(800)]
        self.assertFalse(evaluate(small_gap)["holdout:rushing_yards:F4"]["rule_proposal"])

    def test_missing_flags_excluded_and_development_decides_nothing(self):
        rows = [leg("holdout", "", 0)] * 5 + [leg("development", "1", 0)] * 300 + [leg("development", "0", 1)] * 300
        res = evaluate(rows)
        self.assertEqual(res["holdout:rushing_yards:F4"]["missing_flag"], 5)
        self.assertFalse(res["holdout:rushing_yards:F4"]["rule_proposal"])
        self.assertNotIn("rule_proposal", res["development:rushing_yards:F4"])


if __name__ == "__main__":
    unittest.main()

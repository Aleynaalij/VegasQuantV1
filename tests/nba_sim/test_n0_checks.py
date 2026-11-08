"""Regression tests for research/nba_sim/n0_checks.py (v2), built from Elo's N0 read-back cases
(issue #65, comment 6721310919) plus positive controls. Standard library only:

python3 -m unittest discover -s tests/nba_sim -p 'test_*.py'
"""
import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location("n0", pathlib.Path(__file__).resolve().parents[2] / "research/nba_sim/n0_checks.py")
n0 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(n0)


def row(team, t, shooting=False, scoring=False, value=0, period="1"):
    return {"home_team_id": "H", "away_team_id": "A", "team_id": team, "type_text": t,
            "shooting_play": "true" if shooting else "false", "scoring_play": "true" if scoring else "false",
            "score_value": str(value), "period_number": period}


END = row("", "End Period")


def run(*rows):
    return n0.check_game(list(rows))


class EloCases(unittest.TestCase):
    def test_1_orphan_final_attempt_is_incomplete(self):
        r = run(row("H", "Free Throw - 2 of 2", True, True, 1))
        self.assertEqual(len(r["trips_bad"]), 1)
        self.assertEqual(r["trips_bad"][0]["reason"], "orphan or out-of-order attempt")

    def test_2_trip_open_at_period_end_is_flushed(self):
        r = run(row("H", "Free Throw - 1 of 2", True, True, 1), END)
        self.assertEqual([t["reason"] for t in r["trips_bad"]], ["trip open at period end"])

    def test_3_technical_free_throw_does_not_switch_possession(self):
        r = run(row("H", "Jump Shot", True, False), row("A", "Free Throw - Technical", True, True, 1),
                row("H", "Offensive Rebound"), row("H", "Jump Shot", True, True, 2), END)
        self.assertEqual((r["poss"]["H"], r["poss"]["A"]), (1, 0))
        self.assertEqual((r["pts"]["H"], r["pts"]["A"]), (2, 1))

    def test_4_made_basket_at_the_buzzer_adds_no_opponent_possession(self):
        r = run(row("H", "Jump Shot", True, True, 2), END)
        self.assertEqual((r["poss"]["H"], r["poss"]["A"]), (1, 0))

    def test_5_unknown_scoring_type_is_reported_and_counted(self):
        r = run(row("H", "Unknown score", False, True, 2))
        self.assertEqual(r["unrecognised"], {"Unknown score": 1})
        self.assertEqual(r["pts"]["H"], 2)


class PositiveControls(unittest.TestCase):
    def test_complete_trip_is_not_flagged(self):
        r = run(row("H", "Free Throw - 1 of 2", True, True, 1), row("H", "Free Throw - 2 of 2", True, True, 1), END)
        self.assertEqual(r["trips_bad"], [])
        self.assertEqual(r["trips_total"], 1)

    def test_three_shot_trip_out_of_order_is_flagged(self):
        r = run(row("H", "Free Throw - 1 of 3", True, True, 1), row("H", "Free Throw - 3 of 3", True, True, 1))
        self.assertEqual(len(r["trips_bad"]), 1)

    def test_made_basket_then_opponent_acts_counts_one_each(self):
        r = run(row("H", "Jump Shot", True, True, 2), row("A", "Jump Shot", True, False), END)
        self.assertEqual((r["poss"]["H"], r["poss"]["A"]), (1, 1))

    def test_and_one_keeps_possession_with_shooter(self):
        r = run(row("H", "Driving Layup Shot", True, True, 2), row("H", "Free Throw - 1 of 1", True, True, 1),
                row("A", "Jump Shot", True, False), END)
        self.assertEqual((r["poss"]["H"], r["poss"]["A"]), (1, 1))
        self.assertEqual(r["trips_bad"], [])

    def test_opponent_possession_without_logged_action_still_counts(self):
        # H scores, A inbounds and the next logged event is a whistle, then H shoots again: A had the ball.
        r = run(row("H", "Jump Shot", True, True, 2), row("A", "Personal Foul"), row("H", "Jump Shot", True, False), END)
        self.assertEqual((r["poss"]["H"], r["poss"]["A"]), (2, 1))

    def test_defensive_rebound_starts_rebounders_possession(self):
        r = run(row("H", "Jump Shot", True, False), row("A", "Defensive Rebound"), END)
        self.assertEqual((r["poss"]["H"], r["poss"]["A"]), (1, 1))

    def test_turnover_hands_ball_over_pending(self):
        r = run(row("H", "Bad Pass Turnover"), END)
        self.assertEqual((r["poss"]["H"], r["poss"]["A"]), (1, 0))

    def test_flagrant_trip_retains_possession(self):
        r = run(row("H", "Free Throw - Flagrant 1 of 2", True, True, 1), row("H", "Free Throw - Flagrant 2 of 2", True, True, 1),
                row("H", "Jump Shot", True, False), END)
        self.assertEqual((r["poss"]["H"], r["poss"]["A"]), (1, 0))
        self.assertEqual(r["trips_bad"], [])

    def test_unassigned_scoring_team_is_reported(self):
        r = run(row("X", "Jump Shot", True, True, 2))
        self.assertEqual(r["unassigned"], {"Jump Shot": 1})


if __name__ == "__main__":
    unittest.main()

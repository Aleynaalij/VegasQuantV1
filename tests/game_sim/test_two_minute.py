"""v0.2.22 two-minute warning (TWO_MINUTE_WARNING_PROTOCOL.md)."""
import unittest
from collections import Counter
from research.game_sim.state import State, Action, transition
from research.game_sim.model import Sampler, MODEL_ID


class TwoMinuteWarningTests(unittest.TestCase):
    def test_clock_stops_at_two_minutes_in_q2_q4_and_ot(self):
        for period, clock in ((2, 140), (4, 125), (5, 150)):
            after = transition(State(period=period, clock=clock), Action('run', elapsed=40, yards=3)).after
            self.assertEqual(after.clock, 120)
            self.assertEqual((after.home_timeouts, after.away_timeouts), (3, 3))  # no timeout charged

    def test_no_warning_in_q1_q3_or_once_inside_two_minutes(self):
        self.assertEqual(transition(State(period=1, clock=140), Action('run', elapsed=40, yards=3)).after.clock, 100)
        self.assertEqual(transition(State(period=3, clock=140), Action('run', elapsed=40, yards=3)).after.clock, 100)
        self.assertEqual(transition(State(period=4, clock=110), Action('run', elapsed=30, yards=3)).after.clock, 80)
        self.assertEqual(transition(State(period=4, clock=160), Action('run', elapsed=40, yards=3)).after.clock, 120)
        self.assertEqual(transition(State(period=4, clock=160), Action('run', elapsed=30, yards=3)).after.clock, 130)

    def test_censored_gap_resampled_only_where_it_would_not_reach_the_warning(self):
        templates = [dict(kind='run', elapsed=8, yards=3, warning_censored=True),
                     dict(kind='run', elapsed=25, yards=2), dict(kind='run', elapsed=5, yards=1)]
        ctx = 'scrimmage|1|10|80'  # any key; the table below is used directly
        model = dict(model_id=MODEL_ID, minimum_context=1, templates=templates, buckets={ctx: {'0': 1}})
        s = State(period=4, clock=250)
        sampler = Sampler(model, 3, tables={k: (['0', '1', '2'], [100, 1, 1], 102) for k in __import__('research.game_sim.model', fromlist=['contexts']).contexts(s)})
        a = sampler.draw(s, allow_timeout=False)
        self.assertEqual(a.elapsed, 25)  # only the uncensored same-kind gap >= 8 s qualifies
        self.assertEqual(sampler.fallbacks['warning_censored_resampled'], 1)
        s2 = State(period=4, clock=125)  # reaches 2:00 anyway: kept, the kernel stops the clock
        sampler2 = Sampler(model, 3, tables={k: (['0', '1', '2'], [100, 1, 1], 102) for k in __import__('research.game_sim.model', fromlist=['contexts']).contexts(s2)})
        a2 = sampler2.draw(s2, allow_timeout=False)
        self.assertEqual(a2.elapsed, 8)
        self.assertEqual(sampler2.fallbacks['warning_censored_resampled'], 0)


if __name__ == '__main__':
    unittest.main()

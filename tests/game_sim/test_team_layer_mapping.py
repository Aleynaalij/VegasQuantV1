"""TEAM_LAYER_PROTOCOL section 3 on synthetic template contexts."""
import math
import unittest
from research.game_sim.team_layer import mapping as mp

TEMPLATES = [
    dict(kind='run', yards=-2), dict(kind='run', yards=3), dict(kind='run', yards=12),
    dict(kind='pass_complete', yards=8), dict(kind='pass_complete', yards=25),
    dict(kind='pass_incomplete', yards=0), dict(kind='sack', yards=-7),
    dict(kind='interception', spot=10), dict(kind='penalty', yards=5), dict(kind='timeout'),
]
CONTEXT = {'0': 10, '1': 30, '2': 10, '3': 25, '4': 5, '5': 15, '6': 5, '7': 3, '8': 4, '9': 2}


def group_mass(weights, kinds):
    return sum(w for k, w in weights.items() if TEMPLATES[int(k)]['kind'] in kinds)


def mean_yards(weights, kinds):
    items = [(w, TEMPLATES[int(k)].get('yards', 0)) for k, w in weights.items() if TEMPLATES[int(k)]['kind'] in kinds]
    return sum(w * y for w, y in items) / sum(w for w, _ in items)


class MappingTests(unittest.TestCase):
    def test_zero_coefficients_return_the_unchanged_object(self):
        out, counts = mp.adjust(CONTEXT, TEMPLATES)
        self.assertIs(out, CONTEXT)
        self.assertFalse(counts)

    def test_fixed_group_mass_and_proportions_never_change(self):
        out, _ = mp.adjust(CONTEXT, TEMPLATES, g_o=0.4, h_d=0.2, a_o=1.0, b_d=0.5)
        for k in ('7', '8', '9'):
            self.assertAlmostEqual(out[k], CONTEXT[k])
        self.assertAlmostEqual(sum(out.values()), sum(CONTEXT.values()))

    def test_pass_share_moves_by_offense_plus_allowed_defense_logit(self):
        out, _ = mp.adjust(CONTEXT, TEMPLATES, g_o=0.3, h_d=0.2)
        m = group_mass(CONTEXT, mp.RUN | mp.PASS)
        q0 = group_mass(CONTEXT, mp.PASS) / m
        q1 = group_mass(out, mp.PASS) / m
        self.assertAlmostEqual(math.log(q1 / (1 - q1)) - math.log(q0 / (1 - q0)), 0.5)
        self.assertAlmostEqual(group_mass(out, mp.RUN | mp.PASS), m)

    def test_a_defense_that_allows_passing_raises_pass_share(self):
        out, _ = mp.adjust(CONTEXT, TEMPLATES, h_d=0.5)
        self.assertGreater(group_mass(out, mp.PASS), group_mass(CONTEXT, mp.PASS))

    def test_gain_tilt_hits_target_shift_in_each_group(self):
        out, counts = mp.adjust(CONTEXT, TEMPLATES, a_o=0.6, b_d=0.4)
        self.assertFalse(counts)
        for kinds in (mp.RUN, mp.PASS):
            self.assertAlmostEqual(mean_yards(out, kinds), mean_yards(CONTEXT, kinds) + 1.0, delta=1e-6)

    def test_one_sided_context_is_split_degenerate_never_invents_a_group(self):
        runs_only = {'0': 5, '1': 5, '9': 1}
        out, counts = mp.adjust(runs_only, TEMPLATES, g_o=1.0)
        self.assertEqual(counts['split_degenerate'], 1)
        self.assertEqual(set(out), set(runs_only))
        self.assertAlmostEqual(sum(out.values()), 11)

    def test_unattainable_target_uses_zero_tilt_and_is_logged(self):
        log = []
        out, counts = mp.adjust(CONTEXT, TEMPLATES, a_o=40.0, context='ctx-1', log=log)
        self.assertEqual(counts['tilt_unattainable'], 2)
        self.assertEqual(log[0], dict(status='tilt_unattainable', context='ctx-1', target_shift=40.0))
        self.assertAlmostEqual(mean_yards(out, mp.RUN), mean_yards(CONTEXT, mp.RUN))

    def test_single_yardage_group_is_tilt_degenerate(self):
        ctx = {'5': 10, '0': 5, '1': 5}  # pass group holds only the 0-yard incompletion
        _, counts = mp.adjust(ctx, TEMPLATES, a_o=1.0)
        self.assertEqual(counts['tilt_degenerate'], 1)

    def test_solver_is_monotone_and_within_tolerance(self):
        items = [(1, -5), (2, 0), (3, 4), (1, 20)]
        base = sum(w * y for w, y in items) / 7
        for shift in (-2, -0.5, 0.5, 3):
            lam, status = mp.solve_tilt(items, shift)
            self.assertEqual(status, 'ok')
            got = sum(w * math.exp(lam * y) * y for w, y in items) / sum(w * math.exp(lam * y) for w, y in items)
            self.assertAlmostEqual(got, base + shift, delta=1e-6)


if __name__ == '__main__':
    unittest.main()

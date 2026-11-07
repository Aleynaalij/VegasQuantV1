"""TEAM_LAYER_PROTOCOL section 2 on synthetic plays."""
import math
import unittest
from research.game_sim.team_layer import effects as ef


def play(o, d, kind, gain, w=1.0, down=1, distance=10, half=1, lead='tied'):
    return dict(offense=o, defense=d, kind=kind, gain=gain, w=w, down=down,
                distance=distance, half=half, lead=lead)


def league(extra=()):
    """Four teams, round robin, identical except where `extra` adds plays."""
    plays = []
    teams = 'ABCD'
    for o in teams:
        for d in teams:
            if o == d:
                continue
            for _ in range(60):
                plays.append(play(o, d, 'run', 4))
                plays.append(play(o, d, 'pass', 6))
    return plays + list(extra)


class GainTests(unittest.TestCase):
    def test_balanced_league_has_zero_effects(self):
        a, b = ef.gain_effects(league())
        for t in 'ABCD':
            self.assertAlmostEqual(a[t], 0, places=9)
            self.assertAlmostEqual(b[t], 0, places=9)

    def test_better_offense_and_leakier_defense_have_positive_shrunk_effects(self):
        extra = [play('A', o, 'run', 12) for o in 'BCD' for _ in range(100)]
        extra += [play(o, 'D', 'pass', 14) for o in 'ABC' for _ in range(100)]
        a, b = ef.gain_effects(league(extra))
        self.assertGreater(a['A'], 0)
        self.assertGreater(b['D'], 0)  # D *allows* more: added, not subtracted, at mapping time
        self.assertLess(a['A'], 8)  # ridge shrinks toward zero

    def test_residuals_are_against_each_groups_own_mean(self):
        # A league where passes gain more than runs everywhere has no team effects.
        a, _ = ef.gain_effects(league())
        self.assertAlmostEqual(max(abs(v) for v in a.values()), 0, places=9)

    def test_recency_weight_scales_influence(self):
        heavy = [play('A', 'B', 'run', 20, w=1.0) for _ in range(50)]
        light = [play('A', 'B', 'run', 20, w=0.1) for _ in range(50)]
        self.assertGreater(ef.gain_effects(league(heavy))[0]['A'], ef.gain_effects(league(light))[0]['A'])


class RateTests(unittest.TestCase):
    def test_cell_fallback_levels(self):
        plays = league([play('A', 'B', 'pass', 5, down=4, distance=2, half=2, lead='behind')])
        expected, levels = ef.expected_rates(plays)
        self.assertEqual(sum(levels.values()), len(plays))
        self.assertGreater(levels[2], 0)  # the lone 4th-down play falls back to down alone

    def test_pass_happy_offense_gets_positive_logit(self):
        extra = [play('A', d, 'pass', 6) for d in 'BCD' for _ in range(150)]
        g, h, counts = ef.rate_effects(league(extra))
        self.assertGreater(g['A'], 0)
        for t in 'BCD':
            self.assertLess(g[t], g['A'])

    def test_logit_conversion_matches_definition(self):
        extra = [play('A', d, 'pass', 6) for d in 'BCD' for _ in range(150)]
        plays = league(extra)
        g, _, _ = ef.rate_effects(plays)
        expected, _ = ef.expected_rates(plays)
        off_p, _ = ef.ridge([(p['offense'], p['defense'], (p['kind'] == 'pass') - e, p['w']) for p, e in zip(plays, expected)])
        rows = [(p, e) for p, e in zip(plays, expected) if p['offense'] == 'A']
        base = sum(e for _, e in rows) / len(rows)
        self.assertAlmostEqual(g['A'], math.log((base + off_p['A']) / (1 - base - off_p['A'])) - math.log(base / (1 - base)))

    def test_degenerate_rate_is_dropped_and_counted_never_clamped(self):
        # Every play is a pass: base expectation is 1.0, outside (0.01, 0.99).
        plays = [play(o, d, 'pass', 6) for o in 'AB' for d in 'AB' if o != d for _ in range(50)]
        g, h, counts = ef.rate_effects(plays)
        self.assertEqual(g, {'A': 0.0, 'B': 0.0})
        self.assertEqual(counts['rate_degenerate'], 4)

    def test_fit_reports_raw_and_weighted_support(self):
        out = ef.fit_effects(league([play('A', 'B', 'run', 4, w=0.5)]))
        self.assertEqual(out['support']['offense:A']['plays'], 361)
        self.assertAlmostEqual(out['support']['offense:A']['weighted'], 360.5)


if __name__ == '__main__':
    unittest.main()

"""v0.2.24 role-marginal floor (ROLE_MARGINAL_PROTOCOL.md)."""
import os
import unittest
from research.game_sim.model import MODEL_ID, Sampler
from research.game_sim.state import State
from research.game_sim.timeout_cells import residual_cells, chain, eligibility, stopped_band, MIN


def normal_ops(elig, outcome, count):
    s = State(period=1, clock=600, home_timeouts=3 if elig in ('both', 'offense') else 0,
              away_timeouts=3 if elig in ('both', 'defense') else 0)
    band = stopped_band(s)
    return [(chain('stopped', band, s, elig), outcome, (band, elig))] * count


class RoleMarginalTests(unittest.TestCase):
    def test_both_eligible_calls_by_both_sides_reach_the_role_cells(self):
        # Elo's repro: both-eligible opportunities with offense AND defense calls.
        ops = normal_ops('both', 'offense', 6) + normal_ops('both', 'defense', 4) + normal_ops('both', 'none', 90) \
            + normal_ops('offense', 'offense', 1) + normal_ops('offense', 'none', 9)
        cells, unresolved = residual_cells(ops, 'stopped')
        self.assertNotIn('normal@all~role|both', cells)
        self.assertEqual(dict(cells['normal@all~role|offense']), {'n': 110, 'offense': 7})
        self.assertEqual(dict(cells['normal@all~role|defense']), {'n': 100, 'defense': 4})
        self.assertEqual(unresolved, 0)

    def test_both_eligible_floor_uses_each_role_marginal(self):
        s = State(period=1, clock=600)
        self.assertEqual(eligibility(s), 'both')
        self.assertTrue(chain('stopped', stopped_band(s), s, 'both')[-1].endswith('~role|both'))
        model = dict(model_id=MODEL_ID, minimum_context=30, templates=[], buckets={},
                     timeout_model=dict(minimum_context=30, running={}, stopped={
                         'normal@all~role|offense': dict(n=200, offense=10, defense=0),
                         'normal@all~role|defense': dict(n=100, offense=0, defense=3)}))
        sampler = Sampler(model, 1)
        po, pd = sampler.timeout_rates(s, 'stopped')
        self.assertAlmostEqual(po, 0.05)
        self.assertAlmostEqual(pd, 0.03)
        self.assertEqual(sampler.fallbacks['role_marginal_timeout_cell:both'], 1)
        self.assertEqual(sampler.fallbacks['timeout_terminal_floor:stopped:normal@all~role|both'], 1)

    def test_thin_role_cell_stays_unsupported(self):
        s = State(period=1, clock=600)
        model = dict(model_id=MODEL_ID, minimum_context=30, templates=[], buckets={},
                     timeout_model=dict(minimum_context=30, running={}, stopped={
                         'normal@all~role|offense': dict(n=200, offense=10, defense=0),
                         'normal@all~role|defense': dict(n=MIN - 1, offense=0, defense=3)}))
        with self.assertRaises(ValueError):
            Sampler(model, 1).timeout_rates(s, 'stopped')

    @unittest.skipUnless(os.environ.get('VQ_PBP_2022'), 'source bytes not available')
    def test_source_both_eligible_counts(self):
        import csv, gzip, io
        import research.game_sim.timeout_cells as tc
        rows = list(csv.DictReader(io.StringIO(gzip.decompress(open(os.environ['VQ_PBP_2022'], 'rb').read()).decode('utf-8-sig'))))
        _, stopped, _ = tc.tabulate_rows(rows)
        self.assertNotIn('normal@all~role|both', stopped)
        self.assertEqual(dict(stopped['normal@all~role|offense']), {'n': 29588, 'offense': 351})
        self.assertEqual(dict(stopped['normal@all~role|defense']), {'n': 29601, 'defense': 154})


if __name__ == '__main__':
    unittest.main()


class ElosRepro(unittest.TestCase):
    def test_fifteen_offense_fifteen_defense(self):
        ops = normal_ops('both', 'offense', 15) + normal_ops('both', 'defense', 15)
        cells, unresolved = residual_cells(ops, 'stopped')
        self.assertNotIn('normal@all~role|both', cells)
        self.assertEqual(dict(cells['normal@all~role|offense']), {'n': 30, 'offense': 15})
        self.assertEqual(dict(cells['normal@all~role|defense']), {'n': 30, 'defense': 15})
        self.assertEqual(unresolved, 0)
        model = dict(model_id=MODEL_ID, minimum_context=30, templates=[], buckets={},
                     timeout_model=dict(minimum_context=30, running={}, stopped={k: dict(n=v['n'], offense=v['offense'], defense=v['defense']) for k, v in cells.items() if v['n']}))
        po, pd = Sampler(model, 1).timeout_rates(State(period=1, clock=600), 'stopped')
        self.assertEqual((po, pd), (0.5, 0.5))

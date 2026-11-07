"""ACCOUNTING_PROTOCOL.md: counters only, no change to random draws."""
import copy
import random
import unittest
from collections import Counter
from research.game_sim.model import MODEL_ID, Sampler, context_options, context_labels
from research.game_sim.state import State
from research.game_sim.batch import game, run_batch
from research.game_sim.timeout_cells import residual_cells, MIN
from test_batch import fixture


class AccountingTests(unittest.TestCase):
    def test_every_context_option_has_a_label(self):
        states = [State(period=p, clock=c, yardline=y, down=d, distance=min(10, y), home_score=h)
                  for p in (1, 2, 4, 5) for c in (5, 25, 100, 250, 600) for y in (3, 10, 75)
                  for d in (1, 4) for h in (0, 3, 14) if c <= (600 if p == 5 else 900)]
        for s in states:
            primary, floors, pooled = context_options(s)
            labels = context_labels(s)
            for ctx in primary + floors + pooled:
                self.assertIn(ctx, labels, (s, ctx))

    def test_last300_fallback_is_labelled_not_band_preserved(self):
        s = State(period=4, clock=250, down=1, distance=10, yardline=75)
        primary, floors, _ = context_options(s)
        normal = [c for c in primary if '|normal|' in c][0]
        model = dict(model_id=MODEL_ID, minimum_context=30, templates=[dict(kind='run', elapsed=5, yards=1)],
                     buckets={normal: {'0': 100}})
        sampler = Sampler(model, 3)
        sampler.draw(s, allow_timeout=False)
        f = sampler.fallbacks
        self.assertEqual(f['last300_normal_fallback'], 1)
        self.assertEqual(f['band_preserved_samples'], 0)
        self.assertEqual(f['band_half_pooled_fallback'], 0)
        self.assertEqual(f['play_context:last300_normal:exact'], 1)
        self.assertFalse(any(isinstance(k, int) for k in f))

    def test_band_preserved_draw_and_path_label(self):
        s = State(period=4, clock=250, down=1, distance=10, yardline=75)
        primary, _, _ = context_options(s)
        model = dict(model_id=MODEL_ID, minimum_context=30, templates=[dict(kind='run', elapsed=5, yards=1)],
                     buckets={primary[1]: {'0': 100}})
        sampler = Sampler(model, 3)
        sampler.draw(s, allow_timeout=False)
        self.assertEqual(sampler.fallbacks['band_preserved_samples'], 1)
        self.assertEqual(sampler.fallbacks['band_half_preserved_samples'], 1)
        self.assertEqual(sampler.fallbacks['play_context:late:drop:distance'], 1)
        self.assertEqual(sampler.fallbacks['play_context_length:5'], 1)

    def test_counters_consume_no_random_draws(self):
        model = fixture()
        a, b = Sampler(model, 11), random.Random(11)
        s = State(period=4, clock=250)
        a.draw(s, allow_timeout=False)
        b.choices([0], k=1)
        self.assertEqual(a.rng.getstate(), b.getstate())

    def test_batch_keeps_play_context_counts(self):
        batch = run_batch(fixture(), 3, 1701)
        counts = batch['coverage']['censoring']
        draws = sum(v for k, v in counts.items() if k.startswith('play_context:'))
        self.assertGreater(draws, 0)
        self.assertEqual(draws, sum(v for k, v in counts.items() if k.startswith('play_context_length:')))
        rows = [game(fixture(), 1701 + i)['fallbacks'] for i in range(3)]
        self.assertEqual(draws, sum(v for r in rows for k, v in r.items() if str(k).startswith('play_context:')))

    def test_two_minute_warning_snap_counted(self):
        rows = [game(fixture(), seed)['fallbacks'] for seed in range(1701, 1711)]
        self.assertTrue(any(r.get('two_minute_warning_snapped', 0) for r in rows))
        for r in rows:
            if r.get('two_minute_warning_snapped'):
                self.assertGreater(r['two_minute_warning_seconds_restored'], 0)

    def test_terminal_full_count_keys_reported(self):
        ops = [(['b|both|tied', 'b|both'], 'none', None)] * 20 + [(['b|both|behind', 'b|both'], 'offense', None)] * 40
        full = set()
        cells, unresolved = residual_cells(ops, 'running', full)
        self.assertEqual(cells, residual_cells(ops, 'running')[0])
        # 'behind' resolves its 40; the floor keeps a residual of 20 < MIN, so it takes its full 60.
        self.assertEqual(full, {'b|both'})
        self.assertEqual(cells['b|both']['n'], 60)
        self.assertEqual(unresolved, 0)

    def test_clipping_counters(self):
        s = State(period=4, clock=3, down=1, distance=5, yardline=5)
        primary, _, _ = context_options(s)
        model = dict(model_id=MODEL_ID, minimum_context=30, templates=[dict(kind='run', elapsed=20, yards=30)],
                     buckets={primary[0]: {'0': 100}})
        sampler = Sampler(model, 3)
        a = sampler.draw(s, allow_timeout=False)
        self.assertEqual((a.elapsed, a.yards), (3, 5))
        self.assertEqual(sampler.fallbacks['elapsed_clipped_to_clock'], 1)
        self.assertEqual(sampler.fallbacks['yards_clamped_to_field'], 1)


if __name__ == '__main__':
    unittest.main()


class DirectCounterTests(unittest.TestCase):
    """Elo re-audit 5809217705: direct assertions for the remaining accounting counters."""

    def _draw(self, s, template):
        primary, _, _ = context_options(s)
        model = dict(model_id=MODEL_ID, minimum_context=30, templates=[template], buckets={primary[0]: {'0': 100}})
        sampler = Sampler(model, 3)
        return sampler.draw(s, allow_timeout=False), sampler.fallbacks

    def test_spot_clamped_both_boundaries(self):
        s = State(period=1, clock=600, down=4, distance=10, yardline=50)
        a, f = self._draw(s, dict(kind='punt', elapsed=5, spot=-60))
        self.assertEqual((a.spot, f['spot_clamped']), (99, 1))
        a, f = self._draw(s, dict(kind='punt', elapsed=5, spot=60))
        self.assertEqual((a.spot, f['spot_clamped']), (0, 1))
        a, f = self._draw(s, dict(kind='punt', elapsed=5, spot=10))
        self.assertEqual((a.spot, f['spot_clamped']), (40, 0))

    def test_runoff_clipped_to_clock(self):
        from research.game_sim.model import stop_contexts
        from research.game_sim.state import Action
        s = State(period=4, clock=10, down=1, distance=10, yardline=75)
        key = stop_contexts(s, 'run')[-1]
        model = dict(model_id=MODEL_ID, minimum_context=30, templates=[], buckets={},
                     stop_clock=dict(runoff_tables={key: {'40': 100}}, tables={}, minimum_context=30))
        sampler = Sampler(model, 3)
        sampler.last_source_followed_timeout = True
        a = sampler.no_call_runoff(s, Action('run', elapsed=5, yards=2))
        self.assertEqual((a.elapsed, sampler.fallbacks['runoff_clipped_to_clock']), (10, 1))
        model['stop_clock']['runoff_tables'] = {key: {'6': 100}}
        sampler = Sampler(model, 3)
        sampler.last_source_followed_timeout = True
        self.assertEqual(sampler.no_call_runoff(s, Action('run', elapsed=5, yards=2)).elapsed, 6)
        self.assertEqual(sampler.fallbacks['runoff_clipped_to_clock'], 0)

    def test_penalty_half_distance_counted(self):
        model = fixture()
        model['templates'] = model['templates'] + [dict(kind='penalty', elapsed=0, yards=99)]
        for key, entries in model['buckets'].items():
            if key.startswith('scrimmage'):
                entries['5'] = 20
        rows = [game(model, seed)['fallbacks'] for seed in range(1701, 1704)]
        self.assertTrue(all(r.get('penalty_half_distance', 0) > 0 for r in rows))
        self.assertEqual(sum(r.get('penalty_half_distance', 0) for r in [game(fixture(), 1701)['fallbacks']]), 0)

    def test_timeout_terminal_floor_only_on_chain_terminal(self):
        from research.game_sim.timeout_cells import chain, eligibility, stopped_band
        s = State(period=4, clock=250, down=1, distance=10, yardline=75)
        path = chain('stopped', stopped_band(s), s, eligibility(s))
        model = dict(model_id=MODEL_ID, minimum_context=30, templates=[], buckets={},
                     timeout_model=dict(minimum_context=30, running={}, stopped={path[-1]: dict(n=100, offense=5, defense=5)}))
        sampler = Sampler(model, 1)
        sampler.timeout_rates(s, 'stopped')
        self.assertEqual(sampler.fallbacks[f'timeout_terminal_floor:stopped:{path[-1]}'], 1)
        # Negative control: an earlier supported key is not a terminal-floor lookup.
        model['timeout_model']['stopped'][path[0]] = dict(n=100, offense=1, defense=1)
        sampler = Sampler(model, 1)
        sampler.timeout_rates(s, 'stopped')
        self.assertFalse(any(k.startswith('timeout_terminal_floor:') for k in sampler.fallbacks))

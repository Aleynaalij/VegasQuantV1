"""Team layer v0.3.0 execution pieces: aggregated effects equal effects.py; base path unchanged."""
import gzip
import json
import os
import random
import types
import unittest
from pathlib import Path

from research.game_sim.team_layer import effects, fit
from research.game_sim.team_layer.effects import band

ROOT = Path(__file__).resolve().parents[2]
PACKAGE = ROOT / 'research/game_sim/artifacts/v0.2.24'


def synthetic(seed=3, games=12):
    rng = random.Random(seed)
    teams = ['A', 'B', 'C', 'D', 'E']
    plays, gain_games, rate_games = [], [], []
    for g in range(games):
        w = 2 ** (-rng.uniform(0, 400) / 120)
        gain, rate = {}, {}
        for _ in range(rng.randint(40, 120)):
            o, d = rng.sample(teams, 2)
            kind = 'pass' if rng.random() < 0.55 else 'run'
            p = dict(offense=o, defense=d, kind=kind, gain=rng.randint(-8, 25), down=rng.randint(1, 4),
                     distance=rng.randint(1, 15), half=rng.choice((1, 2)), lead=rng.choice(('ahead', 'tied', 'behind')), w=w)
            plays.append(p)
            k = (o, d, kind)
            gain[k] = [gain.get(k, [0, 0])[0] + 1, gain.get(k, [0, 0])[1] + p['gain']]
            c = (o, d, p['down'], band(p['distance']), p['half'], p['lead'])
            rate[c] = [rate.get(c, [0, 0])[0] + 1, rate.get(c, [0, 0])[1] + (kind == 'pass')]
        gain_games.append((w, gain))
        rate_games.append((w, rate))
    return plays, gain_games, rate_games


class AggregatedEffects(unittest.TestCase):
    def test_gain_effects_match_play_level(self):
        plays, gain_games, _ = synthetic()
        ref_off, ref_def = effects.gain_effects(plays)
        (off, dfn), _ = fit.gain_effects(gain_games)
        for t in ref_off:
            self.assertAlmostEqual(off[t], ref_off[t], places=9)
            self.assertAlmostEqual(dfn[t], ref_def[t], places=9)

    def test_rate_effects_match_play_level(self):
        plays, _, rate_games = synthetic(seed=11)
        ref_off, ref_def, ref_counts = effects.rate_effects(plays)
        off, dfn, counts = fit.rate_effects(rate_games)
        for t in ref_off:
            self.assertAlmostEqual(off[t], ref_off[t], places=9)
            self.assertAlmostEqual(dfn[t], ref_def[t], places=9)
        self.assertEqual({k: v for k, v in counts.items() if k.startswith('cell_level')},
                         {k: v for k, v in ref_counts.items() if k.startswith('cell_level')})

    def test_coefficients_follow_possession(self):
        e = dict(a_o={'H': 1.0, 'V': -1.0}, b_d={'H': 0.5, 'V': -0.5}, g_o={'H': 0.1}, h_d={'V': 0.2})
        c = fit.game_coefficients(e, 'H', 'V')
        self.assertEqual(c['home'], dict(a_o=1.0, g_o=0.1, b_d=-0.5, h_d=0.2))
        self.assertEqual(c['away'], dict(a_o=-1.0, g_o=0.0, b_d=0.5, h_d=0.0))


def archived_runtime():
    """The pinned package's archived engine, loaded as an isolated package."""
    bundle = json.loads(gzip.decompress((PACKAGE / 'runtime-source.json.gz').read_bytes()))['sources']
    pkg = types.ModuleType('archived_v0224')
    pkg.__path__ = []
    import sys
    sys.modules['archived_v0224'] = pkg
    for name in ('state', 'model', 'timeout_cells', 'workload', 'batch'):
        mod = types.ModuleType(f'archived_v0224.{name}')
        mod.__package__ = 'archived_v0224'
        sys.modules[mod.__name__] = mod
        exec(compile(bundle[f'{name}.py'], f'archived/{name}.py', 'exec'), mod.__dict__)
        setattr(pkg, name, mod)
    return pkg


class ZeroCoefficientPath(unittest.TestCase):
    """Amendment A3: zero coefficients reproduce the pinned v0.2.24 base bit for bit."""

    def test_zero_coefficient_traces_equal_archived_runtime(self):
        from research.game_sim.batch import game, canonical
        from research.game_sim.team_layer.sampler import factory, TeamSampler
        model = json.loads(gzip.decompress((PACKAGE / 'model.json.gz').read_bytes()))
        old = archived_runtime()
        seeds = range(1701, 2701) if os.environ.get('VQ_TEAM_LAYER_FULL') else range(1701, 1721)
        zero = dict(home=dict(a_o=0.0, g_o=0.0, b_d=0.0, h_d=0.0), away=dict(a_o=0.0, g_o=0.0, b_d=0.0, h_d=0.0))
        tables_new = old_tables = None
        from research.game_sim.model import Sampler
        tables_new = Sampler(model, 1701).tables
        old_tables = old.model.Sampler(model, 1701).tables
        forced = lambda m, s, t=None: TeamSampler(m, s, t, zero)
        for seed in seeds:
            ref = old.batch.game(model, seed, both_possessions=False, trace=True, prepared_tables=old_tables)
            for make in (factory(zero), forced):
                got = game(model, seed, both_possessions=False, trace=True, prepared_tables=tables_new, sampler_factory=make)
                self.assertEqual(canonical(got), canonical(ref), seed)


if __name__ == '__main__':
    unittest.main()

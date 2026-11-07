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


class Scorer(unittest.TestCase):
    def test_normal_crps_closed_form(self):
        import math
        from research.game_sim.team_layer.score import normal_crps
        self.assertAlmostEqual(normal_crps(0, 1, 0), 2 / math.sqrt(2 * math.pi) - 1 / math.sqrt(math.pi), places=12)
        # Numerical integral of (F(x) - 1{x >= y})^2 for N(3, 2) at y = 5.
        from research.game_sim.team_layer.score import normal_cdf
        y, mu, sd, step = 5.0, 3.0, 2.0, 0.001
        xs = [mu - 12 + i * step for i in range(int(24 / step))]
        num = sum((normal_cdf((x - mu) / sd) - (x >= y)) ** 2 * step for x in xs)
        self.assertAlmostEqual(normal_crps(mu, sd, y), num, places=3)


class CorrectionV031(unittest.TestCase):
    """TEAM_LAYER_CORRECTION_PROTOCOL.md (Elo review 6706784974)."""

    def row(self, **kw):
        base = dict(play_type='run', penalty='0', penalty_yards='', touchdown='0', td_team='', posteam='BUF',
                    interception='0', fumble_lost='0', fumble='0', complete_pass='0', sack='0')
        base.update(kw)
        return base

    def test_gain_population_matches_engine_classification(self):
        from research.game_sim.team_layer.data import gain_exclusion
        # Positives: plain run, complete pass, incomplete pass, sack, declined (non-enforced) penalty.
        for r in (self.row(), self.row(play_type='pass', complete_pass='1'), self.row(play_type='pass'),
                  self.row(play_type='pass', sack='1'), self.row(penalty='1', penalty_yards='0')):
            self.assertIsNone(gain_exclusion(r), r)
        # Negatives: enforced penalty on run/pass, recovered fumble, lost fumble, interception, defensive TD.
        cases = [(self.row(penalty='1', penalty_yards='10'), 'penalty'),
                 (self.row(play_type='pass', penalty='1', penalty_yards='-5'), 'penalty'),
                 (self.row(fumble='1'), 'fumble_recovered'),
                 (self.row(fumble='1', fumble_lost='1'), 'turnover'),
                 (self.row(play_type='pass', interception='1'), 'turnover'),
                 (self.row(touchdown='1', td_team='MIA'), 'defensive_touchdown')]
        for r, why in cases:
            self.assertEqual(gain_exclusion(r), why, r)

    def test_scorer_fails_closed(self):
        import hashlib, tempfile
        from research.game_sim.team_layer import score
        from research.game_sim.batch import canonical
        d = Path(tempfile.mkdtemp())
        ok = dict(requested=2000, actual=2000, failed=0)
        rows = [dict(game_id=f'g{i:03d}', index=i, arms=dict(A=dict(runs=ok), D=dict(runs=ok))) for i in range(272)]
        def write(rows, tamper=False):
            body = canonical(rows)
            (d / 'shard-00.json.gz').write_bytes(gzip.compress(body))
            digest = hashlib.sha256(body + (b'x' if tamper else b'')).hexdigest()
            (d / 'shards.json').write_text(json.dumps({'0': dict(games=len(rows), sha256=digest)}))
        write(rows)
        self.assertEqual(len(score.load_shards(d)[0]), 272)
        write(rows, tamper=True)
        with self.assertRaises(ValueError):
            score.load_shards(d)
        write(rows[:-1])
        with self.assertRaises(ValueError):
            score.load_shards(d)
        bad = [dict(r) for r in rows]
        bad[5] = dict(bad[5], arms=dict(A=dict(runs=ok), D=dict(runs=dict(requested=2000, actual=1999, failed=1))))
        write(bad)
        with self.assertRaises(ValueError):
            score.load_shards(d)
        write(rows)
        with self.assertRaises(ValueError):
            score.load_shards(d, targets=[f'x{i}' for i in range(272)])

    def test_fast_crps_matches_reference(self):
        import numpy as np
        from research.game_sim.batch import distribution
        from research.game_sim.evaluate import crps
        from research.game_sim.team_layer.score import _crps_counts
        rng = random.Random(5)
        vals = [rng.randint(-30, 40) for _ in range(500)]
        d = distribution(vals)
        v = np.array([b['lo'] for b in d['bins']], float)
        c = np.array([b['count'] for b in d['bins']], float)
        for y in (-7, 0, 3, 17, 44):
            self.assertAlmostEqual(_crps_counts(v, c, y), crps(d, y), places=9)

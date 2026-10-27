import copy
import tempfile
import unittest
from research.game_sim.model import MODEL_ID, Sampler, contexts, censored_gain
from research.game_sim.state import State
from research.game_sim.batch import run_batch
from research.game_sim.integrated import validate_trace, build
from test_batch import fixture


class IntegratedTests(unittest.TestCase):
    def test_late_clock_survives_sparse_backoff(self):
        model=dict(model_id=MODEL_ID,minimum_context=30,
            templates=[dict(kind='field_goal',elapsed=3,made=True),dict(kind='run',elapsed=5,yards=1)],
            buckets={'scrimmage|last10':{'0':5},'scrimmage':{'1':1000}})
        s=State(period=2,clock=5,down=1,distance=10,yardline=20)
        sampler=Sampler(model,17)
        self.assertEqual(sampler.draw(s).kind,'field_goal')
        self.assertEqual(sampler.fallbacks['thin_context_support'],1)
        self.assertEqual(sampler.fallbacks['clock_preserved_samples'],1)
        self.assertTrue(all('last10' in key for key in contexts(s)))

    def test_missing_late_clock_support_does_not_silently_use_normal(self):
        model=fixture()
        del model['buckets']['scrimmage|last10']
        with self.assertRaises(ValueError):
            Sampler(model,17).draw(State(period=4,clock=5))

    def test_score_situation_retained_before_down_backoff(self):
        ahead=contexts(State(period=4,clock=5,home_score=3))[2]
        far=contexts(State(period=4,clock=5,home_score=10))[2]
        self.assertIn('ahead1-3',ahead)
        self.assertIn('ahead9+',far)
        self.assertNotEqual(ahead,far)

    def test_survival_mass_does_not_require_observed_non_td_pool(self):
        import random
        curve=dict(survival=[None,1,.8,.6,.5,.4]+[None]*94)
        rng=random.Random(17)
        values=[censored_gain(curve,2,5,rng) for _ in range(2000)]
        self.assertEqual(set(values),{2,3,4,5})
        self.assertTrue(900<values.count(5)<1100)
        self.assertIsNone(censored_gain(curve,2,6,rng))

    def test_end_to_end_trace_and_research_counts(self):
        batch=run_batch(fixture(),10,17,both_possessions=False)
        trace=batch['replay']['events']
        self.assertTrue(validate_trace(trace)['rules_replay_verified'])
        self.assertEqual(batch['research_metrics']['field_goals']['n'],10)
        self.assertEqual(batch['research_metrics']['late_fg_attempts']['n'],10)
        corrupt=copy.deepcopy(trace)
        corrupt[1]['before']['home_score']+=3
        with self.assertRaises(ValueError):validate_trace(corrupt)
        corrupt=copy.deepcopy(trace)
        corrupt[-1]['after']['away_score']+=1
        with self.assertRaises(ValueError):validate_trace(corrupt)
        with self.assertRaises(ValueError):validate_trace(trace[:-1])

    def test_existing_build_output_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaises(FileExistsError):
                build('unused-source','unused-calibration',root,runs=2)

    def test_complete_build_artifacts_and_provenance(self):
        import gzip, hashlib, json
        from pathlib import Path
        root=Path(__file__).resolve().parents[2]
        folder=root/'research/game_sim/artifacts/v0.2.0'
        manifest=json.loads((folder/'manifest.json').read_text())
        payloads={}
        for filename, expected in manifest['files'].items():
            raw=(folder/filename).read_bytes()
            self.assertEqual(hashlib.sha256(raw).hexdigest(),expected['sha256'])
            data=gzip.decompress(raw)
            self.assertEqual(hashlib.sha256(data).hexdigest(),expected['canonical_sha256'])
            payloads[filename]=json.loads(data)
        for name, digest in manifest['implementation_sha256'].items():
            self.assertEqual(hashlib.sha256((root/'research/game_sim'/name).read_bytes()).hexdigest(),digest)
        batch=payloads['batch.json.gz']
        self.assertEqual(batch['runs'],dict(requested=10000,actual=10000,failed=0))
        self.assertEqual(manifest['model_sha256'],batch['artifact_sha256'])
        self.assertTrue(validate_trace(batch['replay']['events'])['rules_replay_verified'])
        self.assertFalse(manifest['approval'])
        self.assertFalse(manifest['team_player_coupling_enabled'])
        self.assertFalse(payloads['calibration.json.gz']['adopted'])
        # Qualification must faithfully reflect every metric, not just the mean total.
        gate=payloads['gate.json.gz']
        self.assertEqual(gate['passed'],not batch['runs']['failed'] and
            not gate['unsupported_censoring_samples'] and all(m['passed'] for m in gate['metrics'].values()))

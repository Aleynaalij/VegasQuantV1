import copy
import tempfile
import unittest
from research.game_sim.model import MODEL_ID, Sampler, contexts, context_options, censored_gain
from research.game_sim.state import State
from research.game_sim.batch import run_batch
from research.game_sim.integrated import validate_trace, build
from test_batch import fixture


class IntegratedTests(unittest.TestCase):
    def test_late_clock_survives_sparse_backoff(self):
        model=dict(model_id=MODEL_ID,minimum_context=30,
            templates=[dict(kind='field_goal',elapsed=3,made=True),dict(kind='run',elapsed=5,yards=1)],
            buckets={'scrimmage|last10|oTO:y|dTO:y|20|tied':{'0':5},'scrimmage':{'1':1000}})
        s=State(period=2,clock=5,down=1,distance=10,yardline=20)
        sampler=Sampler(model,17)
        self.assertEqual(sampler.draw(s).kind,'field_goal')
        self.assertEqual(sampler.fallbacks['thin_context_support'],1)
        self.assertEqual(sampler.fallbacks['clock_preserved_samples'],1)
        self.assertTrue(all('last10' in key for key in context_options(s)[0]))

    def test_missing_late_clock_support_does_not_silently_use_normal(self):
        model=fixture()
        del model['buckets']['scrimmage|last10|oTO:y|dTO:y|80|tied']
        with self.assertRaises(ValueError):
            Sampler(model,17).draw(State(period=4,clock=5))

    def test_score_situation_retained_in_full_context(self):
        ahead=contexts(State(period=4,clock=5,home_score=3))[0]
        far=contexts(State(period=4,clock=5,home_score=10))[0]
        self.assertIn('ahead1-3',ahead)
        self.assertIn('ahead9+',far)
        self.assertNotEqual(ahead,far)

    def test_field_is_never_dropped_or_borrowed(self):
        s=State(yardline=75)
        for clock in (5,20,90,500):
            state=State(period=2,clock=clock,yardline=75)
            self.assertTrue(all('80' in key.split('|') for key in contexts(state)))
        model=dict(model_id=MODEL_ID,minimum_context=30,
            templates=[dict(kind='field_goal',elapsed=3,made=True)],
            buckets={'scrimmage|normal|20':{'0':1000}})
        with self.assertRaises(ValueError):Sampler(model,17).draw(s)

    def test_goal_floor_stays_in_same_physical_zone(self):
        state=State(period=2,clock=5,yardline=35,down=1,distance=35)
        keys=contexts(state)
        self.assertIn('scrimmage|last10|oTO:y|dTO:y|40|tied',context_options(state)[2])
        self.assertIn('40:goal',keys[0])
        self.assertEqual(len(keys),len(set(keys)))
        model=dict(model_id=MODEL_ID,minimum_context=30,
            templates=[dict(kind='field_goal',elapsed=3,made=True)],
            buckets={keys[-1]:{'0':2}})
        sampler=Sampler(model,17)
        self.assertEqual(sampler.draw(state).kind,'field_goal')
        self.assertEqual(sampler.fallbacks['thin_context_support'],1)

    def test_late_floor_cannot_mix_leading_and_trailing_actions(self):
        ahead=State(period=4,clock=8,home_score=7,yardline=75)
        behind=State(period=4,clock=8,away_score=3,yardline=75)
        model=dict(model_id=MODEL_ID,minimum_context=30,
            templates=[dict(kind='kneel',elapsed=5,yards=-1),dict(kind='pass_incomplete',elapsed=5,yards=0)],
            buckets={contexts(ahead)[-1]:{'0':2},contexts(behind)[-1]:{'1':2},
                'scrimmage|last10|80':{'0':1000}})
        self.assertTrue(all('ahead' in key for key in contexts(ahead)))
        self.assertTrue(all('behind' in key for key in contexts(behind)))
        self.assertEqual(Sampler(model,17).draw(ahead).kind,'kneel')
        self.assertEqual(Sampler(model,17).draw(behind).kind,'pass_incomplete')
        del model['buckets'][contexts(behind)[-1]]
        with self.assertRaises(ValueError):Sampler(model,17).draw(behind)

    def test_thin_second_half_floor_beats_thick_pooled_first_half_mix(self):
        q2=State(period=2,clock=8,home_score=7,yardline=75)
        q4=State(period=4,clock=8,home_score=7,yardline=75)
        first=context_options(q2)[1][-1];second=context_options(q4)[1][-1]
        pooled=context_options(q4)[2][-1]
        model=dict(model_id=MODEL_ID,minimum_context=30,
            templates=[dict(kind='run',elapsed=5,yards=1),dict(kind='kneel',elapsed=5,yards=-1)],
            buckets={first:{'0':100},second:{'1':2},pooled:{'0':1000}})
        sampler=Sampler(model,17)
        self.assertEqual(sampler.draw(q2).kind,'run')
        self.assertEqual(sampler.draw(q4).kind,'kneel')
        self.assertEqual(sampler.fallbacks['thin_context_support'],1)
        self.assertNotEqual(first,second)
        del model['buckets'][second]
        self.assertEqual(Sampler(model,17).draw(q4).kind,'run')

    def test_exhausted_timeout_context_continues_to_eligible_floor(self):
        s=State(period=4,clock=8,home_score=7,yardline=75,home_timeouts=0)
        primary,floors,pooled=context_options(s)
        model=dict(model_id=MODEL_ID,minimum_context=30,
            templates=[dict(kind='timeout',elapsed=0,timeout_side='offense'),dict(kind='kneel',elapsed=5,yards=-1)],
            buckets={primary[0]:{'0':100},floors[-1]:{'1':2}})
        sampler=Sampler(model,17)
        self.assertEqual(sampler.draw(s).kind,'kneel')
        self.assertGreater(sampler.fallbacks['budget_exhausted_contexts'],0)
        del model['buckets'][floors[-1]]
        model['buckets'][pooled[-1]]={'1':100}
        sampler=Sampler(model,17)
        self.assertEqual(sampler.draw(s).kind,'kneel')
        self.assertEqual(sampler.fallbacks['half_pooled_fallback'],1)
        del model['buckets'][pooled[-1]]
        with self.assertRaises(ValueError):Sampler(model,17).draw(s)

    def test_late_budget_flags_never_drop_from_contexts(self):
        for offense,defense in ((0,0),(0,2),(1,0),(3,3)):
            s=State(period=4,clock=8,home_timeouts=offense,away_timeouts=defense)
            for key in contexts(s):
                if 'non-timeout-only' in key:
                    self.assertEqual((offense,defense),(0,0))
                else:
                    self.assertIn('oTO:'+('y' if offense else 'n'),key)
                    self.assertIn('dTO:'+('y' if defense else 'n'),key)
        normal=contexts(State(clock=500,home_timeouts=0))
        self.assertTrue(all('oTO:' not in key for key in normal))

    def test_source_budgets_map_to_actual_sides_and_missing_rejects(self):
        from research.game_sim.model import source_state
        row=dict(posteam='A',defteam='H',home_team='H',play_type='run',qtr='4',
            quarter_seconds_remaining='8',posteam_score='3',defteam_score='7',
            yardline_100='60',down='1',ydstogo='10',posteam_timeouts_remaining='0',defteam_timeouts_remaining='2')
        s=source_state(row)
        self.assertEqual((s.home_timeouts,s.away_timeouts),(2,0))
        del row['posteam_timeouts_remaining']
        with self.assertRaises(ValueError):source_state(row)

    def test_nested_windows_only_follow_missing_exact_budget_support(self):
        state=State(period=4,clock=5,home_timeouts=0,away_timeouts=0,home_score=3)
        primary,floors,fallback=context_options(state)
        window=next(k for k in fallback if 'last30window@h2' in k)
        exact=floors[-1]
        model=dict(model_id=MODEL_ID,minimum_context=30,
            templates=[dict(kind='kneel',elapsed=5,yards=-1),dict(kind='run',elapsed=5,yards=1)],
            buckets={window:{'1':100},exact:{'0':1}})
        self.assertEqual(Sampler(model,17).draw(state).kind,'kneel')
        del model['buckets'][exact]
        sampler=Sampler(model,17)
        self.assertEqual(sampler.draw(state).kind,'run')
        self.assertEqual(sampler.fallbacks['clock_window_fallback'],1)
        self.assertTrue(all('|80|' in k and ('non-timeout-only' in k or ('oTO:n' in k and 'dTO:n' in k)) for k in fallback))

    def test_zero_budget_action_pool_never_applies_with_legal_timeout(self):
        from research.game_sim.model import zero_timeout_contexts
        zero=State(period=4,clock=5,home_timeouts=0,away_timeouts=0)
        key=zero_timeout_contexts(zero)[0]
        model=dict(model_id=MODEL_ID,minimum_context=30,
            templates=[dict(kind='timeout',elapsed=0,timeout_side='offense'),dict(kind='spike',elapsed=1,yards=0)],
            buckets={key:{'0':1000,'1':1}})
        sampler=Sampler(model,17)
        self.assertEqual(sampler.draw(zero).kind,'spike')
        self.assertEqual(sampler.fallbacks['zero_budget_pooled_action_fallback'],1)
        with self.assertRaises(ValueError):Sampler(model,17).draw(State(period=4,clock=5,home_timeouts=1,away_timeouts=0))

    def test_failed_timeout_artifacts_retain_exact_runtimes(self):
        import gzip,json,hashlib
        from pathlib import Path
        root=Path(__file__).resolve().parents[2]/'research/game_sim/artifacts'
        for version in ('0.2.5','0.2.5.1','0.2.5.2'):
            folder=root/('v'+version)
            manifest=json.loads((folder/'manifest.json').read_text())
            bundle=json.loads(gzip.decompress((folder/'runtime-source.json.gz').read_bytes()))
            for name,digest in manifest['implementation_sha256'].items():
                self.assertEqual(hashlib.sha256(bundle['sources'][name].encode()).hexdigest(),digest)
            self.assertFalse(json.loads(gzip.decompress((folder/'gate.json.gz').read_bytes()))['passed'])

    def test_last300_is_q4_ot_only_and_does_not_pollute_last120_windows(self):
        from research.game_sim.model import bucket
        self.assertEqual(bucket(State(period=4,clock=200))[4],'last300')
        self.assertEqual(bucket(State(period=5,clock=200))[4],'last300')
        self.assertEqual(bucket(State(period=2,clock=200))[4],'normal')
        keys=contexts(State(period=4,clock=200))
        self.assertFalse(any('last120window' in key for key in keys))
        self.assertTrue(all('last300' in key for key in keys))

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
        folder=root/'research/game_sim/artifacts/v0.2.7'
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

import unittest,json
from research.game_sim.batch import run_batch,distribution,canonical,game
from research.game_sim.evaluate import crps
from research.game_sim.model import MODEL_ID,Sampler

def fixture():
    # Artificial unit-test inputs only. Real artifact is fitted from hashed 2022 PBP.
    templates=[dict(kind='run',elapsed=35,yards=8),dict(kind='pass_complete',elapsed=30,yards=18),dict(kind='pass_incomplete',elapsed=10,yards=0),dict(kind='extra_point',elapsed=0,made=True),dict(kind='kickoff',elapsed=5,receiver_yardline=75)]
    buckets={'scrimmage':{'0':40,'1':30,'2':30},'try':{'3':100},'kickoff':{'4':100}}
    # Synthetic support for every clock band, never an actual training artifact.
    for phase in ('scrimmage','try','kickoff'):
        for clock in ('last10','last30','last120'):
            buckets[phase+'|'+clock]=dict(buckets[phase])
    return dict(model_id=MODEL_ID,sources=[],templates=templates,buckets=buckets,minimum_context=30)
class BatchTests(unittest.TestCase):
    def test_reproducible_complete_batch_and_replay(self):
        a=run_batch(fixture(),20,42);b=run_batch(fixture(),20,42)
        for key in ('ensemble','replay','input_hash','coverage','runs'):self.assertEqual(a[key],b[key])
        self.assertEqual(a['runs']['actual'],20)
        n=20;e=a['ensemble'];self.assertEqual(sum(e[k]['count'] for k in ('home_win','away_win','tie')),n)
        for key in ('home_score','away_score','margin','total'):
            self.assertEqual(sum(x['count'] for x in e[key]['bins']),n)
            q=e[key]['quantiles'];self.assertLessEqual(q['p5'],q['p50']);self.assertLessEqual(q['p50'],q['p95'])
        self.assertEqual(a['replay']['events'][-1]['after']['phase'],'final')
    def test_artifact_reload_preserves_sampling_and_digest(self):
        model=fixture();model['buckets']['scrimmage']={'2':30,'0':40,'1':30}
        a=run_batch(model,10,42);b=run_batch(json.loads(canonical(model)),10,42)
        self.assertEqual(a['artifact_sha256'],b['artifact_sha256']);self.assertEqual(a['ensemble'],b['ensemble']);self.assertEqual(a['replay'],b['replay'])
    def test_optional_workload_does_not_change_game_paths(self):
        from test_workload import context
        a=run_batch(fixture(),5,42);b=run_batch(fixture(),5,42,workload_context=context())
        self.assertEqual(a['ensemble'],b['ensemble']);self.assertEqual(len(b['players']),6)
        self.assertTrue(all(not p['supported'] for p in b['players']))
    def test_prepared_tables_preserve_every_event(self):
        model=fixture();tables=Sampler(model,42).tables
        self.assertEqual(game(model,42,trace=True),game(model,42,trace=True,prepared_tables=tables))
    def test_crps_perfect_and_binary(self):
        self.assertEqual(crps(distribution([3,3]),3),0)
        self.assertEqual(crps(distribution([0,1]),1),.25)
    def test_reject_limits_and_nonfinite(self):
        for n in (0,50001,1.5):
            with self.assertRaises(ValueError):run_batch(fixture(),n,1)
        with self.assertRaises(ValueError):canonical({'x':float('nan')})
if __name__=='__main__':unittest.main()

import unittest
from research.game_sim.state import State, Action, transition
from research.game_sim.model import source_state

class Corrections(unittest.TestCase):
    def test_penalty_gaining_line_starts_new_series(self):
        s=State(possession='home', yardline=60, down=3, distance=2)
        n=transition(s,Action('penalty',yards=5)).after
        self.assertEqual((n.down,n.distance,n.yardline),(1,10,55))
    def test_kickoff_receiver_source_maps_to_kernel_kicker(self):
        r=dict(posteam='H',defteam='A',home_team='H',play_type='kickoff',
               qtr='1',quarter_seconds_remaining='850',posteam_score='0',defteam_score='7')
        s=source_state(r)
        self.assertEqual((s.possession,s.home_score,s.away_score),('away',0,7))
        n=transition(s,Action('kickoff',elapsed=5,receiver_yardline=75)).after
        self.assertEqual(n.possession,'home')

    def fitted_pair(self, first, following):
        import csv,tempfile
        from pathlib import Path
        from research.game_sim.model import fit
        base=dict(season='2022',season_type='REG',game_id='fixture',posteam='H',defteam='A',home_team='H',play_type='no_play',qtr='1',quarter_seconds_remaining='850',posteam_score='0',defteam_score='0',yardline_100='60',down='3',ydstogo='2',yards_gained='0',penalty='1',penalty_yards='5')
        first=dict(base,**first);following=dict(base,**following)
        fields=sorted(set(first)|set(following))
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'fixture.csv'
            with p.open('w') as f:
                w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows([first,following])
            return fit([p])

    def test_yardage_first_down_not_automatic_first_foul(self):
        model=self.fitted_pair(dict(first_down_penalty='1',penalty_yards='5'),dict(yardline_100='55',down='1',quarter_seconds_remaining='845'))
        action=model['templates'][0]
        self.assertFalse(action['automatic_first'])
        self.assertEqual(action['yards'],5)

    def test_normal_kickoff_does_not_recover_for_kicker(self):
        model=self.fitted_pair(dict(play_type='kickoff',penalty='0'),dict(down='1',yardline_100='75',quarter_seconds_remaining='845'))
        self.assertNotIn('receiving_side',model['templates'][0])

    def test_live_ball_enforcement_counted(self):
        model=self.fitted_pair(dict(play_type='pass',first_down_penalty='1',penalty_yards='5'),dict(yardline_100='55',down='1',quarter_seconds_remaining='845'))
        self.assertEqual(model['coverage']['normalized_live_ball_penalty'],1)

    def test_declined_flag_retains_run(self):
        model=self.fitted_pair(dict(play_type='run',penalty_yards='0',yards_gained='3'),dict(yardline_100='57',down='1',quarter_seconds_remaining='845'))
        self.assertEqual(model['templates'][0]['kind'],'run')
        self.assertEqual(model['coverage']['flag_not_enforced_ordinary'],1)

    def test_survival_counts_only_eligible_origins(self):
        from research.game_sim.model import survival_table
        curve=survival_table([(2,2,True),(10,8,False),(10,1,False)])
        self.assertEqual(curve['support'][5],dict(eligible=2,successes=1))
        self.assertNotIn('2',curve['uncensored'])
        known=[v for v in curve['survival'][1:] if v is not None]
        self.assertEqual(known,sorted(known,reverse=True))

    def test_censored_replay_samples_tail_without_always_scoring(self):
        from research.game_sim.model import MODEL_ID,Sampler
        # Synthetic unit fixture, never a production source or odds input.
        model=dict(model_id=MODEL_ID,templates=[dict(kind='run',elapsed=5,yards=2,td_from=2)],buckets={'scrimmage':{'0':100}},minimum_context=30,
            censoring={'run':dict(survival=[None,1,.8,.7,.5,.4]+[None]*94,uncensored={'3':5})})
        state=State(possession='home',yardline=5,down=1,distance=5)
        a=Sampler(model,1701);b=Sampler(model,1701)
        draws=[a.draw(state).yards for _ in range(1000)]
        self.assertEqual(draws,[b.draw(state).yards for _ in range(1000)])
        self.assertEqual(set(draws),{3,5})
        self.assertTrue(400<draws.count(5)<600)
        self.assertEqual(a.fallbacks.get('unsupported_censoring',0),0)
        near=State(possession='home',yardline=1,down=1,distance=1)
        self.assertEqual(Sampler(model,1).draw(near).yards,1)

    def test_missing_survival_support_is_counted_not_invented(self):
        from research.game_sim.model import MODEL_ID,Sampler
        model=dict(model_id=MODEL_ID,templates=[dict(kind='run',elapsed=5,yards=2,td_from=2)],buckets={'scrimmage':{'0':100}},minimum_context=30)
        sampler=Sampler(model,1)
        self.assertEqual(sampler.draw(State(yardline=5,down=1,distance=5)).yards,2)
        self.assertEqual(sampler.fallbacks['unsupported_censoring'],1)

    def test_016_artifact_integrity_and_failed_gate(self):
        import gzip,hashlib,json
        from pathlib import Path
        root=Path(__file__).resolve().parents[2]
        artifact=root/'research/game_sim/artifacts/v0.1.6'
        b=(artifact/'model.json.gz').read_bytes()
        manifest=json.loads((artifact/'manifest.json').read_text())
        self.assertEqual(hashlib.sha256(b).hexdigest(),manifest['compressed_sha256'])
        self.assertEqual(hashlib.sha256(gzip.decompress(b)).hexdigest(),manifest['artifact_sha256'])
        gate=json.loads((root/manifest['gate_path']).read_text())
        self.assertEqual(gate['model_sha256'],manifest['artifact_sha256'])
        self.assertFalse(gate['passed'])
        self.assertFalse(manifest['approval'])

    def test_timeout_source_uses_exact_clock_following_state(self):
        model=self.fitted_pair(dict(timeout='1',timeout_team='H',posteam='',defteam='',down='',yardline_100='',penalty='0'),dict(quarter_seconds_remaining='850',down='1',yardline_100='75',penalty='0'))
        self.assertEqual(model['templates'][0],dict(kind='timeout',elapsed=0,timeout_side='offense'))

    def test_timeout_budget_respected_by_sampler(self):
        from research.game_sim.model import MODEL_ID,Sampler
        model=dict(model_id=MODEL_ID,templates=[dict(kind='timeout',elapsed=0,timeout_side='offense'),dict(kind='run',elapsed=5,yards=1)],buckets={'scrimmage':{'0':1000,'1':1}},minimum_context=30)
        s=State(possession='home',yardline=50,down=1,distance=10,home_timeouts=0)
        sampler=Sampler(model,17)
        self.assertTrue(all(sampler.draw(s).kind=='run' for _ in range(100)))
        available=State(possession='home',yardline=50,down=1,distance=10,home_timeouts=1)
        a=Sampler(model,17).draw(available)
        self.assertEqual(a.timeout_side,'home')
        self.assertEqual(transition(available,a).after.home_timeouts,0)

    def test_half_ending_clock_buckets(self):
        from research.game_sim.model import bucket
        self.assertEqual([bucket(State(period=2,clock=t))[4] for t in (10,11,30,31,120,121)],['last10','last30','last30','last120','last120','normal'])
        self.assertEqual(bucket(State(period=1,clock=5))[4],'normal')

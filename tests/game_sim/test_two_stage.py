import copy
import unittest
from research.game_sim.model import Sampler,timeout_contexts,MODEL_ID,contexts
from research.game_sim.state import State
from research.game_sim.batch import game
from test_batch import fixture
import test_corrections

class TwoStageTimeoutTests(unittest.TestCase):
    def fitted_compound(self,**updates):
        first=dict(play_type='pass',penalty='0',timeout='1',timeout_team='H',home_timeouts_remaining='1',posteam_timeouts_remaining='1',complete_pass='1',yards_gained='5',qtr='2',quarter_seconds_remaining='110')
        first.update(updates)
        return test_corrections.Corrections().fitted_pair(first,dict(play_type='run',penalty='0',qtr='2',quarter_seconds_remaining='90',yardline_100='55',down='1',ydstogo='10'))

    def test_compound_counts_snap_and_timeout_opportunities_once(self):
        m=self.fitted_compound();coverage=m['timeout_model']['coverage']
        self.assertEqual(coverage['snap_opportunities'],1)
        self.assertEqual(coverage['timeout_opportunities'],1)
        self.assertEqual(m['timeout_model']['tables']['last120@h1|offense'],dict(opportunities=2,timeouts=1))
        self.assertEqual(m['timeout_model']['tables']['last120@h1|defense'],dict(opportunities=2,timeouts=0))
        self.assertTrue(all(m['templates'][int(i)]['kind']!='timeout' for entries in m['buckets'].values() for i in entries))

    def test_exhausted_source_role_excluded_from_denominator(self):
        m=self.fitted_compound(defteam_timeouts_remaining='0',away_timeouts_remaining='0')
        self.assertNotIn('last120@h1|defense',m['timeout_model']['tables'])
        self.assertEqual(m['timeout_model']['tables']['last120@h1|offense']['opportunities'],2)

    def test_minimum_support_backoff_and_no_borrowing_wrong_band(self):
        s=State(period=4,clock=80);keys=timeout_contexts(s,'offense')
        m=fixture();m['timeout_model']=dict(minimum_context=30,tables={keys[0]:dict(opportunities=29,timeouts=29),keys[-1]:dict(opportunities=100,timeouts=10)})
        self.assertEqual(Sampler(m,17).timeout_probability(s,'offense'),.1)
        m['timeout_model']['tables'][keys[-1]]['opportunities']=29
        with self.assertRaises(ValueError):Sampler(m,17).timeout_probability(s,'offense')
        m['timeout_model']['tables']={'normal@q1|offense':dict(opportunities=100,timeouts=10)}
        with self.assertRaises(ValueError):Sampler(m,17).timeout_probability(s,'offense')

    def test_invalid_empirical_probability_rejects(self):
        s=State();m=fixture();m['timeout_model']=dict(minimum_context=30,tables={timeout_contexts(s,'offense')[0]:dict(opportunities=30,timeouts=31)})
        with self.assertRaises(ValueError):Sampler(m,17).timeout_probability(s,'offense')

    def test_frozen_play_keys_match_v024_geometry(self):
        self.assertEqual(contexts(State(period=4,clock=8,home_score=7,yardline=75))[0],'scrimmage|last10@h2|80|ahead4-8|1|7-10')
        self.assertTrue(timeout_contexts(State(period=1,clock=8),'defense')[-1].startswith('normal@q1'))

    def test_separate_model_replay_same_with_prepared_play_tables(self):
        m=fixture();tables={}
        for q in range(1,5):
            for clock in (5,20,90,200,700):
                for role in ('offense','defense'):
                    tables[timeout_contexts(State(period=q,clock=clock),role)[-1]]=dict(opportunities=100,timeouts=3)
        m['timeout_model']=dict(minimum_context=30,tables=tables)
        self.assertEqual(game(m,17,trace=True),game(copy.deepcopy(m),17,trace=True,prepared_tables=Sampler(m,17).tables))

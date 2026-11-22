import copy
import unittest
from research.game_sim.model import Sampler,timeout_contexts,MODEL_ID,contexts
from research.game_sim.state import State
from research.game_sim.batch import game
from test_batch import fixture
from cells_helper import cell_model,floor
import test_corrections

class TwoStageTimeoutTests(unittest.TestCase):
    def fitted_compound(self,**updates):
        first=dict(play_type='pass',penalty='0',timeout='1',timeout_team='H',home_timeouts_remaining='1',posteam_timeouts_remaining='1',complete_pass='1',yards_gained='5',qtr='2',quarter_seconds_remaining='110')
        first.update(updates)
        return test_corrections.Corrections().fitted_pair(first,dict(play_type='run',penalty='0',qtr='2',quarter_seconds_remaining='90',yardline_100='55',down='1',ydstogo='10'))

    def test_compound_counts_snap_and_timeout_opportunities_once(self):
        # v0.2.20: the compound play is one RUNNING opportunity with an offense call; its timeout
        # row is not counted again as a stopped opportunity; its own snap is a stopped opportunity.
        m=self.fitted_compound();tm=m['timeout_model'];coverage=tm['coverage']
        self.assertEqual(coverage['running_calls:offense'],1)
        self.assertEqual(coverage['stopped_skipped:running_timeout'],1)
        self.assertEqual(tm['running']['last120@h1|both'],dict(n=1,offense=1,defense=0))
        self.assertEqual(tm['stopped']['last120@h1|both'],dict(n=1,offense=0,defense=0))
        self.assertTrue(all(m['templates'][int(i)]['kind']!='timeout' for entries in m['buckets'].values() for i in entries))

    def test_exhausted_source_role_excluded_from_denominator(self):
        # Defense without a timeout: the opportunity sits in the offense-only eligibility cell.
        m=self.fitted_compound(defteam_timeouts_remaining='0',away_timeouts_remaining='0')
        self.assertNotIn('last120@h1|both',m['timeout_model']['running'])
        self.assertEqual(m['timeout_model']['running']['last120@h1|offense']['n'],1)

    def test_minimum_support_backoff_and_no_borrowing_wrong_band(self):
        s=State(period=4,clock=80);band_keys=__import__('research.game_sim.timeout_cells',fromlist=['chain']).chain('stopped','last120@h2',s,'both')
        m=fixture();m['timeout_model']=cell_model([]);m['timeout_model']['stopped']={band_keys[0]:dict(n=29,offense=29,defense=0),band_keys[3]:dict(n=100,offense=10,defense=0)}
        self.assertEqual(Sampler(m,17).timeout_rates(s,'stopped'),(.1,0.0))
        m['timeout_model']['stopped'][band_keys[3]]['n']=29
        with self.assertRaises(ValueError):Sampler(m,17).timeout_rates(s,'stopped')
        m['timeout_model']['stopped']={'normal@q1|both':dict(n=100,offense=10,defense=0)}
        with self.assertRaises(ValueError):Sampler(m,17).timeout_rates(s,'stopped')

    def test_invalid_empirical_probability_rejects(self):
        s=State();m=fixture();m['timeout_model']=cell_model([s],stopped=(30,20,11))
        with self.assertRaises(ValueError):Sampler(m,17).timeout_rates(s,'stopped')

    def test_frozen_play_keys_match_v024_geometry(self):
        self.assertEqual(contexts(State(period=4,clock=8,home_score=7,yardline=75))[0],'scrimmage|last10@h2|80|ahead4-8|1|7-10')
        self.assertTrue(timeout_contexts(State(period=1,clock=8),'defense')[-1].startswith('normal@q1'))

    def test_separate_model_replay_same_with_prepared_play_tables(self):
        m=fixture()
        states=[State(period=q,clock=clock,home_timeouts=h,away_timeouts=a) for q in range(1,5) for clock in (5,20,90,200,700) for h in range(4) for a in range(4)]
        m['timeout_model']=cell_model(states,running=(100,3,3),stopped=(100,3,3))
        self.assertEqual(game(m,17,trace=True),game(copy.deepcopy(m),17,trace=True,prepared_tables=Sampler(m,17).tables))

    def test_competing_call_rates_not_deflated_by_offense_priority(self):
        s=State(period=4,clock=80);m=fixture();m['timeout_model']=cell_model([s],stopped=(100,25,25))
        sampler=Sampler(m,1701);counts=dict(home=0,away=0,none=0)
        for _ in range(10000):
            a=sampler.timeout_decision(s);counts[a.timeout_side if a else 'none']+=1
        self.assertTrue(2300<counts['home']<2700)
        self.assertTrue(2300<counts['away']<2700)
        # One categorical count can never yield p_off + p_def > 1; impossible counts are rejected.
        m['timeout_model']=cell_model([s],stopped=(100,60,60))
        with self.assertRaisesRegex(ValueError,'invalid timeout counts'):Sampler(m,17).timeout_decision(s)

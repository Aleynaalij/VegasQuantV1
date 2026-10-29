import unittest
from dataclasses import replace
from research.game_sim.model import Sampler,stop_contexts,timeout_contexts
from research.game_sim.state import State,Action,transition
from test_batch import fixture

class StopClockTests(unittest.TestCase):
    def model(self,s,kind='run',prob=1,durations=None):
        m=fixture();m['stop_clock']=dict(minimum_context=30,tables={stop_contexts(s,kind)[-1]:durations or {'6':40}})
        # Constant source-backed test probabilities; synthetic unit fixture only.
        m['timeout_model']=dict(minimum_context=30,tables={})
        for clock in (5,20,90,200):
            for role in ('offense','defense'):
                for key in timeout_contexts(replace(s,clock=clock),role):m['timeout_model']['tables'][key]=dict(opportunities=40,timeouts=int(40*prob) if role=='offense' else 0)
        return m
    def test_stopped_gap_committed_before_timeout_no_clock_refund(self):
        s=State(period=4,clock=100);a=Action('run',elapsed=35,yards=4)
        sampler=Sampler(self.model(s),17);play,queued,cached=sampler.couple_stop(s,a)
        self.assertEqual(play.elapsed,6);self.assertEqual(queued.kind,'timeout')
        after=transition(s,play).after;self.assertEqual(after,cached);self.assertEqual(after.clock,94)
        stopped=transition(after,queued).after
        self.assertEqual(stopped.clock,94);self.assertEqual(stopped.home_timeouts,2)
        self.assertEqual((stopped.yardline,stopped.down),(71,2))
    def test_negative_decision_uses_original_clock_and_exact_cache_state(self):
        s=State(period=2,clock=100);a=Action('run',elapsed=35,yards=4)
        play,queued,cached=Sampler(self.model(s,prob=0),17).couple_stop(s,a)
        self.assertEqual(play,a);self.assertIsNone(queued);self.assertEqual(cached,transition(s,a).after)
        self.assertNotEqual(cached,replace(cached,period=3))
    def test_never_borrows_earlier_band_or_half(self):
        s=State(period=4,clock=8);m=self.model(s);m['stop_clock']['tables']={'last120@h1|run':{'1':100}}
        sampler=Sampler(m,17);a=Action('run',elapsed=5,yards=1)
        self.assertEqual(sampler.couple_stop(s,a),(a,None,None));self.assertEqual(sampler.fallbacks['missing_eligible_stop_duration'],1)
    def test_never_adds_elapsed_or_schedules_after_expiry(self):
        s=State(period=4,clock=8);m=self.model(s,durations={'9':40});a=Action('run',elapsed=5,yards=1)
        self.assertEqual(Sampler(m,17).couple_stop(s,a),(a,None,None))
    def test_no_coupling_for_touchdown_turnover_or_exhausted_budgets(self):
        s=State(period=4,clock=100,yardline=5,distance=5)
        a=Action('run',elapsed=35,yards=5);self.assertEqual(Sampler(self.model(s),17).couple_stop(s,a),(a,None,None))
        s=State(period=4,clock=100,down=4,distance=10);a=Action('run',elapsed=35,yards=1)
        self.assertEqual(Sampler(self.model(s),17).couple_stop(s,a),(a,None,None))
        s=State(period=4,clock=100,home_timeouts=0,away_timeouts=0)
        self.assertEqual(Sampler(self.model(s),17).couple_stop(s,a),(a,None,None))
    def test_cache_skips_only_requested_preplay_decision(self):
        s=State(period=4,clock=100);m=self.model(s);sampler=Sampler(m,17)
        self.assertNotEqual(sampler.draw(s,allow_timeout=False).kind,'timeout')
        self.assertEqual(sampler.draw(s).kind,'timeout')

    def test_numeric_duration_order_survives_canonical_json_reload(self):
        import json
        from research.game_sim.batch import canonical
        s=State(period=4,clock=100);a=Action('run',elapsed=35,yards=4)
        m=self.model(s,durations={'9':40,'10':40,'2':40})
        loaded=json.loads(canonical(m))
        for seed in (17,1701,1702,1703,42):
            self.assertEqual(Sampler(m,seed).couple_stop(s,a),Sampler(loaded,seed).couple_stop(s,a))

    def test_source_stopped_no_call_uses_nonfollowed_gap_and_actual_cache(self):
        s=State(period=4,clock=100);a=Action('run',elapsed=9,yards=4)
        m=self.model(s,prob=0,durations={'6':40})
        m['stop_clock']['runoff_tables']={stop_contexts(s,'run')[-1]:{'35':40}}
        sampler=Sampler(m,17);sampler.last_source_followed_timeout=True
        play,queued,cached=sampler.couple_stop(s,a)
        self.assertEqual(play.elapsed,35);self.assertIsNone(queued)
        self.assertEqual(cached,transition(s,play).after);self.assertEqual(cached.clock,65)
        self.assertEqual(sampler.fallbacks['source_stop_runoff_replaced'],1)

    def test_source_stopped_no_budgets_also_replaces_gap(self):
        s=State(period=4,clock=12,home_timeouts=0,away_timeouts=0);a=Action('run',elapsed=4,yards=1)
        m=self.model(s);m['stop_clock']['runoff_tables']={stop_contexts(s,'run')[-1]:{'35':40}}
        sampler=Sampler(m,17);sampler.last_source_followed_timeout=True
        play,queued,_=sampler.couple_stop(s,a)
        self.assertEqual(play.elapsed,12);self.assertIsNone(queued)
        self.assertEqual(transition(s,play).after.clock,0)

    def test_source_stopped_no_call_without_runoff_support_rejects(self):
        s=State(period=4,clock=100,home_timeouts=0,away_timeouts=0)
        sampler=Sampler(self.model(s),17);sampler.last_source_followed_timeout=True
        with self.assertRaisesRegex(ValueError,'non-followed runoff'):sampler.couple_stop(s,Action('run',elapsed=9,yards=1))

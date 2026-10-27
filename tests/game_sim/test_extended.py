import unittest
from dataclasses import replace
from research.game_sim.state import State,Action,transition
class ExtendedTests(unittest.TestCase):
    def ot(self,both=True):
        s=State(period=4,clock=0,phase='overtime_required',down=None,distance=None,ot_both_possessions=both)
        s=transition(s,Action('start_overtime',receiving_side='home')).after
        return transition(s,Action('kickoff',receiver_yardline=75)).after
    def td(self,s):return transition(replace(s,yardline=1,down=1,distance=1),Action('run',5,1)).after
    def kick(self,s):return transition(s,Action('kickoff',receiver_yardline=75)).after
    def test_new_overtime_both_td_and_conversion(self):
        s=self.td(self.ot());self.assertEqual(s.phase,'try')
        s=transition(s,Action('extra_point',made=True)).after
        s=self.td(self.kick(s));self.assertEqual(s.phase,'try')
        s=transition(s,Action('two_point',made=True)).after
        self.assertEqual((s.phase,s.home_score,s.away_score),('final',7,8))
    def test_overtime_kick_return_td_counts_receiving_possession(self):
        for both in (False,True):
            s=State(period=4,clock=0,phase='overtime_required',down=None,distance=None,ot_both_possessions=both)
            s=transition(s,Action('start_overtime',receiving_side='away')).after
            s=transition(s,Action('kick_return_touchdown',10)).after
            self.assertEqual(s.ot_completed,('away',));self.assertEqual(s.phase,'try' if both else 'final')
    def test_old_overtime_opening_td(self):self.assertEqual(self.td(self.ot(False)).phase,'final')
    def test_overtime_opening_fg_not_final(self):
        s=transition(replace(self.ot(),yardline=20),Action('field_goal',4,made=True)).after
        self.assertEqual(s.phase,'kickoff');s=self.td(self.kick(s));self.assertEqual(s.phase,'final')
    def test_overtime_safety_and_clock_expiry(self):
        s=transition(replace(self.ot(),yardline=99),Action('sack',4,-1)).after
        self.assertEqual((s.phase,s.away_score),('final',2))
        s=transition(replace(self.ot(),clock=1),Action('run',1,0)).after
        self.assertEqual((s.phase,s.home_score,s.away_score),('final',0,0))
    def test_penalty_half_distance_auto_first_loss_down(self):
        s=transition(State(yardline=95),Action('penalty',yards=-10)).after
        self.assertEqual((s.yardline,s.down,s.distance),(97,1,12))
        s=transition(State(down=3,distance=5,yardline=8),Action('penalty',yards=10,automatic_first=True)).after
        self.assertEqual((s.yardline,s.down,s.distance),(4,1,4))
        s=transition(State(down=4,distance=5),Action('penalty',yards=-5,loss_of_down=True)).after
        self.assertEqual((s.possession,s.yardline),('away',20))
    def test_defensive_return_and_recovered_fumble(self):
        s=transition(State(),Action('defensive_touchdown',8)).after
        self.assertEqual((s.away_score,s.possession,s.phase),(6,'away','try'))
        s=transition(State(yardline=50),Action('fumble_recovered',20,12)).after
        self.assertEqual((s.possession,s.yardline,s.down),('home',38,1))
    def test_kick_return_onside_and_blocked_kick(self):
        s=State(phase='kickoff',down=None,distance=None)
        self.assertEqual(transition(s,Action('kick_return_touchdown',10)).after.away_score,6)
        s=transition(s,Action('kickoff',5,receiver_yardline=50,receiving_side='home')).after
        self.assertEqual(s.possession,'home')
        s=transition(s,Action('blocked_field_goal',5,spot=60,receiving_side='home')).after
        self.assertEqual((s.possession,s.yardline),('home',60))
    def test_timeout_budget_and_half_reset(self):
        s=State()
        for _ in range(3):s=transition(s,Action('timeout',timeout_side='home')).after
        with self.assertRaises(ValueError):transition(s,Action('timeout',timeout_side='home'))
        s=transition(replace(s,period=2,clock=0),Action('end_period')).after
        self.assertEqual(s.home_timeouts,3)
if __name__=='__main__':unittest.main()

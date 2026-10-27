import unittest
from dataclasses import replace
from research.game_sim.state import State,Action,transition

class StateTests(unittest.TestCase):
    def test_first_down_and_goal_to_go(self):
        s=State(yardline=15);s=transition(s,Action('run',25,8)).after
        self.assertEqual((s.down,s.distance,s.yardline),(2,2,7))
        s=transition(s,Action('pass_complete',20,3)).after
        self.assertEqual((s.down,s.distance,s.yardline),(1,4,4))
    def test_touchdown_conversion_kickoff(self):
        s=State(yardline=5,distance=5)
        s=transition(s,Action('run',8,5)).after
        self.assertEqual((s.home_score,s.phase),(6,'try'))
        s=transition(s,Action('extra_point',made=True)).after
        self.assertEqual((s.home_score,s.phase),(7,'kickoff'))
        s=transition(s,Action('kickoff',5,receiver_yardline=75)).after
        self.assertEqual((s.possession,s.yardline,s.down),('away',75,1))
    def test_fourth_down_flip_and_safety(self):
        s=transition(State(down=4,distance=5,yardline=50),Action('run',20,2)).after
        self.assertEqual((s.possession,s.yardline),('away',52))
        s=transition(State(yardline=98),Action('sack',6,-2)).after
        self.assertEqual((s.away_score,s.phase),(2,'safety_kick'))
    def test_halftime_resets_possession_not_score(self):
        s=State(period=2,clock=0,home_score=10,away_score=7)
        n=transition(s,Action('end_period')).after
        self.assertEqual((n.period,n.clock,n.home_score,n.phase,n.possession),(3,900,10,'kickoff','home'))
        n=transition(n,Action('kickoff',5,receiver_yardline=70)).after
        self.assertEqual(n.possession,'away')
    def test_quarter_retains_down_and_spot(self):
        n=transition(State(clock=0,down=3,distance=8),Action('end_period')).after
        self.assertEqual((n.period,n.down,n.distance,n.yardline),(2,3,8,75))
    def test_missed_field_goal_spot(self):
        n=transition(State(yardline=30),Action('field_goal',5,made=False)).after
        self.assertEqual((n.possession,n.yardline),('away',63))
        n=transition(State(yardline=10),Action('field_goal',5,made=False)).after
        self.assertEqual(n.yardline,80)
    def test_turnover_and_punt_touchback(self):
        for kind in ('interception','fumble_lost','punt'):
            self.assertEqual(transition(State(),Action(kind,8,spot=0)).after.yardline,80)
            self.assertEqual(transition(State(),Action(kind,8,spot=40)).after.yardline,60)
    def test_final_and_unimplemented_overtime(self):
        n=transition(State(period=4,clock=2,home_score=7),Action('kneel',2,-1)).after
        self.assertEqual(n.phase,'final')
        n=transition(State(period=4,clock=2),Action('kneel',2,-1)).after
        self.assertEqual(n.phase,'overtime_required')
        with self.assertRaises(ValueError):transition(n,Action('run',0,1))
    def test_expiring_touchdown_allows_conversion(self):
        n=transition(State(period=4,clock=1,yardline=1,distance=1,away_score=7),Action('run',1,1)).after
        self.assertEqual(n.phase,'try')
        n=transition(n,Action('extra_point',made=True)).after
        self.assertEqual(n.phase,'overtime_required')
    def test_reject_bad_states_actions(self):
        for kw in ({'clock':901},{'down':5},{'yardline':0},{'distance':76},{'home_score':-1}):
            with self.subTest(kw=kw),self.assertRaises(ValueError):State(**kw)
        for a in (Action('run',901,1),Action('run',0,1),Action('pass_incomplete',1,5),Action('sack',1,1),Action('penalty',1),Action('run',1,76)):
            with self.subTest(a=a),self.assertRaises(ValueError):transition(State(),a)
    def test_long_script_score_conservation(self):
        s=State();events=[]
        for _ in range(4):
            # one TD drive per quarter; then run out clock, explicitly transitioning periods
            while s.phase=='scrimmage':
                e=transition(s,Action('pass_complete',20, min(25,s.yardline)));events.append(e);s=e.after
            for a in (Action('extra_point',made=True),Action('kickoff',5,receiver_yardline=75)):
                e=transition(s,a);events.append(e);s=e.after
            while s.clock>0:
                e=transition(s,Action('run',min(40,s.clock),0));events.append(e);s=e.after
            if s.phase not in ('final','overtime_required'):
                e=transition(s,Action('end_period'));events.append(e);s=e.after
                if s.phase=='kickoff':s=transition(s,Action('kickoff',0,receiver_yardline=75)).after
        self.assertIn(s.phase,('final','overtime_required'))
        self.assertEqual(s.home_score+s.away_score,28)
        for e in events:self.assertGreaterEqual(e.after.home_score,e.before.home_score)

if __name__=='__main__':unittest.main()

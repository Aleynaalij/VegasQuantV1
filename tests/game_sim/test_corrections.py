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
        base=dict(season='2022',season_type='REG',game_id='fixture',posteam='H',defteam='A',home_team='H',play_type='no_play',qtr='1',quarter_seconds_remaining='850',posteam_score='0',defteam_score='0',yardline_100='60',down='3',ydstogo='2',yards_gained='0',penalty='1')
        first=dict(base,**first);following=dict(base,**following)
        fields=sorted(set(first)|set(following))
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'fixture.csv'
            with p.open('w') as f:
                w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows([first,following])
            return fit([p])

    def test_yardage_first_down_not_automatic_first_foul(self):
        model=self.fitted_pair(dict(first_down_penalty='1'),dict(yardline_100='55',down='1',quarter_seconds_remaining='845'))
        action=model['templates'][0]
        self.assertFalse(action['automatic_first'])
        self.assertEqual(action['yards'],5)

    def test_normal_kickoff_does_not_recover_for_kicker(self):
        model=self.fitted_pair(dict(play_type='kickoff',penalty='0'),dict(down='1',yardline_100='75',quarter_seconds_remaining='845'))
        self.assertNotIn('receiving_side',model['templates'][0])

    def test_live_ball_enforcement_counted(self):
        model=self.fitted_pair(dict(play_type='pass',first_down_penalty='1'),dict(yardline_100='55',down='1',quarter_seconds_remaining='845'))
        self.assertEqual(model['coverage']['normalized_live_ball_penalty'],1)

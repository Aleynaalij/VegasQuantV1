import csv,tempfile,unittest
from pathlib import Path
from research.game_sim.integrated import source_metrics
class SourceStopMetricTests(unittest.TestCase):
    def test_administrative_timeout_without_possession_still_counts_stopped_play(self):
        base=dict(game_id='fixture',season_type='REG',home_team='H',away_team='A',posteam='H',defteam='A',home_score='7',away_score='3',posteam_score='7',defteam_score='3',play_type='run',qtr='4',quarter_seconds_remaining='90',yardline_100='60',down='1',ydstogo='10',posteam_timeouts_remaining='2',defteam_timeouts_remaining='2',desc='run')
        rows=[base,dict(base,play_type='no_play',timeout='1',quarter_seconds_remaining='85',posteam='',down='',desc='Timeout'),dict(base,play_type='pass',quarter_seconds_remaining='85',down='2',ydstogo='6',yardline_100='56',desc='pass incomplete'),dict(base,play_type='no_play',quarter_seconds_remaining='0',posteam='',down='',desc='END GAME')]
        keys=sorted(set().union(*(r.keys() for r in rows)))
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'source.csv'
            with p.open('w') as f:
                w=csv.DictWriter(f,fieldnames=keys);w.writeheader();w.writerows(rows)
            games,_,_=source_metrics(p)
        self.assertEqual(games['fixture']['late_timeout_followed_plays'],1)

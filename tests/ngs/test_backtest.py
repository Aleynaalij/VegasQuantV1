"""Synthetic rule/leakage tests; no historical holdout evaluation."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).parents[2]
spec = importlib.util.spec_from_file_location('backtest', ROOT/'research/ngs/backtest.py')
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)


def weekly(week, **changes):
    r = dict(season='2023', week=str(week), season_type='REG', player_id='00-0000001',
             player_display_name='Test Player', position='WR', team='WSH', opponent_team='NYG',
             game_id=f'2023_{week}_NYG_WAS', rushing_yards='31', receiving_yards='51',
             passing_yards='201', receptions='5')
    r.update(changes)
    return r


def ngs(week, **changes):
    r = dict(season='2023', week=str(week), season_type='REG', player_gsis_id='00-0000001',
             player_display_name='Test Player', team_abbr='WAS', targets='10', receptions='5',
             rush_attempts='10', attempts='20', avg_separation='1', catch_percentage='20',
             avg_yac_above_expectation='9', rush_yards_over_expected_per_att='-4',
             percent_attempts_gte_eight_defenders='90', completion_percentage_above_expectation='-9')
    r.update(changes)
    return r


class BacktestTest(unittest.TestCase):
    def test_r1_highest_strict_median_and_four_clears(self):
        self.assertEqual(b.highest_target([50]*5,'receiving_yards'),45)
        self.assertEqual(b.highest_target([0,51,51,51,51],'receiving_yards'),50)
        self.assertIsNone(b.highest_target([0,0,51,51,51],'receiving_yards'))
        self.assertIsNone(b.highest_target([51]*4,'receiving_yards'))
        self.assertEqual(b.highest_target([201]*5,'passing_yards'),200)
        self.assertEqual(b.highest_target([5]*5,'receptions'),4)
        self.assertIsNone(b.highest_target([3]*5,'receptions'))

    def test_form_cutoff_te_prior_position_and_outcome_equality(self):
        rows=[weekly(w,position='TE') for w in range(1,7)]
        rows[-1].update(position='WR',receptions='4')
        out=b.build_dataset(rows,{})
        self.assertEqual(len(out),1)
        self.assertEqual(out[0]['statistic'],'receptions')
        self.assertEqual(out[0]['target'],4)
        self.assertEqual(out[0]['cleared'],1)
        self.assertEqual(out[0]['F1'],'')
        self.assertEqual(out[0]['ngs_status'],'missing')
        changed=copy.deepcopy(rows);changed[-1]['receptions']='99'
        second=b.build_dataset(changed,{})[0]
        for k in ('target','form_values','ngs_metrics','F1','F2'):
            self.assertEqual(out[0][k],second[k])

    def test_future_games_and_ngs_cannot_change_prior_features(self):
        history=[weekly(w) for w in range(1,7)]
        prior=b.build_dataset(history,{'receiving':[ngs(5)]})
        extended=b.build_dataset(history+[weekly(7,receiving_yards='9999')],
            {'receiving':[ngs(5),ngs(6,avg_separation='9999'),ngs(7,avg_separation='-9999')]})
        self.assertEqual(prior,[r for r in extended if r['week']==6])

    def test_cross_season_form_and_missing_game_not_zero(self):
        rows=[weekly(w,season='2022') for w in (14,15,16,17,18)]+[weekly(2)]
        out=b.build_dataset(rows,{})
        self.assertEqual(len(out),4)
        self.assertEqual(json.loads(out[0]['form_games']),[[2022,w] for w in (14,15,16,17,18)])
        self.assertEqual(json.loads(out[0]['ngs_weeks']),[])

    def test_calendar_cutoff_and_full_prior_league_quartiles(self):
        rows=[ngs(1,avg_separation='100'),ngs(3,avg_separation='2'),
              ngs(5,avg_separation='4'),ngs(6,avg_separation='999'),
              ngs(0,avg_separation='-999'),ngs(2,season_type='POST',avg_separation='-999')]
        flags,weeks,e=b.NgsIndex({'receiving':rows}).context(weekly(6),'receiving_yards')
        self.assertEqual(weeks,[3,5])
        self.assertEqual(e['avg_separation']['player'],3)
        self.assertEqual(e['avg_separation']['p25'],3)
        self.assertEqual(flags['F1'],0) # strict, no equality flag
        rows[-3]['avg_separation']='-9999'
        self.assertEqual(b.NgsIndex({'receiving':rows}).context(weekly(6),'receiving_yards')[2],e)

    def test_weighted_rates_and_missing_values(self):
        rows=[ngs(4,targets='1',avg_separation='1'),ngs(5,targets='9',avg_separation='5')]
        self.assertAlmostEqual(b.weighted(rows,'avg_separation'),4.6)
        self.assertIsNone(b.weighted([ngs(4,targets='0')],'avg_separation'))
        flags,_,_=b.NgsIndex({}).context(weekly(6),'rushing_yards')
        self.assertEqual(flags,{'F4':None,'F5':None})

    def test_all_six_flags_match_typescript_reference(self):
        rows=[ngs(4),ngs(5)]+[ngs(w,player_gsis_id=f'00-{i:07d}',player_display_name=f'Peer {i}',
            avg_separation='4',catch_percentage='80',avg_yac_above_expectation='0',
            rush_yards_over_expected_per_att='1',percent_attempts_gte_eight_defenders='10',
            completion_percentage_above_expectation='2') for i,w in enumerate([1,2,3,4,5,5,5,5],2)]
        families={family:rows for family in ('passing','rushing','receiving')}
        for metric in b.METRICS:
            with self.subTest(metric=metric):
                flags,_,e=b.NgsIndex(families).context(weekly(6),metric)
                payload=dict(leg=dict(player='Test Player',metric=metric,game=dict(season=2023,week=6,
                    away_abbreviation='WSH',home_abbreviation='NYG')),snapshots=[dict(stat_type=f,rows=rows,
                    source_sha256='a'*64,retrieved_at='2026-10-22T00:00:00Z') for f in families])
                script="import mod from './scripts/research-board/ngs.ts'; const {ngsContext}=mod; let s=''; for await(const c of process.stdin)s+=c; const p=JSON.parse(s); console.log(JSON.stringify(ngsContext(p.leg,p.snapshots)));"
                result=subprocess.run(['node','--import','tsx','--input-type=module','-e',script],cwd=ROOT,
                    input=json.dumps(payload),text=True,capture_output=True,check=True)
                ts=json.loads(result.stdout)
                self.assertEqual(sum(flags.values()),len(ts['risks']))
                self.assertTrue(all(v==1 for v in flags.values()))
                for key,val in e.items():
                    self.assertAlmostEqual(ts['evidence']['metrics'][key]['player'],val['player'],places=2)

    def test_identity_schema_cache_and_output_provenance(self):
        with self.assertRaises(ValueError): b.normalize_weekly([weekly(1),weekly(1)],2023)
        with self.assertRaises(ValueError): b.normalize_weekly([weekly(1,player_id='bad')],2023)
        with self.assertRaises(ValueError): b.csv_rows(b'wrong\n1\n','x.csv',['season'])
        with tempfile.TemporaryDirectory() as tmp:
            cache=Path(tmp);(cache/'x').write_bytes(b'bad')
            with self.assertRaises(ValueError):b.source(cache,'stats_player','x',{})
            rows=b.build_dataset([weekly(w) for w in range(1,7)],{})
            first=b.write_output(cache/'out',rows,{})
            second=b.write_output(cache/'again',rows,{})
            self.assertEqual(first['csv_sha256'],second['csv_sha256'])
            meta=json.loads((cache/'out.json').read_text())
            self.assertFalse(meta['holdout_decision_computed'])
            self.assertFalse(meta['point_in_time_publication_vintages_verified'])
            self.assertTrue(all('cleared' not in v for v in meta['flag_counts'].values()))

if __name__=='__main__':unittest.main()

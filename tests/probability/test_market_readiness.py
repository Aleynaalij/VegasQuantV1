import sys
from pathlib import Path
import unittest
import pandas as pd
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/"research"/"probability"))
from market_readiness import readiness
class ReadinessTests(unittest.TestCase):
    def rows(self):
        return pd.DataFrame([dict(player_id='qb',player_display_name='QB',season=2026,week=1,season_type='REG',team='SEA',position='QB',passing_yards=200,passing_attempts=30,sacks_suffered=2,def_sacks=0),dict(player_id='de',player_display_name='Defender',season=2026,week=1,season_type='REG',team='DEN',position='DE',passing_yards=0,passing_attempts=0,sacks_suffered=0,def_sacks=.5)])
    def test_half_sack_is_preserved_not_rounded_or_approved(self):
        r=readiness(self.rows());self.assertEqual(r['markets']['def_sacks']['fractional_stat_rows'],1)
        self.assertFalse(r['markets']['def_sacks']['model_approved']);self.assertEqual(r['probabilities_generated'],0)
    def test_invalid_fraction_missing_column_and_duplicate_rejected(self):
        d=self.rows();d.loc[1,'def_sacks']=.25
        self.assertEqual(readiness(d)['markets']['def_sacks']['status'],'INPUTS_MISSING')
        self.assertEqual(readiness(self.rows().drop(columns='passing_attempts'))['markets']['passing_yards']['status'],'INPUTS_MISSING')
        with self.assertRaisesRegex(ValueError,'Duplicate'):readiness(pd.concat([self.rows(),self.rows()]))
    def test_attempts_schema_maps_and_conflicts_do_not_silently_override(self):
        d=self.rows().rename(columns={"passing_attempts":"attempts"})
        self.assertEqual(readiness(d)['markets']['passing_yards']['status'],'HISTORY_PRESENT_MODEL_UNVALIDATED')
        d['passing_attempts']=999
        with self.assertRaisesRegex(ValueError,'Conflicting'):readiness(d)
    def test_unidentified_nonzero_defender_fails(self):
        d=self.rows();d.loc[1,'player_id']=None
        with self.assertRaisesRegex(ValueError,'Unidentified nonzero'):readiness(d)

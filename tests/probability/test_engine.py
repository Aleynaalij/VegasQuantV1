import sys
import unittest
from pathlib import Path
import numpy as np
import pandas as pd
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/"research"/"probability"))
from engine import prepare, fit, distribution, calibrate, calibrated, evaluate_quote, forecast_inputs, implied

def logs():
    rows=[]
    for season in [2022,2023]:
        for week in range(1,19):
            for i in range(12):
                rows.append(dict(player_id=str(i),recent_team="ATL",opponent_team="NO",season=season,
                    week=week,season_type="REG",position="RB",carries=12+i%4,
                    rushing_yards=45+week+i,targets=4,receiving_yards=20+i))
    return pd.DataFrame(rows)

class EngineTests(unittest.TestCase):
    def test_future_outcomes_do_not_change_prior_features(self):
        d=logs(); a=prepare(d,"rushing")
        d.loc[(d.season==2023)&(d.week>=10),"rushing_yards"]=9000
        b=prepare(d,"rushing")
        for x,y in zip(a,b):
            if (x["season"],x["week"])<=(2023,10): np.testing.assert_array_equal(x["x"],y["x"])

    def test_duplicate_is_rejected(self):
        d=logs()
        with self.assertRaises(ValueError): prepare(pd.concat([d,d.iloc[:1]]),"rushing")

    def test_live_features_exclude_target_week(self):
        d=logs(); q=dict(player_id="1",team="ATL",opponent="NO",season=2023,week=10)
        a=forecast_inputs(d,"rushing",q)
        d.loc[(d.season==2023)&(d.week>=10),"carries"]=1000
        b=forecast_inputs(d,"rushing",q)
        self.assertEqual(a,b)

    def test_distribution_is_finite_nonnegative(self):
        rows=prepare(logs(),"rushing"); model=fit(rows)
        values=distribution(model,rows[-1])
        self.assertTrue(np.isfinite(values).all());self.assertTrue((values>=0).all())

    def test_calibration_monotone(self):
        p=np.linspace(.01,.99,200);y=(p>.5).astype(float)
        ab=calibrate(p,y);q=calibrated(p,ab)
        self.assertTrue((np.diff(q)>=0).all());self.assertTrue(((q>0)&(q<1)).all())

    def test_shadow_gate_and_stale_quote(self):
        rows=prepare(logs(),"rushing");model=fit(rows);model["calibration"]=[0,1]
        artifact=dict(model_id="test",models={"rushing":model},validation={"blockers":["No market validation"]})
        row=rows[-1];row["history_through"]=[2023,17]
        q=dict(market="rushing",direction="over",player_id=row["player_id"],opponent="NO",
            season=2023,week=18,line=60.5,odds=-110,sportsbook="Test fixture",source_url="https://example.test/quote",
            observed_at="2023-01-01T12:00:00Z",kickoff="2023-01-01T18:00:00Z",availability_verified=True)
        out=evaluate_quote(artifact,row,q,"2023-01-01T12:20:00Z")
        self.assertEqual(out["status"],"WAIT");self.assertFalse(out["official_eligible"])
        self.assertIn("Quote older than 15 minutes",out["blockers"])
        q["player_id"]="wrong"
        with self.assertRaises(ValueError): evaluate_quote(artifact,row,q,"2023-01-01T12:20:00Z")

    def test_push_probabilities_sum_to_one(self):
        rows=prepare(logs(),"rushing");model=fit(rows);model["calibration"]=[0,1]
        artifact=dict(model_id="test",models={"rushing":model},validation={"blockers":["shadow"]})
        row=rows[-1];row["history_through"]=[2023,17]
        q=dict(market="rushing",direction="over",player_id=row["player_id"],opponent="NO",
            season=2023,week=18,line=60,odds=-110,sportsbook="Test fixture",source_url="https://example.test/quote",
            observed_at="2023-01-01T12:00:00Z",kickoff="2023-01-01T18:00:00Z")
        over=evaluate_quote(artifact,row,q,"2023-01-01T12:05:00Z")
        q["direction"]="under";under=evaluate_quote(artifact,row,q,"2023-01-01T12:05:00Z")
        self.assertAlmostEqual(over["research_probability"]+under["research_probability"]+over["push_probability"],1)

    def test_prices(self):
        self.assertAlmostEqual(implied(-110),110/210)
        self.assertAlmostEqual(implied(150),.4)
        with self.assertRaises(ValueError):implied(0)

    def test_exact_two_sided_price_comparison(self):
        rows=prepare(logs(),"rushing");model=fit(rows);model["calibration"]=[0,1]
        artifact=dict(model_id="test",models={"rushing":model},validation={"blockers":["shadow"]})
        row=rows[-1];row["history_through"]=[2023,17]
        q=dict(market="rushing",direction="over",player_id=row["player_id"],opponent="NO",
            season=2023,week=18,line=60.5,odds=-110,sportsbook="Test fixture",
            source_url="https://example.test/quote",observed_at="2023-01-01T12:00:00Z",
            kickoff="2023-01-01T18:00:00Z")
        other=dict(q,direction="under");q["opposite_quote"]=other
        out=evaluate_quote(artifact,row,q,"2023-01-01T12:05:00Z")
        self.assertAlmostEqual(out["no_vig_market_probability"],.5)
        self.assertEqual(out["status"],"WAIT")
        other["line"]=61.5
        with self.assertRaises(ValueError):evaluate_quote(artifact,row,q,"2023-01-01T12:05:00Z")
        other["line"]=60.5;other["observed_at"]="2023-01-01T11:58:00Z"
        out=evaluate_quote(artifact,row,q,"2023-01-01T12:05:00Z")
        self.assertIsNone(out["no_vig_market_probability"])
        self.assertIn("Opposite price is stale or not contemporaneous",out["blockers"])

if __name__=="__main__": unittest.main()

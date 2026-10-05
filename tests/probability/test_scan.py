import hashlib
import json
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/"research"/"probability"))
from engine import prepare,fit,forecast_inputs,FEATURES
from scan import scan
from test_engine import logs

class ScanTests(unittest.TestCase):
    def setUp(self):
        self.d=logs();self.d["player_display_name"]="Player "+self.d.player_id
        models={}
        for market in ["rushing","receiving"]:
            m=fit(prepare(self.d,market));m["calibration"]=[0,1];models[market]=m
        self.a=dict(version="test",models=models,validation={"blockers":["shadow"]})
        self.a["model_id"]=hashlib.sha256(json.dumps(self.a,sort_keys=True).encode()).hexdigest()
        self.game=dict(id="fixture",away_abbreviation="ATL",home_abbreviation="NO",season=2023,week=18,kickoff="2023-12-31T18:00:00Z")
        self.now="2023-12-30T12:00:00Z"
        self.o=dict(game_id="fixture",source="https://example.test/quote",observed_at="2023-12-30T11:59:00Z",
            payload=dict(book="Test fixture",market="player_rush_yds",outcomes=[
                dict(name="Over",description="Player 1",point=60.5,price=-110),
                dict(name="Under",description="Player 1",point=60.5,price=-110)]))
    def test_missing_quotes_leave_entire_supplied_slate_unknown(self):
        r=scan(self.d,self.a,[self.game],[],self.now)
        self.assertEqual(len(r["cards"]),24)
        self.assertTrue(all(c["research_probability"] is None and c["status"]=="WAIT" for c in r["cards"]))
    def test_cached_features_match_single_forecast(self):
        r=scan(self.d,self.a,[self.game],[self.o],self.now)
        priced=[c for c in r["cards"] if c.get("quote")]
        self.assertEqual(len(priced),2)
        row=forecast_inputs(self.d,"rushing",priced[0]["quote"])
        self.assertEqual(priced[0]["forecast_inputs"],dict(zip(FEATURES,row["x"])))
        self.assertTrue(all(c["status"]=="WAIT" for c in priced))
    def test_new_snapshot_cannot_revive_a_removed_line(self):
        newer=dict(self.o,observed_at="2023-12-30T11:59:30Z",payload=dict(self.o["payload"],outcomes=[]))
        r=scan(self.d,self.a,[self.game],[self.o,newer],self.now)
        self.assertEqual(r["coverage"]["priced"],0)

if __name__=="__main__":unittest.main()

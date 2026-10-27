import copy
from datetime import datetime, timezone, timedelta
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/"research"/"probability"))
from journal import Journal

class JournalTests(unittest.TestCase):
    def setUp(self):
        self.directory=tempfile.TemporaryDirectory()
        self.j=Journal(str(Path(self.directory.name)/"journal.sqlite"))
        self.now=datetime(2026,10,5,12,tzinfo=timezone.utc)
        self.f=dict(model_id="test-fixture",forecast_inputs={"example":1},history_through=[2026,3],
            blockers=["shadow"],research_probability=.6,push_probability=0.,break_even_probability=110/210,
            no_vig_market_probability=.5,generated_as_of=self.now.isoformat(),
            quote=dict(player_id="fixture",team="BUF",opponent="NE",season=2026,week=4,
                market="rushing",direction="over",line=60.5,odds=-110,sportsbook="Test fixture",
                observed_at=self.now.isoformat(),kickoff=(self.now+timedelta(hours=2)).isoformat(),
                source_url="https://example.test/quote"))
    def tearDown(self):
        self.j.close();self.directory.cleanup()
    def result(self,fid,yards=80):
        return dict(forecast_id=fid,yards=yards,final=True,
            source_url="https://example.test/final",observed_at=(self.now+timedelta(hours=6)).isoformat())
    def test_dedupe_and_conflicting_forecast(self):
        fid,inserted=self.j.forecast(self.f,self.now);self.assertTrue(inserted)
        self.assertEqual(self.j.forecast(self.f,self.now),(fid,False))
        roundtrip=dict(self.f,journal_forecast_id=fid)
        self.assertEqual(self.j.forecast(roundtrip,self.now),(fid,False))
        f=copy.deepcopy(self.f);f["research_probability"]=.7
        with self.assertRaises(ValueError):self.j.forecast(f,self.now)
    def test_cannot_record_after_kickoff_or_backdate(self):
        for t in [self.now+timedelta(hours=3),self.now+timedelta(minutes=16)]:
            with self.assertRaises(ValueError):self.j.forecast(self.f,t)
    def test_outcome_must_follow_forecast_and_be_final(self):
        with self.assertRaises(ValueError):self.j.outcome(self.result("unknown"),self.now+timedelta(hours=7))
        fid,_=self.j.forecast(self.f,self.now);o=self.result(fid);o["final"]=False
        with self.assertRaises(ValueError):self.j.outcome(o,self.now+timedelta(hours=7))
    def test_scoring_and_outcome_immutability(self):
        fid,_=self.j.forecast(self.f,self.now);o=self.result(fid)
        self.assertTrue(self.j.outcome(o,self.now+timedelta(hours=7)))
        self.assertFalse(self.j.outcome(o,self.now+timedelta(hours=7)))
        with self.assertRaises(ValueError):self.j.outcome(self.result(fid,20),self.now+timedelta(hours=7))
        r=self.j.report();self.assertAlmostEqual(r["model_brier"],.16)
        self.assertAlmostEqual(r["no_vig_brier"],.25)
        self.assertEqual(r["official_picks_graded"],0)
        self.assertAlmostEqual(r["hypothetical_flat_unit_return"],100/110)
    def test_update_delete_and_tamper_detection(self):
        self.j.forecast(self.f,self.now)
        for sql in ["UPDATE events SET kind='fake'","DELETE FROM events"]:
            with self.assertRaises(sqlite3.IntegrityError):self.j.db.execute(sql)
            self.j.db.rollback()
        self.j.db.execute("DROP TRIGGER no_update")
        self.j.db.execute("UPDATE events SET payload='{}'");self.j.db.commit()
        with self.assertRaises(ValueError):self.j.events()
    def test_pending_first_observation_is_not_replaced_by_hindsight(self):
        self.j.forecast(self.f,self.now)
        f=copy.deepcopy(self.f);f["quote"]["sportsbook"]="Other test book"
        fid,_=self.j.forecast(f,self.now);self.j.outcome(self.result(fid),self.now+timedelta(hours=7))
        self.assertEqual(self.j.report()["evaluated_observations"],0)
    def test_push_and_void(self):
        f=copy.deepcopy(self.f);f["quote"]["line"]=60;f["push_probability"]=.1
        fid,_=self.j.forecast(f,self.now);self.j.outcome(self.result(fid,60),self.now+timedelta(hours=7))
        r=self.j.report();self.assertEqual(r["pushes"],1);self.assertIsNone(r["model_brier"])
        self.assertEqual(r["hypothetical_flat_unit_return"],0)
        f=copy.deepcopy(self.f);f["quote"]["player_id"]="second-fixture"
        fid,_=self.j.forecast(f,self.now);o=self.result(fid);o.pop("yards");o["void"]=True
        self.j.outcome(o,self.now+timedelta(hours=7))
        r=self.j.report();self.assertEqual(r["recorded_outcomes"],2)
        self.assertEqual(r["evaluated_observations"],1)

if __name__=="__main__":unittest.main()

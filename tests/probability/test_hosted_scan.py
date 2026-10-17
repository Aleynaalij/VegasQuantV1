from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
import types
import unittest
from unittest import mock
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "research" / "probability"))
import hosted_scan as h

NOW = datetime(2026, 10, 18, 15, 0, tzinfo=timezone.utc)
GAMES = [
    dict(id="g1", season=2026, week=7, kickoff="2026-10-18T17:00:00+00:00", kickoff_tbd=False, sport="nfl", away_abbreviation="SEA", home_abbreviation="DEN"),
    dict(id="g2", season=2026, week=8, kickoff="2026-10-26T17:00:00+00:00", kickoff_tbd=False, sport="nfl", away_abbreviation="KC", home_abbreviation="LV"),
    dict(id="g3", season=2026, week=7, kickoff="2026-10-18T20:00:00+00:00", kickoff_tbd=True, sport="nfl", away_abbreviation="A", home_abbreviation="B"),
    dict(id="n1", season=2026, week=1, kickoff="2026-10-18T23:00:00+00:00", kickoff_tbd=False, sport="nba", away_abbreviation="X", home_abbreviation="Y"),
]
def prop(minutes_ago, book="FanDuel"):
    t = (NOW - timedelta(minutes=minutes_ago)).isoformat()
    return dict(id="o1", game_id="g1", kind="odds", source="https://api.example/odds", observed_at=t, recorded_at=t,
                payload=dict(book=book, market="player_rush_yds", outcomes=[], provider_updated_at=t))

class FakeDb(h.Supabase):
    def __init__(self, observations):
        super().__init__("https://db.example", "secret")
        self.observations, self.calls = observations, []
    def request(self, path, body=None):
        self.calls.append((path, body))
        if path.startswith("/rest/v1/games"):
            return GAMES
        if path.startswith("/rest/v1/source_observations"):
            return self.observations if "kind=eq.odds" in path else []
        if path.startswith("/rest/v1/rpc/record_nfl_shadow_scan"):
            return dict(run_id="r", recorded_forecasts=2, skipped_unverifiable_or_stale=1)
        raise AssertionError(path)

class HostedScanTests(unittest.TestCase):
    def test_slate_is_upcoming_scheduled_nfl_games_within_seven_days(self):
        self.assertEqual([g["id"] for g in h.upcoming_games(FakeDb([]), NOW)], ["g1"])
        self.assertEqual(h.slate([GAMES[0]]), [{"id": "g1", "kickoff": "2026-10-18T17:00:00+00:00"}])
        db = FakeDb([])
        h.upcoming_games(db, NOW)
        path = db.calls[0][0]
        self.assertIn("sport=ilike.nfl", path)
        self.assertIn("kickoff_tbd=is.false", path)
        self.assertIn("and=(kickoff.gt.2026-10-18T15:00:00Z,kickoff.lte.2026-10-25T15:00:00Z)", path)

    def test_only_a_recent_fanduel_prop_snapshot_makes_a_scan_due(self):
        self.assertTrue(h.has_fresh_props([prop(5)], NOW))
        self.assertFalse(h.has_fresh_props([prop(30)], NOW))
        self.assertFalse(h.has_fresh_props([prop(5, book="DraftKings")], NOW))

    def test_no_fresh_snapshot_records_nothing(self):
        db = FakeDb([prop(60)])
        out = h.run(db, now_fn=lambda: NOW)
        self.assertFalse(out["scanned"])
        self.assertFalse(any("rpc" in p for p, _ in db.calls))

    def test_scan_is_uploaded_with_source_hashes_and_exact_slate_and_reports_counts_only(self):
        db, captured = FakeDb([prop(3)]), {}
        def fake_scan(frame, artifact, games, observations, as_of):
            captured.update(games=games, as_of=as_of, rows=len(frame))
            return dict(as_of=as_of, model_id=artifact["model_id"], status="SHADOW_ONLY", cards=[], coverage=dict(cards=0, priced=0, unavailable=0))
        def fetch(season, folder):
            p = folder / f"stats_player_week_{season}.csv"
            p.write_text("player_id,season\n1,%d\n" % season)
            return p
        fakes = {"scan": types.SimpleNamespace(scan=fake_scan), "engine": types.SimpleNamespace(normalize=lambda d: d)}
        with mock.patch.dict(sys.modules, fakes):
            out = h.run(db, now_fn=lambda: NOW, fetch=fetch)
        self.assertEqual(out, {"scanned": True, "games": 1, "coverage": {"cards": 0, "priced": 0, "unavailable": 0}, "uploaded_cards": 0,
                               "recorded_forecasts": 2, "skipped_unverifiable_or_stale": 1, "replayed": False})
        self.assertEqual(captured["rows"], 2)  # 2025 and 2026 logs
        path, body = db.calls[-1]
        self.assertEqual(body["p_slate"], [{"id": "g1", "kickoff": "2026-10-18T17:00:00+00:00"}])
        self.assertEqual([s["file"] for s in body["p_scan"]["input_sources"]], ["stats_player_week_2025.csv", "stats_player_week_2026.csv"])
        self.assertTrue(all(len(s["sha256"]) == 64 and s["source_url"].startswith("https://github.com/nflverse/") for s in body["p_scan"]["input_sources"]))

    def test_upload_keeps_fanduel_priced_cards_and_summarizes_the_rest(self):
        fd = dict(player="A", quote=dict(sportsbook="FanDuel"), research_probability=0.7, blockers=["Quote older than 15 minutes"])
        dk = dict(player="B", quote=dict(sportsbook="DraftKings"), research_probability=0.6, blockers=["Quote older than 15 minutes"])
        unpriced = dict(player="C", research_probability=None, blockers=["No verified exact-player prop quote"])
        result = dict(as_of="t", cards=[fd, dk, unpriced], coverage=dict(cards=3, priced=2, unavailable=1))
        p = h.journal_payload(result)
        self.assertEqual(p["cards"], [fd])
        self.assertEqual(p["coverage"], result["coverage"])
        self.assertEqual(p["blocker_counts"], {"No verified exact-player prop quote": 1, "Quote older than 15 minutes": 2})
        self.assertEqual(p["card_summary"], {"scanned": 3, "uploaded_fanduel_priced": 1})
        # B is priced at DraftKings only: it counts as missing FanDuel coverage, not as priced.
        self.assertEqual(p["fanduel_coverage"], {"candidates": 3, "priced": 1, "unavailable": 2})
        self.assertEqual(p["fanduel_blocker_counts"], {"No FanDuel quote for the player-market": 2, "Quote older than 15 minutes": 1})

if __name__ == "__main__":
    unittest.main()

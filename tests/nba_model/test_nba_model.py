from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys
import unittest
import numpy as np
import pandas as pd
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "research" / "nba"))
import engine
import hosted_scan as h
import shadow_report as sr

TEAMS = ["Boston Celtics", "New York Knicks", "LA Clippers", "Miami Heat"]
POSITIONS = ["PG", "SG", "SF", "PF", "C", "G", "F", "C"]


def season_frame(days=40, start="2025-11-01", seed=7):
    """Synthetic hoopR-shaped box scores: four teams, two games a day, eight players a team."""
    rng = np.random.default_rng(seed)
    rows, game = [], 1000
    for day in pd.date_range(start, periods=days):
        order = rng.permutation(4)
        for a, b in [(order[0], order[1]), (order[2], order[3])]:
            game += 1
            for side, team, opp in [("away", a, b), ("home", b, a)]:
                for i in range(8):
                    minutes = float(rng.integers(18, 38)) if i < 6 else float(rng.integers(0, 15))
                    rows.append({"game_id": game, "season": 2026, "season_type": 2, "game_date": str(day.date()),
                        "athlete_id": 100 * team + i, "athlete_display_name": f"Player {'abcd'[team]}{'abcdefgh'[i]}",
                        "team_display_name": TEAMS[team], "opponent_team_display_name": TEAMS[opp],
                        "minutes": minutes, "points": int(rng.poisson(minutes * .5)), "rebounds": int(rng.poisson(minutes * .2)),
                        "starter": i < 5, "did_not_play": False, "home_away": side, "athlete_position_abbreviation": POSITIONS[i]})
    return pd.DataFrame(rows)


class EngineTests(unittest.TestCase):
    def test_normalize_excludes_dnp_exhibitions_and_canonicalizes_teams(self):
        d = season_frame(3)
        extra = d.iloc[:2].copy()
        extra["team_display_name"] = "Team Stars"
        dnp = d.iloc[2:3].copy()
        dnp["did_not_play"], dnp["minutes"], dnp["game_id"] = True, np.nan, 1
        n = engine.normalize(pd.concat([d, extra.assign(game_id=2), dnp]))
        self.assertEqual(len(n), len(d))
        self.assertIn("Los Angeles Clippers", set(n.team))
        self.assertEqual(set(n.position), {"G", "F", "C"})

    def test_live_features_match_training_features_and_ignore_future_games(self):
        frame = season_frame()
        rows = engine.prepare(frame, "player_points")
        self.assertGreater(len(rows), 50)
        normalized = engine.normalize(frame)
        for row in rows[-12:]:
            quote = {"athlete_id": row["athlete_id"], "team": row["team"], "opponent": row["opponent"],
                     "home": bool(frame[(frame.game_id == int(row["game_id"])) & (frame.athlete_id == int(row["athlete_id"]))].home_away.iloc[0] == "home"),
                     "game_date": row["date"]}
            live = engine.forecast_inputs(frame, "player_points", quote)
            np.testing.assert_allclose(live["x"], row["x"], rtol=1e-12)
            self.assertLess(live["history_through"], row["date"])
            # Outcomes on or after the target date cannot change the features.
            future = normalized.copy()
            future.loc[future.date >= pd.Timestamp(row["date"]), ["points", "minutes"]] = 0
            np.testing.assert_allclose(engine.forecast_inputs(future, "player_points", quote, normalized=True)["x"], row["x"], rtol=1e-12)

    def test_bench_players_and_short_histories_are_outside_the_cohort(self):
        frame = season_frame(4)
        with self.assertRaises(ValueError):
            engine.forecast_inputs(frame, "player_points", {"athlete_id": 0, "team": TEAMS[0], "opponent": TEAMS[1], "home": True, "game_date": "2025-11-04"})
        frame = season_frame()
        with self.assertRaises(ValueError):
            engine.forecast_inputs(frame, "player_points", {"athlete_id": 7, "team": TEAMS[0], "opponent": TEAMS[1], "home": True, "game_date": "2025-12-30"})

    def test_frozen_artifact_integrity_and_evaluation(self):
        artifact = json.loads(h.MODEL.read_text())
        self.assertEqual(engine.model_id(artifact), artifact["model_id"])
        self.assertEqual(artifact["validation"]["release_status"], "SHADOW_ONLY")
        for market in engine.MARKETS:
            low, high = artifact["validation"]["markets"][market]["model"]["baseline_brier_difference_95pct"]
            self.assertLess(high, 0)  # beat the player's own recent history on the held-out season
        frame = season_frame()
        row = engine.forecast_inputs(frame, "player_points", {"athlete_id": 0, "team": TEAMS[0], "opponent": TEAMS[1], "home": True, "game_date": "2025-12-30"})
        out = engine.evaluate(artifact, "player_points", row, 14.5, -110, -110)
        self.assertTrue(0 < out["over_probability"] < 1)
        self.assertAlmostEqual(out["no_vig"], .5)
        self.assertAlmostEqual(out["difference_vs_no_vig_pp"], (out["over_probability"] - .5) * 100)
        lower = engine.evaluate(artifact, "player_points", row, 9.5)["over_probability"]
        self.assertGreaterEqual(lower, out["over_probability"])
        with self.assertRaises(ValueError):
            engine.evaluate(artifact, "player_points", row, 15)


NOW = datetime(2025, 12, 30, 18, 0, tzinfo=timezone.utc)


class FakeDb(h.Supabase):
    def __init__(self, props, games):
        super().__init__("https://db.example", "secret")
        self.props, self.games, self.calls = props, games, []

    def request(self, path, body=None):
        self.calls.append((path, body))
        if path.startswith("/rest/v1/nba_games"):
            return self.games if "season_type=eq.2" in path and "tipoff.gt." in path else []
        if path.startswith("/rest/v1/nba_observations"):
            return self.props
        if path.startswith("/rest/v1/nba_player_results"):
            return []
        raise AssertionError(path)


def snapshot(minutes_ago, market="player_points", outcomes=None):
    t = (NOW - timedelta(minutes=minutes_ago)).isoformat()
    return {"id": f"o-{market}-{minutes_ago}", "game_id": "g1", "recorded_at": t, "observed_at": t,
            "payload": {"book": "FanDuel", "market": market, "outcomes": outcomes or []}}


class HostedScanTests(unittest.TestCase):
    GAME = {"id": "g1", "provider_id": "1", "away_team": "Boston Celtics", "home_team": "New York Knicks",
            "tipoff": "2025-12-31T00:30:00+00:00", "tipoff_tbd": False, "season_type": 2}

    def test_name_key_and_quotes(self):
        self.assertEqual(h.name_key("Nikola Jović"), "nikola jovic")
        self.assertEqual(h.name_key("P.J. Washington Jr."), "pj washington")
        q = h.quotes(snapshot(1, outcomes=[
            {"name": "Over", "description": "A B", "point": 20.5, "price": -115}, {"name": "Under", "description": "A B", "point": 20.5, "price": -105},
            {"name": "Over", "description": "C D", "point": 20, "price": -110}, {"name": "Over", "description": "E F", "point": 9.5, "price": 50}]))
        self.assertEqual(dict(q), {("A B", 20.5): {"over": -115, "under": -105}})
        self.assertEqual((h.season_of(datetime(2026, 10, 20)), h.season_of(datetime(2027, 3, 1))), (2027, 2027))

    def test_latest_snapshot_per_market_and_freshness_check(self):
        db = FakeDb([snapshot(2), snapshot(9), snapshot(5, "player_rebounds")], [self.GAME])
        self.assertEqual(sorted(p["id"] for p in h.latest_props(db, [self.GAME], NOW)), ["o-player_points-2", "o-player_rebounds-5"])
        self.assertIn("payload->>book=eq.FanDuel", db.calls[-1][0])
        self.assertTrue(h.check(db, NOW))
        self.assertFalse(h.check(FakeDb([], [self.GAME]), NOW))

    def test_run_builds_checked_forecasts_from_history(self):
        frame = season_frame(59)  # history through 2025-12-29
        names = frame.groupby("athlete_id").athlete_display_name.first()
        outcomes = [{"name": side, "description": names[i], "point": 12.5, "price": -110} for i in (0, 1, 7, 100) for side in ("Over", "Under")]
        outcomes += [{"name": "Over", "description": "Unknown Guy", "point": 10.5, "price": -110}]
        db = FakeDb([snapshot(3, outcomes=outcomes)], [self.GAME])
        def fake_download(now, directory):
            paths = [directory / "player_box_2025.csv", directory / "player_box_2026.csv"]
            cut = frame.game_date < "2025-12-01"
            frame[cut].to_csv(paths[0], index=False)
            frame[~cut].to_csv(paths[1], index=False)
            return paths
        original = h.download
        h.download = fake_download
        try:
            import tempfile
            with tempfile.TemporaryDirectory() as tmp:
                scan = h.run(db, NOW, Path(tmp))
        finally:
            h.download = original
        players = sorted(f["player"] for f in scan["forecasts"])
        self.assertEqual(players, sorted([names[0], names[1], names[100]]))  # bench player 7 is outside the cohort
        self.assertEqual(scan["summary"]["unmatched_player"], 1)
        self.assertEqual(scan["summary"]["outside_cohort"], 1)
        f = scan["forecasts"][0]
        self.assertEqual((f["observation_id"], f["market"], f["line"], f["over_odds"], f["under_odds"]), ("o-player_points-3", "player_points", 12.5, -110, -110))
        self.assertFalse(f["forecast"]["official_eligible"])
        self.assertEqual({x["team"] for x in scan["forecasts"]}, {"Boston Celtics", "New York Knicks"})



def eval_row(i, game, result, p, no_vig=.5, over=-110, under=-110, close_over=-120, close_under=100, observed="2025-12-30T17:00:00Z", line=20.5, market="player_points"):
    return {"id": i, "game_id": game, "athlete_id": str(i % 50), "market": market, "line": line, "observed_at": observed,
            "over_probability": p, "no_vig_over": no_vig, "result": result, "over_odds": over, "under_odds": under,
            "close_over_odds": close_over, "close_under_odds": close_under}


class ReportTests(unittest.TestCase):
    def test_first_capture_only_and_insufficient_sample(self):
        data = [eval_row(1, "g1", "WIN", .6), eval_row(2, "g1", "WIN", .7, observed="2025-12-30T18:00:00Z"), eval_row(3, "g2", "PENDING", .4)]
        data[1]["athlete_id"] = data[0]["athlete_id"]
        r = sr.build_report("m", data, NOW)
        self.assertEqual(r["first_captures"], 2)
        m = r["markets"]["player_points"]
        self.assertEqual((m["graded"], m["pending"], m["games"]), (1, 1, 1))
        self.assertFalse(m["ready_for_owner_review"])
        self.assertFalse(m["criteria"]["sample_floors"])
        self.assertFalse(r["official_eligible"])

    def test_skilled_journal_meets_every_criterion(self):
        rng = np.random.default_rng(3)
        data = []
        for i in range(600):
            truth = rng.uniform(.2, .8)
            win = rng.uniform() < truth
            # The model knows the truth; the market is a noisy 50/50; closing moves toward the model.
            data.append(eval_row(i, f"g{i % 60}", "WIN" if win else "LOSS", truth, .5, -110, -110,
                                 -140 if truth > .5 else 120, 120 if truth > .5 else -140))
        m = sr.build_report("m", data, NOW)["markets"]["player_points"]
        self.assertTrue(all(m["criteria"].values()), m["criteria"])
        self.assertTrue(m["ready_for_owner_review"])
        self.assertGreater(m["closing_line_value"]["mean_pp"], 0)

    def test_market_matching_model_does_not_qualify(self):
        rng = np.random.default_rng(4)
        data = []
        for i in range(600):
            truth = rng.uniform(.3, .7)
            data.append(eval_row(i, f"g{i % 60}", "WIN" if rng.uniform() < truth else "LOSS", truth, truth))
        m = sr.build_report("m", data, NOW)["markets"]["player_points"]
        self.assertFalse(m["criteria"]["beats_no_vig_brier"])
        self.assertFalse(m["ready_for_owner_review"])


if __name__ == "__main__":
    unittest.main()

import csv
import gzip
import importlib.util
import io
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("ngs", Path(__file__).parents[2] / "research/ngs/collect.py")
ngs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ngs)


class CollectorTest(unittest.TestCase):
    def fixture(self, **changes):
        row = dict(season="2026", season_type="REG", week="6", player_gsis_id="00-0000001", player_display_name="Synthetic Player", team_abbr="LA",
                   avg_time_to_throw="2.5", completion_percentage_above_expectation="NA", avg_intended_air_yards="8.1")
        row.update(changes)
        buffer = io.StringIO()
        writer = csv.DictWriter(buffer, fieldnames=list(row))
        writer.writeheader()
        writer.writerow(row)
        return gzip.compress(buffer.getvalue().encode())

    def asset(self):
        return dict(name="ngs_passing.csv.gz", browser_download_url=ngs.BASE + "ngs_passing.csv.gz", updated_at="2026-10-22T07:00:00Z")

    def test_gzip_asset_discovery_and_nulls(self):
        asset = ngs.choose_asset({"assets": [self.asset()]}, "passing")
        result = ngs.normalize(self.fixture(), asset, "passing", [2025, 2026], "2026-10-22T12:00:00+00:00")
        self.assertEqual(result["row_count"], 1)
        self.assertEqual(result["rows"][0]["team_abbr"], "LAR")
        self.assertEqual(result["rows"][0]["source_team_abbr"], "LA")
        self.assertIsNone(result["rows"][0]["completion_percentage_above_expectation"])
        self.assertEqual(len(result["source_sha256"]), 64)

    def test_identity_schema_and_timeline_fail_closed(self):
        for changes in [dict(player_gsis_id="bad"), dict(week="99"), dict(avg_time_to_throw="NaN"), dict(season="2024")]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                ngs.normalize(self.fixture(**changes), self.asset(), "passing", [2026], "2026-10-22T12:00:00+00:00")
        with self.assertRaises(ValueError):
            ngs.normalize(self.fixture(), self.asset(), "passing", [2026], "2026-10-21T12:00:00+00:00")
        with self.assertRaises(ValueError):
            ngs.normalize(b"season,week\n2026,6\n", dict(self.asset(), name="ngs_passing.csv"), "passing", [2026], "2026-10-22T12:00:00+00:00")

    def test_untrusted_asset_url_rejected(self):
        with self.assertRaises(ValueError):
            ngs.choose_asset({"assets": [dict(self.asset(), browser_download_url="https://example.com/fake.csv.gz")]}, "passing")

    def test_super_bowl_week_23_is_valid_history(self):
        result = ngs.normalize(self.fixture(season_type="POST", week="23"), self.asset(), "passing", [2026], "2026-10-22T12:00:00+00:00")
        self.assertEqual(result["rows"][0]["week"], "23")


if __name__ == "__main__":
    unittest.main()

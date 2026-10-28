import json,tempfile,unittest,shutil
from pathlib import Path
from research.game_sim.verify_package import verify
ROOT=Path(__file__).resolve().parents[2]
FOLDER=ROOT/'research/game_sim/artifacts/v0.2.9'
SOURCE=ROOT.parent/'game-sim-data/play_by_play_2022.csv.gz'
class PackageVerificationTests(unittest.TestCase):
    def test_scoring_pass_cannot_hide_failed_timeout_or_approve_release(self):
        r=verify(FOLDER,SOURCE)
        self.assertTrue(r['integrity_verified']);self.assertFalse(r['base_checks_passed'])
        self.assertIn('timeouts',r['failed_checks']);self.assertFalse(r['release_ready'])
        self.assertTrue(r['replay']['rules_replay_verified'])
    def test_modified_payload_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            dst=Path(tmp)/'package';shutil.copytree(FOLDER,dst)
            with (dst/'gate.json.gz').open('ab') as f:f.write(b'tampered')
            with self.assertRaisesRegex(ValueError,'hash mismatch'):verify(dst,SOURCE)
    def test_wrong_training_source_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'source';p.write_bytes(b'wrong source')
            with self.assertRaisesRegex(ValueError,'training source mismatch'):verify(FOLDER,p)

    def test_passing_base_still_cannot_approve_matchup_or_player_forecasts(self):
        r=verify(ROOT/'research/game_sim/artifacts/v0.2.10',SOURCE)
        self.assertTrue(r['base_checks_passed']);self.assertEqual(r['failed_checks'],[])
        self.assertFalse(r['release_ready'])
        self.assertTrue(any('team/player' in x for x in r['blockers']))

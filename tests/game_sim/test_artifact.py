import gzip,hashlib,json,unittest
from pathlib import Path
from research.game_sim.batch import canonical
class ArtifactTests(unittest.TestCase):
    def test_saved_artifact_manifest_and_canonical_digest(self):
        root=Path(__file__).resolve().parents[2]/'research/game_sim/artifacts/v0.1.1'
        blob=(root/'model.json.gz').read_bytes();raw=gzip.decompress(blob);m=json.loads((root/'manifest.json').read_text())
        self.assertEqual(hashlib.sha256(blob).hexdigest(),m['compressed_sha256'])
        self.assertEqual(hashlib.sha256(raw).hexdigest(),m['artifact_sha256'])
        self.assertEqual(raw,canonical(json.loads(raw)))
if __name__=='__main__':unittest.main()

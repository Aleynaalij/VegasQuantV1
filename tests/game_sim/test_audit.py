import csv
import io
import unittest
from research.game_sim.audit_pbp import REQUIRED,audit
class AuditTests(unittest.TestCase):
    def test_coverage_missing_is_not_zero(self):
        stream=io.StringIO();writer=csv.DictWriter(stream,fieldnames=REQUIRED);writer.writeheader()
        row={key:'0' for key in REQUIRED};row.update(game_id='one',play_id='1',season='2022',play_type='run',down='')
        writer.writerow(row);writer.writerow(row)
        report=audit(stream.getvalue().encode(),'https://example.test/pbp.csv','2026-10-27T00:00:00Z')
        self.assertEqual(report['rows'],2);self.assertEqual(report['duplicate_game_play_keys'],1)
        self.assertNotIn('down',report['required_field_nonmissing']);self.assertEqual(report['required_field_nonmissing']['yards_gained'],2)
    def test_missing_schema_rejected(self):
        with self.assertRaises(ValueError):audit(b'game_id\none\n','https://example.test','now')
if __name__=='__main__':unittest.main()

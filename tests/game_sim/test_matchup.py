import copy
import unittest
from research.game_sim.matchup import fit, matchup_epa, workload_shares

CUTOFF = '2023-01-01T00:00:00Z'
SOURCE = dict(source_url='https://example.org/source.csv', sha256='a'*64,
              retrieved_at='2022-12-31T00:00:00Z')


def rows():
    return [dict(game_start_utc='2022-10-01T17:00:00Z', season_type='REG',
                 qtr='1', play_type=kind, epa=str(value), posteam=attack,
                 defteam=defense, passer_player_id='qb', receiver_player_id='wr',
                 rusher_player_id='rb')
            for kind in ('pass', 'run')
            for attack, defense, value in [('A', 'B', 1), ('B', 'A', -1)]
            for _ in range(40)]


class MatchupTests(unittest.TestCase):
    def test_opponent_adjustment_shrinkage_and_identity(self):
        model = fit(rows(), CUTOFF, [SOURCE])
        self.assertGreater(matchup_epa(model, 'A', 'B', 'pass'), 0)
        self.assertLess(matchup_epa(model, 'A', 'B', 'pass'), 1)
        self.assertFalse(model['forecast_supported'])
        with self.assertRaises(ValueError):
            matchup_epa(model, 'NEW', 'B', 'run')

    def test_future_results_do_not_change_fit(self):
        expected = fit(rows(), CUTOFF, [SOURCE])
        future = copy.deepcopy(rows())
        for row in future:
            row.update(game_start_utc=CUTOFF, epa='999')
        actual = fit(rows()+future, CUTOFF, [SOURCE])
        self.assertEqual(actual['effects'], expected['effects'])
        self.assertEqual(actual['opportunities'], expected['opportunities'])
        self.assertEqual(actual['coverage']['excluded:at_or_after_cutoff'], len(future))

    def test_missing_game_time_blocks(self):
        data = rows()
        del data[0]['game_start_utc']
        with self.assertRaises(ValueError):
            fit(data, CUTOFF, [SOURCE])

    def test_incomplete_target_credited_and_sack_not_attempt(self):
        data = rows()
        data[0]['complete_pass'] = '0'
        data[1]['sack'] = '1'
        model = fit(data, CUTOFF, [SOURCE])
        target = next(x for x in model['opportunities'] if x['team']=='A' and x['role']=='target')
        self.assertEqual(target['counts']['wr'], 39)

    def test_unknown_availability_and_post_cutoff_evidence_block(self):
        model = fit(rows(), CUTOFF, [SOURCE])
        for status in ('unknown', 'out'):
            with self.assertRaises(ValueError):
                workload_shares(model, 'A', 'target', [dict(id='wr', availability=status)], {'wr':1}, [SOURCE])
        late = dict(SOURCE, retrieved_at='2023-01-02T00:00:00Z')
        with self.assertRaises(ValueError):
            workload_shares(model, 'A', 'target', [dict(id='wr', availability='reviewed_active')], {'wr':1}, [late])

    def test_removed_volume_stays_unallocated(self):
        model = fit(rows(), CUTOFF, [SOURCE])
        result = workload_shares(model, 'A', 'target',
            [dict(id='new', availability='reviewed_active')], {'new':1}, [SOURCE])
        self.assertAlmostEqual(sum(result['shares'].values())+result['unallocated_share'], 1)
        self.assertGreater(result['unallocated_share'], 0)
        self.assertFalse(result['forecast_supported'])

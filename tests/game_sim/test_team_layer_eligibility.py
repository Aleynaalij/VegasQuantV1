"""TEAM_LAYER_PROTOCOL section 1 on synthetic schedules (no real season data)."""
import unittest
from datetime import timedelta
from research.game_sim.team_layer import eligibility as el


def game(gid, day, time='13:00', result='3', home='24', away='21', **extra):
    return dict(game_id=gid, game_type='REG', gameday=day, gametime=time,
                result=result, home_score=home, away_score=away, **extra)


class KickoffTests(unittest.TestCase):
    def test_eastern_wall_time_with_dst(self):
        # 1 PM Eastern is 17:00 UTC in daylight time and 18:00 UTC in standard time.
        self.assertEqual(el.kickoff(game('a', '2022-10-02')).hour, 17)
        self.assertEqual(el.kickoff(game('b', '2022-12-04')).hour, 18)

    def test_missing_time_is_refused_not_guessed(self):
        with self.assertRaises(ValueError):
            el.kickoff(game('a', '2022-10-02', time=''))


class ExclusionTests(unittest.TestCase):
    def test_reasons_are_generated_from_sources(self):
        rows = [game('ok', '2022-10-02'),
                game('no_result', '2023-01-02', result='NA', home='', away=''),
                game('no_end', '2022-10-09'),
                game('not_in_pbp', '2022-10-16'),
                dict(game('pre', '2022-08-13'), game_type='PRE')]
        pbp_ids = {'ok', 'no_end', 'only_pbp'}
        out = el.exclusions(rows, pbp_end_ids={'ok'}, pbp_game_ids=pbp_ids)
        self.assertEqual(out, [
            dict(game_id='no_end', reason=el.REASON_NO_END),
            dict(game_id='no_result', reason=el.REASON_NO_RESULT),
            dict(game_id='not_in_pbp', reason=el.REASON_NOT_IN_PBP),
            dict(game_id='only_pbp', reason=el.REASON_NOT_IN_GAMES),
        ])

    def test_status_marking_unfinished_game_is_excluded(self):
        rows = [game('susp', '2022-10-02', status='Suspended')]
        out = el.exclusions(rows, {'susp'}, {'susp'})
        self.assertEqual(out, [dict(game_id='susp', reason=el.REASON_NO_RESULT)])


class AdmissionTests(unittest.TestCase):
    def setUp(self):
        self.target = el.kickoff(game('t', '2022-10-09'))  # Sunday 1 PM ET

    def test_24_hour_rule_refuses_saturday_night_for_sunday_one_pm(self):
        saturday = el.kickoff(game('s', '2022-10-08', time='20:15'))
        self.assertEqual(el.admit(saturday, self.target, 's', set())[:2], (False, 'within 24 hours of target'))

    def test_exactly_24_hours_is_admitted_with_recency_weight(self):
        ok, reason, w = el.admit(self.target - timedelta(hours=24), self.target, 'e', set())
        self.assertTrue(ok)
        self.assertAlmostEqual(w, 2 ** (-1 / 120))

    def test_age_limit_and_half_life(self):
        self.assertEqual(el.admit(self.target - timedelta(days=731), self.target, 'e', set())[1], 'older than 730 days')
        self.assertAlmostEqual(el.admit(self.target - timedelta(days=120), self.target, 'e', set())[2], 0.5)

    def test_excluded_game_never_admitted(self):
        self.assertEqual(el.admit(self.target - timedelta(days=7), self.target, 'x', {'x'})[1], 'excluded')

    def test_every_admitted_row_satisfies_rule_for_every_target(self):
        days = ['2022-09-11', '2022-09-18', '2022-09-24', '2022-09-25', '2022-10-02']
        times = ['13:00', '20:20', '20:15', '13:00', '16:25']
        sched = {f'g{i}': el.kickoff(game(f'g{i}', d, t)) for i, (d, t) in enumerate(zip(days, times))}
        excluded = [dict(game_id='g1', reason=el.REASON_NO_END)]
        for target in sched:
            admitted, refused = el.evidence_for(target, sched, excluded)
            el.check_cutoff(sched[target], [dict(game_id=g, kickoff=sched[g]) for g in admitted])
            self.assertNotIn('g1', admitted)
            self.assertEqual(len(admitted) + sum(refused.values()), len(sched) - 1)
        # g2 (Sat 8:15 PM) is too close to g3 (Sun 1 PM): refused and counted; g1 is excluded and
        # g4 is later than the target.
        admitted, refused = el.evidence_for('g3', sched, excluded)
        self.assertEqual(set(admitted), {'g0'})
        self.assertEqual(dict(refused), {'within 24 hours of target': 1, 'excluded': 1, 'at or after target': 1})

    def test_check_cutoff_detects_a_leak(self):
        with self.assertRaises(ValueError):
            el.check_cutoff(self.target, [dict(game_id='leak', kickoff=self.target - timedelta(hours=3))])


if __name__ == '__main__':
    unittest.main()

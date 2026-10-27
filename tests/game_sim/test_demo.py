import copy
import unittest
from research.game_sim.demo import build_demo, validate, ball_x

class DemoTests(unittest.TestCase):
    def test_reproducible(self):
        self.assertEqual(build_demo(), build_demo())

    def test_score_conservation(self):
        run = build_demo()
        self.assertEqual(sum(e['score_delta']['home'] for e in run['replay']['events']), 7)
        self.assertEqual(run['box_score'], {'home': 7, 'away': 0})

    def test_end_switch_coordinate(self):
        a = build_demo()['replay']['events'][0]['before']
        self.assertEqual(ball_x(a), 25)
        a['home_defends'] = 'right'
        self.assertEqual(ball_x(a), 75)
        a['possession'] = 'away'
        self.assertEqual(ball_x(a), 25)

    def test_corruptions_rejected(self):
        mutations = [
            lambda r: r.update(mode='pregame'),
            lambda r: r.update(runs={'requested': 50000, 'actual': 50000}),
            lambda r: r['replay']['events'][1]['before'].update(clock_s=900),
            lambda r: r['replay']['events'][0]['after'].update(clock_s=901),
            lambda r: r['replay']['events'][0].update(ball_start_x=60),
            lambda r: r['replay']['events'][0].update(score_delta={'home': 6, 'away': 0}),
            lambda r: r['box_score'].update(home=8),
            lambda r: r['replay']['events'][0]['participants'][0].update(player_id='real-player'),
        ]
        for mutate in mutations:
            run = copy.deepcopy(build_demo())
            mutate(run)
            with self.subTest(mutate=mutate), self.assertRaises(ValueError):
                validate(run)

if __name__ == '__main__':
    unittest.main()

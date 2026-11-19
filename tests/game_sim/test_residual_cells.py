"""v0.2.21 residual cells (RESIDUAL_BACKOFF_PROTOCOL.md) on synthetic opportunity chains."""
import unittest
from collections import Counter
from research.game_sim.timeout_cells import residual_cells, MIN


def ops(spec):
    """spec: list of (chain, outcome, count)."""
    out = []
    for path, outcome, count in spec:
        out += [(path, outcome, None)] * count
    return out


def replay(cells, opportunities):
    expected, observed = 0.0, 0
    for path, outcome, _ in opportunities:
        cell = next(cells[k] for k in path if cells.get(k, {}).get('n', 0) >= MIN)
        expected += (cell.get('offense', 0) + cell.get('defense', 0)) / cell['n']
        observed += outcome != 'none'
    return expected, observed


class ResidualCellTests(unittest.TestCase):
    def test_thin_specific_cells_no_longer_inherit_their_populous_siblings(self):
        common = ['b|both|tied|1', 'b|both|tied', 'b|both|tied', 'b|both']
        rare = ['b|both|behind1-3|3', 'b|both|behind1-3', 'b|both|behind', 'b|both']
        rare2 = ['b|both|behind4-8|3', 'b|both|behind4-8', 'b|both|behind', 'b|both']
        o = ops([(common, 'none', 90), (common, 'offense', 10), (rare, 'offense', 10), (rare, 'none', 10),
                 (rare2, 'offense', 6), (rare2, 'none', 14)])
        cells, left = residual_cells(o, 'running')
        self.assertEqual(left, 0)
        # The shared parent holds only the 40 rare opportunities, not the 100 common ones.
        self.assertEqual(cells['b|both|behind']['n'], 40)
        exp, obs = replay(cells, o)
        self.assertAlmostEqual(exp, obs)

    def test_replay_conserves_calls_exactly_without_terminal_or_role_fallback(self):
        chains = [[f'b|both|{l}|{f}', f'b|both|{l}', 'b|both|ahead' if 'ahead' in l else 'b|both|behind', 'b|both']
                  for l in ('ahead1-3', 'ahead4-8', 'behind1-3', 'behind9+') for f in '0123']
        o = []
        for i, c in enumerate(chains):
            o += ops([(c, 'offense', i % 5), (c, 'defense', i % 3), (c, 'none', 8 + i)])
        cells, left = residual_cells(o, 'running')
        self.assertEqual(left, 0)
        exp, obs = replay(cells, o)
        self.assertAlmostEqual(exp, obs)

    def test_terminal_floor_below_min_uses_full_count_for_leftovers(self):
        big = ['last120@h1|offense|x|1', 'last120@h1|offense|x', 'last120@h1|offense|x', 'last120@h1|offense', 'le300@h1|offense']
        tiny = ['last300@h1|offense|y|1', 'last300@h1|offense|y', 'last300@h1|offense|y', 'last300@h1|offense', 'le300@h1|offense']
        o = ops([(big, 'none', 40), (tiny, 'offense', 3), (tiny, 'none', 2)])
        cells, left = residual_cells(o, 'running')
        self.assertEqual(left, 0)
        self.assertEqual(cells['le300@h1|offense']['n'], 45)  # full count, not the residual 5

    def test_unresolvable_opportunities_are_counted_never_invented(self):
        o = ops([(['b|both|tied|1', 'b|both|tied', 'b|both|tied', 'b|both'], 'none', 5)])
        _, left = residual_cells(o, 'running')
        self.assertEqual(left, 5)


if __name__ == '__main__':
    unittest.main()

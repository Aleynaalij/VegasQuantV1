"""Section 2 effects for one target from per-game aggregates, algebraically identical to effects.py.

`effects.py` iterates over individual plays; here plays sharing (offense, defense) or a pass-rate
cell are pre-summed per game, then weighted by that game's recency weight. Every sum the play-level
estimator forms is a sum over these groups, so the ridge, residuals, expected rates, fallback levels
and logit conversion are the same quantities. `test_team_layer_fit.py` checks agreement with
`effects.py` on play lists.
"""
from collections import Counter, defaultdict

from .effects import ITERATIONS, MIN_CELL, RATE_BOUNDS, RIDGE_PLAYS, logit
from .eligibility import evidence_for


def ridge_pairs(pairs):
    """pairs: {(offense, defense): [sum of w*residual, sum of w]} -> (offense, defense) effects."""
    teams = sorted({o for o, _ in pairs} | {d for _, d in pairs})
    off, dfn = dict.fromkeys(teams, 0.0), dict.fromkeys(teams, 0.0)
    by_off, by_def = defaultdict(list), defaultdict(list)
    for (o, d), (wr, w) in sorted(pairs.items()):
        by_off[o].append((d, wr, w))
        by_def[d].append((o, wr, w))
    for _ in range(ITERATIONS):
        for t in teams:
            rows = by_off[t]
            off[t] = sum(wr - w * dfn[d] for d, wr, w in rows) / (sum(w for _, _, w in rows) + RIDGE_PLAYS)
        for t in teams:
            rows = by_def[t]
            dfn[t] = sum(wr - w * off[o] for o, wr, w in rows) / (sum(w for _, _, w in rows) + RIDGE_PLAYS)
    return off, dfn


def gain_effects(games):
    """games: [(weight, {(o, d, kind): [n, sum_gain]})]."""
    num, den = Counter(), Counter()
    for w, agg in games:
        for (_, _, kind), (n, s) in agg.items():
            num[kind] += w * s
            den[kind] += w * n
    mean = {k: (num[k] / den[k] if den[k] else 0.0) for k in ('run', 'pass')}
    pairs = defaultdict(lambda: [0.0, 0.0])
    for w, agg in games:
        for (o, d, kind), (n, s) in agg.items():
            p = pairs[(o, d)]
            p[0] += w * (s - n * mean[kind])
            p[1] += w * n
    return ridge_pairs(pairs), mean


def rate_effects(games):
    """games: [(weight, {(o, d, down, band, half, lead): [n, passes]})] -> g_o, h_d, counts."""
    keys = (lambda c: c, lambda c: c[:2], lambda c: c[:1])
    tables = [(Counter(), Counter()) for _ in keys]
    for w, agg in games:
        for (o, d, *cell), (n, passes) in agg.items():
            for key, (num, den) in zip(keys, tables):
                k = key(tuple(cell))
                den[k] += w * n
                num[k] += w * passes

    expected, levels = {}, Counter()

    def rate_for(cell):
        if cell not in expected:
            for level, (key, (num, den)) in enumerate(zip(keys, tables)):
                k = key(cell)
                if den[k] >= MIN_CELL or level == len(keys) - 1:
                    expected[cell] = (num[k] / den[k] if den[k] else 0.0, level)
                    break
        return expected[cell]

    pairs = defaultdict(lambda: [0.0, 0.0])
    mean_off, mean_def = defaultdict(lambda: [0.0, 0.0]), defaultdict(lambda: [0.0, 0.0])
    for w, agg in games:
        for (o, d, *cell), (n, passes) in agg.items():
            e, level = rate_for(tuple(cell))
            levels[level] += n
            p = pairs[(o, d)]
            p[0] += w * (passes - n * e)
            p[1] += w * n
            mean_off[o][0] += w * n * e
            mean_off[o][1] += w * n
            mean_def[d][0] += w * n * e
            mean_def[d][1] += w * n
    off_p, def_p = ridge_pairs(pairs)
    counts = Counter({f'cell_level_{k}': v for k, v in levels.items()})

    def convert(effects, means, side):
        out = {}
        for team, delta in effects.items():
            num, den = means[team]
            base = num / den if den else 0.5
            shifted = base + delta
            if not (RATE_BOUNDS[0] < base < RATE_BOUNDS[1] and RATE_BOUNDS[0] < shifted < RATE_BOUNDS[1]):
                out[team] = 0.0
                counts['rate_degenerate'] += 1
                counts[f'rate_degenerate:{side}:{team}'] += 1
            else:
                out[team] = logit(shifted) - logit(base)
        return out

    return convert(off_p, mean_off, 'offense'), convert(def_p, mean_def, 'defense'), counts


def target_effects(target, data):
    """All four effects for one target from rule-1 evidence, with support and refusal counts."""
    admitted, refused = evidence_for(target, data['schedule'], data['excluded'])
    gain_games = [(w, data['gain'][g]) for g, w in sorted(admitted.items()) if g in data['gain']]
    rate_games = [(w, data['rate'][g]) for g, w in sorted(admitted.items()) if g in data['rate']]
    (a_o, b_d), means = gain_effects(gain_games)
    g_o, h_d, counts = rate_effects(rate_games)
    support = defaultdict(lambda: dict(rate_plays=0, rate_weighted=0.0, gain_plays=0, gain_weighted=0.0))
    for kind, games in (('rate', rate_games), ('gain', gain_games)):
        for w, agg in games:
            for key, (n, _) in agg.items():
                for side, team in (('offense', key[0]), ('defense', key[1])):
                    s = support[f'{side}:{team}']
                    s[f'{kind}_plays'] += n
                    s[f'{kind}_weighted'] += w * n
    return dict(target=target, admitted_games=len(admitted), admitted=sorted(admitted),
                refused=dict(refused), a_o=a_o, b_d=b_d, g_o=g_o, h_d=h_d, gain_means=means,
                counts=dict(counts), support=dict(sorted(support.items())))


def game_coefficients(effects, home, away):
    """Per possession side: the offense's a_o, g_o and the opposing defense's b_d, h_d (0 if absent)."""
    def side(off, dfn):
        return dict(a_o=effects['a_o'].get(off, 0.0), g_o=effects['g_o'].get(off, 0.0),
                    b_d=effects['b_d'].get(dfn, 0.0), h_d=effects['h_d'].get(dfn, 0.0))
    return dict(home=side(home, away), away=side(away, home))

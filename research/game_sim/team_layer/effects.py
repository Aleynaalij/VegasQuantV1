"""Section 2: team gain and pass-rate effects (recency-weighted alternating ridge).

Reuses matchup.py's estimator (RIDGE_PLAYS = 100, 100 iterations) with the section-1 recency
weights. Plays are dicts with: offense, defense, kind ('run'|'pass'), gain (signed yards, sacks
negative, incompletions 0), down, distance, half (1|2), lead ('ahead'|'tied'|'behind') and w.
Kneels and spikes must already be excluded; scrambles are runs, as the source records them.
"""
import math
from collections import Counter, defaultdict

RIDGE_PLAYS = 100
ITERATIONS = 100
MIN_CELL = 30
RATE_BOUNDS = (0.01, 0.99)


def ridge(plays):
    """plays: [(offense, defense, residual, weight)] -> (offense effects, defense effects)."""
    teams = sorted({p[0] for p in plays} | {p[1] for p in plays})
    off, dfn = dict.fromkeys(teams, 0.0), dict.fromkeys(teams, 0.0)
    by_off, by_def = defaultdict(list), defaultdict(list)
    for o, d, r, w in plays:
        by_off[o].append((d, r, w))
        by_def[d].append((o, r, w))
    for _ in range(ITERATIONS):
        for t in teams:
            rows = by_off[t]
            off[t] = sum(w * (r - dfn[d]) for d, r, w in rows) / (sum(w for _, _, w in rows) + RIDGE_PLAYS)
        for t in teams:
            rows = by_def[t]
            dfn[t] = sum(w * (r - off[o]) for o, r, w in rows) / (sum(w for _, _, w in rows) + RIDGE_PLAYS)
    return off, dfn


def gain_effects(plays):
    """a_o, b_d in yards per gain play; residuals against each play's own group league mean."""
    means = {}
    for kind in ('run', 'pass'):
        group = [p for p in plays if p['kind'] == kind]
        total = sum(p['w'] for p in group)
        means[kind] = sum(p['w'] * p['gain'] for p in group) / total if total else 0.0
    return ridge([(p['offense'], p['defense'], p['gain'] - means[p['kind']], p['w']) for p in plays])


def band(distance):
    return '1-3' if distance <= 3 else '4-7' if distance <= 7 else '8+'


def expected_rates(plays):
    """Expected pass rate per play: down x band x half x lead, falling back to down x band, then
    down, when a cell has fewer than MIN_CELL weighted plays."""
    keys = [lambda p: (p['down'], band(p['distance']), p['half'], p['lead']),
            lambda p: (p['down'], band(p['distance'])),
            lambda p: (p['down'],)]
    tables = []
    for key in keys:
        num, den = defaultdict(float), defaultdict(float)
        for p in plays:
            k = key(p)
            den[k] += p['w']
            num[k] += p['w'] * (p['kind'] == 'pass')
        tables.append((key, num, den))
    out, levels = [], Counter()
    for p in plays:
        for level, (key, num, den) in enumerate(tables):
            k = key(p)
            if den[k] >= MIN_CELL or level == len(tables) - 1:
                out.append(num[k] / den[k] if den[k] else 0.0)
                levels[level] += 1
                break
    return out, levels


def logit(x):
    return math.log(x / (1 - x))


def rate_effects(plays):
    """g_o, h_d in logit units, plus counts (rate_degenerate, fallback levels)."""
    expected, levels = expected_rates(plays)
    off_p, def_p = ridge([(p['offense'], p['defense'], (p['kind'] == 'pass') - e, p['w'])
                          for p, e in zip(plays, expected)])
    mean_off, mean_def = defaultdict(lambda: [0.0, 0.0]), defaultdict(lambda: [0.0, 0.0])
    for p, e in zip(plays, expected):
        mean_off[p['offense']][0] += p['w'] * e
        mean_off[p['offense']][1] += p['w']
        mean_def[p['defense']][0] += p['w'] * e
        mean_def[p['defense']][1] += p['w']
    counts = Counter({f'cell_level_{k}': v for k, v in levels.items()})

    def convert(effects, means, side):
        out = {}
        for team, delta in effects.items():
            num, den = means[team]
            base = num / den if den else 0.5
            shifted = base + delta
            if not (RATE_BOUNDS[0] < base < RATE_BOUNDS[1] and RATE_BOUNDS[0] < shifted < RATE_BOUNDS[1]):
                # Never clamped to the boundary: the effect is dropped and counted.
                out[team] = 0.0
                counts['rate_degenerate'] += 1
                counts[f'rate_degenerate:{side}:{team}'] += 1
            else:
                out[team] = logit(shifted) - logit(base)
        return out

    return convert(off_p, mean_off, 'offense'), convert(def_p, mean_def, 'defense'), counts


def fit_effects(plays):
    """All four effects for one target's admitted evidence, with raw and weighted support."""
    a_o, b_d = gain_effects(plays)
    g_o, h_d, counts = rate_effects(plays)
    support = defaultdict(lambda: dict(plays=0, weighted=0.0))
    for p in plays:
        for side in ('offense', 'defense'):
            s = support[(side, p[side])]
            s['plays'] += 1
            s['weighted'] += p['w']
    return dict(a_o=a_o, b_d=b_d, g_o=g_o, h_d=h_d, counts=dict(counts),
                support={f'{side}:{team}': v for (side, team), v in sorted(support.items())})

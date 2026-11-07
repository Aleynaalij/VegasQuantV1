"""Section 7 metrics and decision rule, committed before any 2024 outcome is read.

Arms: A (zero coefficients) and D (team layer) from the paired shards; B, the existing historical
baseline (the empirical 2022 score distribution, as in evaluate.py); C, the assumed market normal
with mean nflverse `spread_line` / `total_line` and SD equal to the 2022-2023 REG residual SD.

- CRPS for margin and total (discrete ensembles use evaluate.crps; the normal uses its closed form).
- Brier for the home win with ties counted as half: outcome 1 / 0 / 0.5, and a forecast of
  P(win) + 0.5 * P(tie).
- 80% interval coverage: p10 <= y <= p90 for ensembles; mean +/- 1.2816 SD for the normal.
- Paired game-level bootstrap: 10,000 resamples, seed 20261028, 95% percentile intervals, one set
  of resampled indices shared by every difference.
"""
import argparse
import csv
import gzip
import json
import math
import random
from pathlib import Path

from ..batch import canonical, distribution
from ..evaluate import crps, scores

BOOT = 10000
BOOT_SEED = 20261028
Z80 = 1.2815515655446004


def normal_crps(mu, sd, y):
    z = (y - mu) / sd
    cdf = 0.5 * (1 + math.erf(z / math.sqrt(2)))
    pdf = math.exp(-z * z / 2) / math.sqrt(2 * math.pi)
    return sd * (z * (2 * cdf - 1) + 2 * pdf - 1 / math.sqrt(math.pi))


def normal_cdf(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


EXPECTED_GAMES = 272
RUNS = 2000
MC_BOOT = 200
MC_SEED = 20261107


def load_shards(folder, targets=None):
    """Shards, failing closed (v0.3.1) on any hash, coverage or run-count problem."""
    import hashlib
    index = json.loads((Path(folder) / 'shards.json').read_text())
    rows = []
    for shard in sorted(index, key=int):
        body = gzip.decompress((Path(folder) / f'shard-{int(shard):02d}.json.gz').read_bytes())
        if hashlib.sha256(body).hexdigest() != index[shard]['sha256']:
            raise ValueError(f'shard {shard} hash does not match shards.json')
        part = json.loads(body)
        if len(part) != index[shard]['games']:
            raise ValueError(f'shard {shard} game count mismatch')
        rows += part
    rows = sorted(rows, key=lambda r: r['index'])
    ids, idx = [r['game_id'] for r in rows], [r['index'] for r in rows]
    if len(rows) != EXPECTED_GAMES or len(set(ids)) != len(ids) or idx != list(range(EXPECTED_GAMES)):
        raise ValueError('shards do not cover 272 unique games with indices 0..271')
    if targets is not None and ids != list(targets):
        raise ValueError('shard games do not match the target list')
    for r in rows:
        for arm in ('A', 'D'):
            runs = r['arms'][arm]['runs']
            if runs != dict(requested=RUNS, actual=RUNS, failed=0):
                raise ValueError(f"{r['game_id']} arm {arm} incomplete or failed: {runs}")
    return rows, index


def _crps_counts(values, counts, y):
    """CRPS of a discrete distribution (sorted support values with counts), O(k)."""
    import numpy as np
    n = counts.sum()
    p = counts / n
    first = float((np.abs(values - y) * p).sum())
    # E|X - X'| = 2 * sum_{i<j} p_i p_j (v_j - v_i), via cumulative sums.
    cum_p = np.cumsum(p)
    cum_pv = np.cumsum(p * values)
    pair = float(2 * (p[1:] * (values[1:] * cum_p[:-1] - cum_pv[:-1])).sum())
    return first - 0.5 * pair


def _quantile_counts(values, counts, p):
    """evaluate/batch.distribution's interpolated quantile, on (sorted support, counts)."""
    import numpy as np
    n = int(counts.sum())
    rank = p * (n - 1)
    lo, hi = math.floor(rank), math.ceil(rank)
    cum = np.cumsum(counts)
    v_lo = values[int(np.searchsorted(cum, lo + 1))]
    v_hi = values[int(np.searchsorted(cum, hi + 1))]
    return v_lo + (v_hi - v_lo) * (rank - lo)


def mc_se(dist, y, rng, win=None):
    """Run-level bootstrap Monte Carlo SEs for one game's market, from its stored distribution.

    One set of MC_BOOT multinomial resamples per (game, arm, market), in the same order as v0.3.1,
    so the CRPS SE is unchanged. v0.3.1 reporting follow-up (Elo 6708959141): the same resamples
    also give the SE of the 80% coverage indicator and, for the margin, of P(home) and the Brier
    score. These are Monte Carlo uncertainty only, separate from the game-level bootstrap.
    """
    import numpy as np
    values = np.array([b['lo'] for b in dist['bins']], dtype=float)
    counts = np.array([b['count'] for b in dist['bins']], dtype=float)
    draws = rng.multinomial(int(counts.sum()), counts / counts.sum(), size=MC_BOOT).astype(float)
    stats = {'crps': [], 'inside80': []}
    if win is not None:
        stats.update(p_home=[], brier=[])
    for d in draws:
        stats['crps'].append(_crps_counts(values, d, y))
        stats['inside80'].append(float(_quantile_counts(values, d, .1) <= y <= _quantile_counts(values, d, .9)))
        if win is not None:
            n = d.sum()
            ph = (d[values > 0].sum() + 0.5 * d[values == 0].sum()) / n
            stats['p_home'].append(ph)
            stats['brier'].append((ph - win) ** 2)

    def sd(v):
        m = sum(v) / len(v)
        return math.sqrt(sum((x - m) ** 2 for x in v) / (len(v) - 1))
    return {k: sd(v) for k, v in stats.items()}


def p_home_se(home_win, tie, n):
    """Analytic SE of tie-adjusted P(home): each run scores 1, 0.5 or 0 (Elo 6708959141)."""
    p = home_win / n + 0.5 * tie / n
    second = home_win / n + 0.25 * tie / n
    return math.sqrt(max(second - p * p, 0.0) / n)


def market_sd(games_rows):
    res_m, res_t = [], []
    for r in games_rows:
        if r.get('game_type') == 'REG' and r.get('season') in ('2022', '2023') and r.get('result') not in ('', 'NA', None):
            res_m.append(float(r['result']) - float(r['spread_line']))
            res_t.append(float(r['total']) - float(r['total_line']))
    sd = lambda v: math.sqrt(sum((x - sum(v) / len(v)) ** 2 for x in v) / (len(v) - 1))
    return sd(res_m), sd(res_t), len(res_m)


def interval(vals):
    s = sorted(vals)
    return [s[int(.025 * (len(s) - 1))], s[int(.975 * (len(s) - 1))]]


def evaluate(folder, games_path, training_path, targets=None):
    import numpy as np
    rows, index = load_shards(folder, targets)
    mc_rng = np.random.default_rng(MC_SEED)
    with open(games_path, newline='', encoding='utf-8-sig') as f:
        games = list(csv.DictReader(f))
    sched = {r['game_id']: r for r in games if r.get('game_type') == 'REG'}
    sd_m, sd_t, n_sd = market_sd(games)
    train, train_sha = scores(training_path)
    baseline = {k: distribution([h - a if k == 'margin' else h + a for h, a in train.values()]) for k in ('margin', 'total')}
    base_win = sum(h > a for h, a in train.values()) / len(train) + 0.5 * sum(h == a for h, a in train.values()) / len(train)
    per_game, failures = [], {}
    for r in rows:
        g = sched[r['game_id']]
        h, a = int(g['home_score']), int(g['away_score'])
        y = dict(margin=h - a, total=h + a)
        win = 1.0 if h > a else 0.0 if h < a else 0.5
        out = dict(game_id=r['game_id'], index=r['index'], home=h, away=a)
        for arm in ('A', 'D'):
            s = r['arms'][arm]
            n = s['runs']['actual']
            failures[arm] = failures.get(arm, 0) + s['runs']['failed']
            p = s['home_win'] / n + 0.5 * s['tie'] / n
            se = dict(s['mc_se'], p_home=p_home_se(s['home_win'], s['tie'], n))
            out[arm] = dict(brier=(p - win) ** 2, p_home=p, mc_se=se)
            for m in ('margin', 'total'):
                d = s[m]
                boot = mc_se(d, y[m], mc_rng, win if m == 'margin' else None)
                se[f'{m}_crps'] = boot['crps']
                se[f'{m}_inside80'] = boot['inside80']
                if m == 'margin':
                    se['p_home_bootstrap'] = boot['p_home']
                    se['brier'] = boot['brier']
                out[arm][m] = dict(crps=crps(d, y[m]), inside80=d['quantiles']['p10'] <= y[m] <= d['quantiles']['p90'], mean=d['mean'])
        out['B'] = dict(brier=(base_win - win) ** 2)
        for m in ('margin', 'total'):
            out['B'][m] = dict(crps=crps(baseline[m], y[m]), inside80=baseline[m]['quantiles']['p10'] <= y[m] <= baseline[m]['quantiles']['p90'])
        mu_m, mu_t = float(g['spread_line']), float(g['total_line'])
        p_c = normal_cdf(mu_m / sd_m)
        out['C'] = dict(brier=(p_c - win) ** 2,
                        margin=dict(crps=normal_crps(mu_m, sd_m, y['margin']), inside80=abs(y['margin'] - mu_m) <= Z80 * sd_m),
                        total=dict(crps=normal_crps(mu_t, sd_t, y['total']), inside80=abs(y['total'] - mu_t) <= Z80 * sd_t))
        per_game.append(out)
    n = len(per_game)
    mean = lambda f: sum(f(g) for g in per_game) / n
    summary = {arm: dict(margin_crps=mean(lambda g: g[arm]['margin']['crps']), total_crps=mean(lambda g: g[arm]['total']['crps']),
                         brier=mean(lambda g: g[arm]['brier']),
                         coverage80_margin=mean(lambda g: g[arm]['margin']['inside80']), coverage80_total=mean(lambda g: g[arm]['total']['inside80']))
               for arm in ('A', 'B', 'C', 'D')}
    diffs = {
        'D-A margin_crps': [g['D']['margin']['crps'] - g['A']['margin']['crps'] for g in per_game],
        'D-A total_crps': [g['D']['total']['crps'] - g['A']['total']['crps'] for g in per_game],
        'D-A brier': [g['D']['brier'] - g['A']['brier'] for g in per_game],
        'D-C margin_crps': [g['D']['margin']['crps'] - g['C']['margin']['crps'] for g in per_game],
        'D-C total_crps': [g['D']['total']['crps'] - g['C']['total']['crps'] for g in per_game],
        'D-C brier': [g['D']['brier'] - g['C']['brier'] for g in per_game],
        'D-B margin_crps': [g['D']['margin']['crps'] - g['B']['margin']['crps'] for g in per_game],
        'D-B total_crps': [g['D']['total']['crps'] - g['B']['total']['crps'] for g in per_game],
    }
    rng = random.Random(BOOT_SEED)
    boots = {k: [] for k in diffs}
    for _ in range(BOOT):
        idx = [rng.randrange(n) for _ in range(n)]
        for k, v in diffs.items():
            boots[k].append(sum(v[i] for i in idx) / n)
    paired = {k: dict(mean=sum(v) / n, ci95=interval(boots[k])) for k, v in diffs.items()}
    cov_ok = lambda arm: all(0.75 <= summary[arm][c] <= 0.85 for c in ('coverage80_margin', 'coverage80_total'))
    a1 = paired['D-A margin_crps']['mean'] < 0 and paired['D-A margin_crps']['ci95'][1] < 0
    a2 = paired['D-A total_crps']['ci95'][0] <= 0
    a3 = cov_ok('D')
    decision_a = dict(passed=a1 and a2 and a3, margin_crps_better_ci_excludes_0=a1,
                      total_crps_not_significantly_worse=a2, coverage_within_5_points=a3)
    b = dict(margin_not_worse_than_C=paired['D-C margin_crps']['ci95'][0] <= 0,
             total_not_worse_than_C=paired['D-C total_crps']['ci95'][0] <= 0,
             brier_not_worse_than_C=paired['D-C brier']['ci95'][0] <= 0)
    decision_b = dict(considered=decision_a['passed'], **b,
                      statistical_criteria_met=decision_a['passed'] and all(b.values()),
                      owner_approval='required separately; never implied by this report')
    se = {arm: {k: mean(lambda g, k=k: g[arm]['mc_se'][k]) for k in ('margin_mean', 'total_mean', 'p_home', 'p_home_bootstrap', 'brier', 'margin_crps', 'total_crps', 'margin_inside80', 'total_inside80')} for arm in ('A', 'D')}
    return dict(scope='RESEARCH EVALUATION ONLY; no approval, forecast, publication or member release',
                games=n, failures=failures, market=dict(sd_margin=sd_m, sd_total=sd_t, residual_games=n_sd,
                note='Assumed normal on nflverse retrospective closing lines; not verified timestamped prices'),
                baseline=dict(kind='empirical 2022 REG score distribution (evaluate.py)', training_sha256=train_sha, games=len(train)),
                bootstrap=dict(resamples=BOOT, seed=BOOT_SEED), summary=summary, paired=paired,
                decision_A=decision_a, decision_B=decision_b, mean_mc_se=se, shards=index, per_game=per_game)


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--folder', required=True)
    p.add_argument('--games', required=True)
    p.add_argument('--training', required=True)
    a = p.parse_args()
    effects = json.loads(gzip.decompress((Path(a.folder) / 'effects.json.gz').read_bytes()))
    r = evaluate(a.folder, a.games, a.training, targets=[e['target'] for e in effects['effects']])
    (Path(a.folder) / 'evaluation.json.gz').write_bytes(gzip.compress(canonical(r), mtime=0))
    print(json.dumps({k: r[k] for k in ('games', 'failures', 'market', 'summary', 'paired', 'decision_A', 'decision_B', 'mean_mc_se')}, indent=1))

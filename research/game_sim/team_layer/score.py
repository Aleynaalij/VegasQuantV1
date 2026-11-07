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


def load_shards(folder):
    index = json.loads((Path(folder) / 'shards.json').read_text())
    rows = []
    for shard in sorted(index, key=int):
        rows += json.loads(gzip.decompress((Path(folder) / f'shard-{int(shard):02d}.json.gz').read_bytes()))
    return sorted(rows, key=lambda r: r['index']), index


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


def evaluate(folder, games_path, training_path):
    rows, index = load_shards(folder)
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
            out[arm] = dict(brier=(p - win) ** 2, p_home=p, mc_se=s['mc_se'])
            for m in ('margin', 'total'):
                d = s[m]
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
    se = {arm: dict(margin_mean=mean(lambda g: g[arm]['mc_se']['margin_mean']), total_mean=mean(lambda g: g[arm]['mc_se']['total_mean'])) for arm in ('A', 'D')}
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
    r = evaluate(a.folder, a.games, a.training)
    (Path(a.folder) / 'evaluation.json.gz').write_bytes(gzip.compress(canonical(r), mtime=0))
    print(json.dumps({k: r[k] for k in ('games', 'failures', 'market', 'summary', 'paired', 'decision_A', 'decision_B', 'mean_mc_se')}, indent=1))

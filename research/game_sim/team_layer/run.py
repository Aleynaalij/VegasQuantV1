"""Section 6: paired arms A (zero coefficients) and D (team layer) over every 2024 REG game.

- Games are sorted by game_id; game i uses per-game seed 1701 + i, and run j of that game uses
  seed (1701 + i) + j, the engine's batch convention. Arms A and D share every seed.
- 2,000 runs per game per arm, old opening-TD OT (`both_possessions=False`).
- Deterministic shards of 34 games run across 4 processes. Each shard writes a canonical JSON
  checkpoint whose SHA256 goes into the index. On resume, a completed shard is recomputed and must
  reproduce its hash before it is accepted.
- No subset, no reduced run count, no silent drop: every failed run is kept with its message.
"""
import argparse
import gzip
import hashlib
import json
import math
import time
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from ..batch import canonical, distribution, game
from ..model import Sampler
from .data import load
from .eligibility import check_cutoff
from .fit import game_coefficients, target_effects
from .sampler import factory

RUNS = 2000
SEED = 1701
SHARD = 34
PROCESSES = 4
ZERO = dict(a_o=0.0, g_o=0.0, b_d=0.0, h_d=0.0)


def summarize(results, failures):
    home = [r['home'] for r in results]
    away = [r['away'] for r in results]
    margins = [h - a for h, a in zip(home, away)]
    totals = [h + a for h, a in zip(home, away)]
    n = len(results)

    def se(values):
        m = sum(values) / n
        return math.sqrt(sum((v - m) ** 2 for v in values) / (n - 1) / n) if n > 1 else None
    team = Counter()
    for r in results:
        team.update({k: v for k, v in r['fallbacks'].items() if isinstance(k, str) and k.startswith('team:')})
    return dict(runs=dict(requested=RUNS, actual=n, failed=RUNS - n), failures=dict(failures),
                margin=distribution(margins), total=distribution(totals),
                home_win=sum(m > 0 for m in margins), tie=sum(m == 0 for m in margins),
                mc_se=dict(margin_mean=se(margins), total_mean=se(totals)), team_counts=dict(team))


def run_game(model, tables, index, coefficients):
    out = {}
    for arm, coeffs in (('A', dict(home=ZERO, away=ZERO)), ('D', coefficients)):
        make = factory(coeffs) if arm == 'D' else None
        results, failures = [], Counter()
        for j in range(RUNS):
            try:
                results.append(game(model, SEED + index + j, both_possessions=False, prepared_tables=tables, sampler_factory=make))
            except ValueError as e:
                failures[str(e)] += 1
        out[arm] = summarize(results, failures)
    return out


def run_shard(args):
    model_path, shard, games = args
    model = json.loads(gzip.decompress(Path(model_path).read_bytes()))
    tables = Sampler(model, SEED).tables
    rows = []
    for g in games:
        rows.append(dict(game_id=g['game_id'], index=g['index'], home=g['home'], away=g['away'],
                         coefficients=g['coefficients'], arms=run_game(model, tables, g['index'], g['coefficients'])))
    return shard, rows


def prepare(games_path, pbp_paths):
    data = load(games_path, pbp_paths)
    plan, effects_out = [], []
    for index, target in enumerate(data['targets']):
        e = target_effects(target, data)
        check_cutoff(data['schedule'][target], [dict(game_id=g, kickoff=data['schedule'][g]) for g in e['admitted']])
        home, away = data['teams'][target]
        coeffs = game_coefficients(e, home, away)
        plan.append(dict(game_id=target, index=index, home=home, away=away, coefficients=coeffs))
        effects_out.append({k: v for k, v in e.items() if k != 'admitted'} | dict(home=home, away=away, coefficients=coeffs))
    meta = dict(targets=len(data['targets']), excluded=data['excluded'], games_sha256=data['games_sha256'],
                pbp_sources=data['pbp_sources'], counts=data['counts'])
    return plan, effects_out, meta


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--model', required=True)
    p.add_argument('--games', required=True)
    p.add_argument('--pbp', nargs='+', required=True)
    p.add_argument('--out', required=True)
    a = p.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    started = time.time()
    plan, effects_out, meta = prepare(a.games, a.pbp)
    (out / 'effects.json.gz').write_bytes(gzip.compress(canonical(dict(meta=meta, effects=effects_out)), mtime=0))
    shards = [(a.model, s, plan[i:i + SHARD]) for s, i in enumerate(range(0, len(plan), SHARD))]
    index_path = out / 'shards.json'
    index = json.loads(index_path.read_text()) if index_path.exists() else {}
    todo = [x for x in shards if str(x[1]) not in index]
    if index and todo != shards:
        # Resume: a completed shard must reproduce its recorded hash before the run continues.
        first = next(x for x in shards if str(x[1]) in index)
        _, rows = run_shard(first)
        if hashlib.sha256(canonical(rows)).hexdigest() != index[str(first[1])]['sha256']:
            raise SystemExit('resumed shard does not reproduce its checkpoint hash')
    with ProcessPoolExecutor(PROCESSES) as pool:
        for shard, rows in pool.map(run_shard, todo):
            body = canonical(rows)
            (out / f'shard-{shard:02d}.json.gz').write_bytes(gzip.compress(body, mtime=0))
            index[str(shard)] = dict(games=len(rows), sha256=hashlib.sha256(body).hexdigest(), finished=time.time())
            index_path.write_text(json.dumps(index, indent=1, sort_keys=True))
            print(f'shard {shard} done ({len(rows)} games) {time.time() - started:.0f}s', flush=True)
    print(json.dumps(dict(shards=len(index), seconds=round(time.time() - started))), flush=True)


if __name__ == '__main__':
    main()

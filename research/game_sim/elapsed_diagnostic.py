"""Late-play elapsed diagnostic (frozen before it is run; descriptive only, fits nothing).

Follows v0.2.21 (`RESIDUAL_BACKOFF_PROTOCOL.md`, result): the estimator now conserves calls, and the
remaining gap is fewer late snaps. Question: does each late play use more game clock in the sim
than in the source, and on which kind of play?

Measured on both sides as the clock difference from one scrimmage snap to the next snap in the same
period and the same game (source: consecutive scrimmage rows; sim: consecutive traced scrimmage
events), for snaps in Q2/Q4 with <=300 s left, grouped by the snap's band and play kind (run,
pass_complete, pass_incomplete, sack, kneel, spike, other) and by whether a timeout came in between.
Reported per group: count per game, mean seconds, and the share of gaps above 30 s.
Samples: sim = seeds 1701..2700 of the certified v0.2.21 batch, old OT, traced from the saved model;
source = all 2022 REG games. No thresholds, no pass/fail.
"""
import argparse, csv, gzip, io, json
from collections import defaultdict
from pathlib import Path
from .batch import game, Sampler
from .state import State
from .timeout_cells import stop_band
from .late_mix_diagnostic import source_kind, KINDS


def summarize(groups, games):
    out = {}
    for key, gaps in sorted(groups.items()):
        out[key] = dict(per_game=round(len(gaps) / games, 4), mean_seconds=round(sum(gaps) / len(gaps), 2),
                        share_over_30s=round(sum(g > 30 for g in gaps) / len(gaps), 4), n=len(gaps))
    return out


def source(path):
    raw = Path(path).read_bytes()
    body = gzip.decompress(raw) if raw[:2] == b'\x1f\x8b' else raw
    rows = [r for r in csv.DictReader(io.StringIO(body.decode('utf-8-sig'))) if r.get('season_type') == 'REG']
    games = len({r['game_id'] for r in rows})
    groups = defaultdict(list)
    snaps = []
    for r in rows:
        kind = source_kind(r)
        if kind == 'timeout':
            snaps.append(('timeout', r))
            continue
        if r.get('down') and r.get('yardline_100') and r.get('posteam') and r.get('quarter_seconds_remaining'):
            snaps.append(('snap', r))
    for idx, (tag, r) in enumerate(snaps):
        if tag != 'snap' or r['qtr'] not in ('2', '4'):
            continue
        clock = int(r['quarter_seconds_remaining'])
        if clock > 300:
            continue
        timeout = False
        for tag2, n in snaps[idx + 1:idx + 6]:
            if n['game_id'] != r['game_id'] or n['qtr'] != r['qtr']:
                break
            if tag2 == 'timeout':
                timeout = True
                continue
            gap = clock - int(n['quarter_seconds_remaining'])
            band = ('last10' if clock <= 10 else 'last30' if clock <= 30 else 'last120' if clock <= 120 else 'last300') + ('@h1' if r['qtr'] == '2' else '@h2')
            kind = source_kind(r)
            kind = kind if kind in KINDS else 'other'
            groups[f'{band}|{kind}|{"timeout" if timeout else "no_timeout"}'].append(max(0, gap))
            break
    return summarize(groups, games), games


def sim(model_path, seeds=range(1701, 2701)):
    model = json.loads(gzip.decompress(Path(model_path).read_bytes()))
    tables = Sampler(model, 1701).tables
    groups = defaultdict(list)
    for seed in seeds:
        events = game(model, seed, both_possessions=False, trace=True, prepared_tables=tables)['events']
        for k, e in enumerate(events):
            s = State(**{**e['before'], 'ot_completed': tuple(e['before']['ot_completed'])})
            kind = e['action']['kind']
            if not (s.phase == 'scrimmage' and s.period in (2, 4) and s.clock <= 300) or kind in ('timeout', 'end_period'):
                continue
            timeout = False
            for n in events[k + 1:k + 6]:
                if n['before']['period'] != s.period:
                    break
                if n['action']['kind'] == 'timeout':
                    timeout = True
                    continue
                if n['before']['phase'] != 'scrimmage':
                    break
                gap = s.clock - n['before']['clock']
                groups[f'{stop_band(s)}|{kind if kind in KINDS else "other"}|{"timeout" if timeout else "no_timeout"}'].append(max(0, gap))
                break
    return summarize(groups, len(seeds)), len(seeds)


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--source', required=True)
    p.add_argument('--model', required=True)
    a = p.parse_args()
    src, n1 = source(a.source)
    sm, n2 = sim(a.model)
    print(json.dumps(dict(scope='DESCRIPTIVE_DIAGNOSTIC_ONLY', model=a.model, source_games=n1, sim_games=n2, source=src, sim=sm), indent=2))

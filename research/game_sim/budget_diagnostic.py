"""Budget-at-opportunity diagnostic (frozen before it is run; descriptive only, fits nothing).

Question: do simulated teams reach late running-clock moments with fewer timeouts than real teams?

Definition, identical on both sides:
- A RUNNING opportunity is a late continuing run/completion: Q2/Q4, <=300 s before the snap,
  scrimmage, not a TD, same possession afterwards (source: `timeout_cells.running_play`; sim: the
  engine's own `late_timeout_followed_plays` condition on a traced event).
- For each one, record the pre-play band (`stop_band`), the offense and defense timeouts left
  (0-3 each) and whether a timeout immediately follows.
- Sim: the first 1,000 seeds of the certified batch (1701..2700, old OT), traced from the saved
  model. Source: all 2022 REG games in the training file.
Output per band and per half: opportunities per game, the share with each eligibility config
(both / offense-only / defense-only / none), mean offense and defense timeouts left, and calls per
opportunity. No threshold, no pass/fail: this informs whether a v0.2.21 protocol is warranted.
"""
import argparse, csv, gzip, io, json
from collections import Counter, defaultdict
from pathlib import Path
from .batch import game, Sampler
from .model import other
from .state import State
from .timeout_cells import presnap_state, running_play, stop_band, eligibility


def _summary(rows, games):
    out = {}
    for band, items in sorted(rows.items()):
        n = len(items)
        elig = Counter(e for e, _, _, _ in items)
        out[band] = dict(
            opportunities_per_game=round(n / games, 4),
            share={k: round(elig[k] / n, 4) for k in ('both', 'offense', 'defense', 'none')},
            mean_offense_timeouts=round(sum(o for _, o, _, _ in items) / n, 4),
            mean_defense_timeouts=round(sum(d for _, _, d, _ in items) / n, 4),
            calls_per_opportunity=round(sum(c for _, _, _, c in items) / n, 4),
            n=n)
    return out


def _record(rows, s, called):
    o = getattr(s, s.possession + '_timeouts')
    d = getattr(s, other(s.possession) + '_timeouts')
    band = stop_band(s)
    item = (eligibility(s) or 'none', o, d, int(called))
    rows[band].append(item)
    rows['all@' + band.split('@')[1]].append(item)


def source(path):
    raw = Path(path).read_bytes()
    body = gzip.decompress(raw) if raw[:2] == b'\x1f\x8b' else raw
    rows = list(csv.DictReader(io.StringIO(body.decode('utf-8-sig'))))
    out = defaultdict(list)
    games = {r['game_id'] for r in rows if r.get('season_type') == 'REG'}
    for i, row in enumerate(rows):
        if row.get('season_type') != 'REG':
            continue
        try:
            s = presnap_state(row)
        except (ValueError, TypeError, KeyError):
            continue
        ok, followed, _, _ = running_play(rows, i, row, s)
        if ok:
            _record(out, s, followed)
    return _summary(out, len(games)), len(games)


def sim(model_path, seeds=range(1701, 2701)):
    model = json.loads(gzip.decompress(Path(model_path).read_bytes()))
    tables = Sampler(model, 1701).tables
    out = defaultdict(list)
    done = 0
    for seed in seeds:
        g = game(model, seed, both_possessions=False, trace=True, prepared_tables=tables)
        events = g['events']
        for k, e in enumerate(events):
            s, a, after = State(**{**e['before'], 'ot_completed': tuple(e['before']['ot_completed'])}), e['action'], e['after']
            if not (s.phase == 'scrimmage' and s.period in (2, 4) and s.clock <= 300 and a['kind'] in ('run', 'pass_complete')):
                continue
            if after['phase'] != 'scrimmage' or after['possession'] != s.possession or (after['home_score'], after['away_score']) != (s.home_score, s.away_score):
                continue
            nxt = events[k + 1]['action']['kind'] if k + 1 < len(events) else None
            _record(out, s, nxt == 'timeout')
        done += 1
    return _summary(out, done), done


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--source', required=True)
    p.add_argument('--model', required=True)
    a = p.parse_args()
    src, n_src = source(a.source)
    sm, n_sim = sim(a.model)
    print(json.dumps(dict(scope='DESCRIPTIVE_DIAGNOSTIC_ONLY', source_games=n_src, sim_games=n_sim,
                          model=a.model, source=src, sim=sm), indent=2))

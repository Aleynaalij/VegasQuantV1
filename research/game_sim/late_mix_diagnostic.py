"""Late-half mix diagnostic (frozen before it is run; descriptive only, fits nothing).

Follows the budget diagnostic (`RUNNING_CLOCK_PROTOCOL.md`, follow-up). Two questions:
(a) Within each late band, do simulated running-clock opportunities have the same lead and field
    mix as the source? (coarse lead: ahead/tied/behind; field: the engine's 20-yard bins)
(b) In Q2/Q4 <=300 s scrimmage snaps, does the play mix match? Categories: run, pass_complete,
    pass_incomplete, sack, kneel, spike, timeout, field_goal, punt, other; plus the share of
    run/complete plays that end the drive's clock-running state (out of bounds is not observable
    in the engine, so only "continuing with same possession" is compared).
Same samples as the budget diagnostic: sim = seeds 1701..2700 of the certified batch, old OT,
traced from the saved model; source = all 2022 REG games. No thresholds, no pass/fail.
"""
import argparse, csv, gzip, io, json
from collections import Counter, defaultdict
from pathlib import Path
from .batch import game, Sampler
from .model import other
from .state import State
from .timeout_cells import presnap_state, running_play, stop_band, leads

KINDS = ('run', 'pass_complete', 'pass_incomplete', 'sack', 'kneel', 'spike', 'timeout', 'field_goal', 'punt')


def late(s):
    return s.phase == 'scrimmage' and s.period in (2, 4) and s.clock <= 300


def field(s):
    return str(max(0, min(4, (s.yardline - 1) // 20)))


def source_kind(row):
    t = row.get('play_type')
    if row.get('timeout') == '1' and t == 'no_play':
        return 'timeout'
    if t == 'run':
        return 'run'
    if t == 'pass':
        return 'sack' if row.get('sack') == '1' else 'pass_complete' if row.get('complete_pass') == '1' else 'pass_incomplete'
    return {'qb_kneel': 'kneel', 'qb_spike': 'spike', 'field_goal': 'field_goal', 'punt': 'punt'}.get(t, 'other')


def pct(counter):
    n = sum(counter.values())
    return {k: round(v / n, 4) for k, v in sorted(counter.items())} if n else {}


def per_game(counter, games):
    return {k: round(v / games, 4) for k, v in sorted(counter.items())}


def source(path):
    raw = Path(path).read_bytes()
    body = gzip.decompress(raw) if raw[:2] == b'\x1f\x8b' else raw
    rows = list(csv.DictReader(io.StringIO(body.decode('utf-8-sig'))))
    games = len({r['game_id'] for r in rows if r.get('season_type') == 'REG'})
    mix, opp = defaultdict(Counter), defaultdict(Counter)
    for i, row in enumerate(rows):
        if row.get('season_type') != 'REG':
            continue
        kind = source_kind(row)
        try:
            s = presnap_state(row) if kind != 'timeout' else None
        except (ValueError, TypeError, KeyError):
            continue
        if kind == 'timeout':
            # Administrative timeout rows carry the band of the clock at the timeout.
            try:
                qtr, clock = int(row['qtr']), int(row['quarter_seconds_remaining'])
            except (ValueError, KeyError):
                continue
            if qtr in (2, 4) and clock <= 300:
                band = ('last10' if clock <= 10 else 'last30' if clock <= 30 else 'last120' if clock <= 120 else 'last300') + ('@h1' if qtr == 2 else '@h2')
                mix[band]['timeout'] += 1
            continue
        if not late(s):
            continue
        mix[stop_band(s)][kind] += 1
        ok, _, _, _ = running_play(rows, i, row, s)
        if ok:
            opp[stop_band(s)][leads(s)[0] + '|f' + field(s)] += 1
    return dict(games=games, play_mix_per_game={b: per_game(c, games) for b, c in sorted(mix.items())},
                opportunity_mix={b: pct(c) for b, c in sorted(opp.items())})


def sim(model_path, seeds=range(1701, 2701)):
    model = json.loads(gzip.decompress(Path(model_path).read_bytes()))
    tables = Sampler(model, 1701).tables
    mix, opp = defaultdict(Counter), defaultdict(Counter)
    n = 0
    for seed in seeds:
        g = game(model, seed, both_possessions=False, trace=True, prepared_tables=tables)
        for e in g['events']:
            s = State(**{**e['before'], 'ot_completed': tuple(e['before']['ot_completed'])})
            a, after = e['action'], e['after']
            if not late(s):
                continue
            kind = a['kind'] if a['kind'] in KINDS else 'other'
            mix[stop_band(s)][kind] += 1
            if a['kind'] in ('run', 'pass_complete') and after['phase'] == 'scrimmage' and after['possession'] == s.possession \
                    and (after['home_score'], after['away_score']) == (s.home_score, s.away_score):
                opp[stop_band(s)][leads(s)[0] + '|f' + field(s)] += 1
        n += 1
    return dict(games=n, play_mix_per_game={b: per_game(c, n) for b, c in sorted(mix.items())},
                opportunity_mix={b: pct(c) for b, c in sorted(opp.items())})


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--source', required=True)
    p.add_argument('--model', required=True)
    a = p.parse_args()
    print(json.dumps(dict(scope='DESCRIPTIVE_DIAGNOSTIC_ONLY', model=a.model, source=source(a.source), sim=sim(a.model)), indent=2))

"""Frozen NGS-002 dataset builder. No EV, win-rate comparisons or holdout decision.

python research/ngs/backtest.py --cache /tmp/vq-ngs --output /tmp/vq-ngs/dataset
Defaults to 2018-2025; --seasons 2018 ... 2023 builds development only. Source caches
are hash-checked against their manifest. Historical event-week cutoffs are not archived
publication vintages: these are retrospectively corrected nflverse snapshots.
"""
from __future__ import annotations
import argparse
from collections import defaultdict
import csv
from datetime import datetime, timezone
import gzip
import hashlib
import io
import json
import math
from pathlib import Path
import re
from statistics import median
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
BASE = 'https://github.com/nflverse/nflverse-data/releases/download/'
API = 'https://api.github.com/repos/nflverse/nflverse-data/releases/tags/'
METRICS = {'rushing_yards': (15, 5, 'rushing'), 'receiving_yards': (15, 5, 'receiving'),
           'passing_yards': (150, 25, 'passing'), 'receptions': (3, 1, 'receiving')}
WEIGHTS = {'avg_separation': 'targets', 'catch_percentage': 'targets',
           'avg_yac_above_expectation': 'receptions', 'rush_yards_over_expected_per_att': 'rush_attempts',
           'percent_attempts_gte_eight_defenders': 'rush_attempts', 'completion_percentage_above_expectation': 'attempts'}
FLAGS = {'F1': ('avg_separation', .25, 'low', ('receiving_yards', 'receptions')),
         'F2': ('catch_percentage', .25, 'low', ('receptions',)),
         'F3': ('avg_yac_above_expectation', .75, 'high', ('receiving_yards',)),
         'F4': ('rush_yards_over_expected_per_att', .25, 'low', ('rushing_yards',)),
         'F5': ('percent_attempts_gte_eight_defenders', .75, 'high', ('rushing_yards',)),
         'F6': ('completion_percentage_above_expectation', .25, 'low', ('passing_yards',))}


def number(value):
    if value is None or str(value).strip() in ('', 'NA', 'NaN', 'null'): return None
    v = float(value)
    if not math.isfinite(v): raise ValueError('Non-finite numeric input')
    return v


def team(code):
    return {'WSH': 'WAS', 'LA': 'LAR', 'STL': 'LAR', 'SD': 'LAC', 'OAK': 'LV'}.get(code, code)


def quantile(values, q):
    s = sorted(v for v in values if v is not None)
    if not s: return None
    i = (len(s)-1)*q
    return s[math.floor(i)] + (s[math.ceil(i)]-s[math.floor(i)])*(i-math.floor(i))


def weighted(rows, key):
    total = mass = 0.
    for r in rows:
        v, w = number(r.get(key)), number(r.get(WEIGHTS[key]))
        if v is not None and w is not None and w > 0: total += v*w; mass += w
    return total/mass if mass else None


def highest_target(values, metric):
    if len(values) != 5: return None
    low, step, _ = METRICS[metric]
    # Assumed -200 R1 benchmark only: >=4/5, with median STRICTLY above N.
    return next((n for n in range(int(max(values)//step)*step, low-1, -step)
                 if median(values) > n and sum(v >= n for v in values) >= 4), None)


class NgsIndex:
    def __init__(self, families):
        self.families = families
        self.league = {}
        self.players = {}
        for family, rows in families.items():
            grouped = defaultdict(list)
            for r in rows: grouped[r['player_gsis_id']].append(r)
            self.players[family] = grouped

    def context(self, row, metric):
        season, week = int(row['season']), int(row['week'])
        family = METRICS[metric][2]
        cache_key = (family, season, week)
        if cache_key not in self.league:
            prior = [r for r in self.families.get(family, []) if int(r['season']) == season
                     and r['season_type'] == 'REG' and 1 <= int(r['week']) < week]
            self.league[cache_key] = {key: {'p25': quantile([number(r.get(key)) for r in prior], .25),
                                          'p75': quantile([number(r.get(key)) for r in prior], .75)}
                                     for key in WEIGHTS if any(key in r for r in prior)}
        league = self.league[cache_key]
        teams = {team(row['team']), team(row['opponent_team'])}
        mine = [r for r in self.players.get(family, {}).get(row['player_id'], [])
                if int(r['season']) == season and r['season_type'] == 'REG'
                and max(1, week-3) <= int(r['week']) < week and team(r['team_abbr']) in teams]
        flags, evidence = {}, {}
        for flag, (key, q, direction, applicable) in FLAGS.items():
            if metric not in applicable: continue
            value = weighted(mine, key)
            threshold = league.get(key, {}).get('p25' if q == .25 else 'p75')
            flags[flag] = None if value is None or threshold is None else int(value < threshold if direction == 'low' else value > threshold)
            evidence[key] = {'player': value, **league.get(key, {'p25': None, 'p75': None})}
        return flags, sorted({int(r['week']) for r in mine}), evidence


def normalize_weekly(rows, season):
    out, seen = [], set()
    for raw in rows:
        if raw['season_type'] != 'REG': continue
        r = dict(raw)
        if int(r['season']) != season: raise ValueError('Weekly season mismatch')
        if not 1 <= int(r['week']) <= 18: raise ValueError('Invalid regular-season week')
        vals = [number(r.get(k)) for k in METRICS]
        # Upstream includes unidentified all-zero team rows; never drop nonzero unknown identity.
        if not r.get('player_id') or not r.get('position'):
            if any(v is None or v != 0 for v in vals): raise ValueError('Unidentified nonzero/unknown player stats')
            continue
        if not re.fullmatch(r'\d{2}-\d{7}', r['player_id']): raise ValueError('Invalid player ID')
        if not r.get('team') or not r.get('opponent_team') or not r.get('game_id'): raise ValueError('Missing fixture identity')
        key = (r['player_id'], season, int(r['week']))
        if key in seen: raise ValueError('Duplicate player-week; resolve before building')
        seen.add(key); out.append(r)
    return out


def build_dataset(weekly, families):
    index = NgsIndex(families)
    by_player = defaultdict(list)
    for row in weekly: by_player[row['player_id']].append(row)
    output = []
    for player_id in sorted(by_player):
        history = sorted(by_player[player_id], key=lambda r: (int(r['season']), int(r['week'])))
        for i, row in enumerate(history):
            # Position is the latest PRIOR row, as in legHistory; outcome-week role does not leak.
            if i == 0: continue
            position = history[i-1]['position']
            if position not in ('QB', 'RB', 'FB', 'WR', 'TE'): continue
            for metric in METRICS:
                if position == 'TE' and metric != 'receptions': continue
                earlier = [r for r in history[:i] if number(r.get(metric)) is not None][-5:]
                values = [number(r[metric]) for r in earlier]
                target = highest_target(values, metric)
                actual = number(row.get(metric))
                if target is None or actual is None: continue
                flags, weeks, evidence = index.context(row, metric)
                result = {'season': int(row['season']), 'week': int(row['week']), 'game_id': row['game_id'],
                          'player_id': player_id, 'player': row['player_display_name'], 'team': team(row['team']),
                          'opponent_team': team(row['opponent_team']), 'prior_position': position,
                          'statistic': metric, 'target': target, 'assumed_price': -200,
                          'form_games': json.dumps([[int(r['season']), int(r['week'])] for r in earlier]),
                          'form_values': json.dumps(values), 'form_median': median(values),
                          'form_cleared': sum(v >= target for v in values), 'actual': actual, 'cleared': int(actual >= target),
                          'ngs_weeks': json.dumps(weeks), 'ngs_metrics': json.dumps(evidence, sort_keys=True, allow_nan=False),
                          'applicable_flags': ','.join(flags), 'ngs_status': 'complete' if all(v is not None for v in flags.values()) else 'missing',
                          'historical_cutoff': f"{row['season']}-W{int(row['week']):02d}-exclusive",
                          'split': 'development' if int(row['season']) <= 2023 else 'holdout'}
                result.update({flag: flags.get(flag, '') if flags.get(flag) is not None else '' for flag in FLAGS})
                output.append(result)
    return sorted(output, key=lambda r: (r['season'], r['week'], r['player_id'], r['statistic']))


def flag_counts(rows):
    counts = {}
    for r in rows:
        for flag in r['applicable_flags'].split(','):
            key = f"{r['split']}:{r['statistic']}:{flag}"
            c = counts.setdefault(key, {'applicable': 0, 'known': 0, 'flagged': 0, 'missing': 0})
            c['applicable'] += 1
            if r[flag] == '': c['missing'] += 1
            else: c['known'] += 1; c['flagged'] += r[flag]
    return counts  # Deliberately no outcome totals, win rates, intervals or decisions.


def csv_rows(raw, name, required):
    if name.endswith('.gz'):
        with gzip.GzipFile(fileobj=io.BytesIO(raw)) as handle:
            plain = handle.read(100_000_001)
    else:
        plain = raw
    if len(plain) > 100_000_000: raise ValueError('Expanded source too large')
    reader = csv.DictReader(io.StringIO(plain.decode('utf-8-sig')))
    if not set(required) <= set(reader.fieldnames or []): raise ValueError(f'Schema changed: {name}')
    return list(reader)


def download(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'VegasQuant-NGS-Backtest/1.0'})
    with urllib.request.urlopen(req, timeout=90) as response: raw = response.read(25_000_001)
    if len(raw) > 25_000_000: raise ValueError('Source too large')
    return raw


def source(cache, release, name, manifest, fetch=download):
    path = cache / name
    if path.exists():
        meta = manifest.get(name)
        raw = path.read_bytes()
        if not meta or hashlib.sha256(raw).hexdigest() != meta['sha256']: raise ValueError('Cache hash mismatch: '+name)
    else:
        metadata = json.loads(fetch(API+release))
        asset = next((a for a in metadata.get('assets', []) if a.get('name') == name and a.get('browser_download_url') == BASE+release+'/'+name), None)
        if asset is None: raise ValueError('Missing upstream release asset: '+name)
        raw = fetch(asset['browser_download_url'])
        at = datetime.now(timezone.utc).isoformat()
        meta = {'url': asset['browser_download_url'], 'sha256': hashlib.sha256(raw).hexdigest(),
                'retrieved_at': at, 'source_updated_at': asset['updated_at'], 'bytes': len(raw)}
        path.write_bytes(raw); manifest[name] = meta
        (cache/'sources.json').write_text(json.dumps(manifest, indent=2, sort_keys=True))
    if meta['url'] != BASE+release+'/'+name: raise ValueError('Unexpected cached source URL')
    if datetime.fromisoformat(meta['source_updated_at'].replace('Z', '+00:00')) > datetime.fromisoformat(meta['retrieved_at']): raise ValueError('Invalid retrieval timeline')
    return raw


def load_sources(cache, seasons, fetch=download):
    cache.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((cache/'sources.json').read_text()) if (cache/'sources.json').exists() else {}
    weekly, families, used = [], {}, []
    for season in seasons:
        name = f'stats_player_week_{season}.csv.gz'
        raw = source(cache, 'stats_player', name, manifest, fetch); used.append(name)
        required = ['player_id', 'player_display_name', 'position', 'season', 'season_type', 'week', 'game_id', 'team', 'opponent_team', *METRICS]
        weekly.extend(normalize_weekly(csv_rows(raw, name, required), season))
    for family in ('passing', 'rushing', 'receiving'):
        name = f'ngs_{family}.csv.gz'
        raw = source(cache, 'nextgen_stats', name, manifest, fetch); used.append(name)
        keys = [k for k,_,_,ms in FLAGS.values() if METRICS[ms[0]][2] == family]
        required = ['season', 'season_type', 'week', 'player_gsis_id', 'player_display_name', 'team_abbr',
                    *keys, *[WEIGHTS[k] for k in keys]]
        rows = csv_rows(raw, name, required)
        selected, seen = [], set()
        for r in rows:
            if int(r['season']) not in seasons or r['season_type'] != 'REG' or not 1 <= int(r['week']) <= 18: continue
            identity = (r['player_gsis_id'], int(r['season']), int(r['week']), team(r['team_abbr']))
            if identity in seen: raise ValueError('Duplicate NGS identity')
            if not re.fullmatch(r'\d{2}-\d{7}',r['player_gsis_id']): raise ValueError('Invalid NGS player ID')
            for k in keys+[WEIGHTS[k] for k in keys]: number(r.get(k))
            seen.add(identity); selected.append(r)
        families[family] = selected
    return weekly, families, {n: manifest[n] for n in used}


def write_output(prefix, rows, sources):
    prefix.parent.mkdir(parents=True, exist_ok=True)
    code_inputs = [ROOT/'docs/research/ngs-backtest-plan.md', ROOT/'scripts/research-board/ngs.ts', ROOT/'scripts/research-board/select.ts', Path(__file__)]
    code_hashes = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in code_inputs}
    inputs = {'sources': {n: {'url':v['url'],'sha256':v['sha256']} for n,v in sources.items()}, 'code':code_hashes}
    input_hash = hashlib.sha256(json.dumps(inputs, sort_keys=True).encode()).hexdigest()
    fields = list(rows[0]) if rows else ['season','week','player_id','statistic','target','cleared',*FLAGS]
    fields += ['input_hash']
    with prefix.with_suffix('.csv').open('w', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=fields); writer.writeheader()
        for r in rows: writer.writerow({**r, 'input_hash':input_hash})
    csv_hash = hashlib.sha256(prefix.with_suffix('.csv').read_bytes()).hexdigest()
    summary = {'generated_at':datetime.now(timezone.utc).isoformat(),'row_count':len(rows),'csv_sha256':csv_hash,
               'input_hash':input_hash,'sources':sources,'code_sha256':code_hashes,'flag_counts':flag_counts(rows),
               'assumed_price_is_not_a_historical_quote':True, 'point_in_time_publication_vintages_verified':False,
               'holdout_decision_computed':False}
    prefix.with_suffix('.json').write_text(json.dumps(summary, indent=2, sort_keys=True, allow_nan=False))
    return {'rows':len(rows),'csv_sha256':csv_hash,'holdout_decision_computed':False}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--cache',type=Path,required=True); p.add_argument('--output',type=Path,required=True)
    p.add_argument('--seasons',type=int,nargs='+',default=list(range(2018,2026)))
    args = p.parse_args()
    seasons = sorted(set(args.seasons))
    if not seasons or any(s not in range(2018,2026) for s in seasons): p.error('Only frozen 2018-2025 seasons are supported')
    weekly, families, sources = load_sources(args.cache,seasons)
    print(json.dumps(write_output(args.output, build_dataset(weekly,families),sources)))

if __name__ == '__main__': main()

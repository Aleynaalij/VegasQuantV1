"""Section 1/4 inputs: schedule, generated exclusions and per-game evidence aggregates.

Evidence plays (section 2): REG scrimmage `run`/`pass` rows with a down, distance, posteam and
defteam; kneels and spikes are their own play types and never enter. `pass` includes sacks;
scrambles are runs as recorded. Gain plays are the subset in G_run or G_pass (section 3), decided by
`gain_exclusion` in the engine's own classification order (v0.3.1). Excluded rows stay in the
pass-rate ridge.

Plays are aggregated per game so each target can re-weight exactly:
- gain[(offense, defense, kind)] = [plays, sum of signed yards]
- rate[(offense, defense, down, band, half, lead)] = [plays, passes]
"""
import csv
import gzip
import hashlib
import io
from collections import defaultdict
from pathlib import Path

from ..model import enforced_penalty
from .effects import band
from .eligibility import exclusions, kickoff

SEASONS = ('2022', '2023', '2024')
TARGET_SEASON = '2024'


def _rows(path):
    raw = Path(path).read_bytes()
    body = gzip.decompress(raw) if raw[:2] == b'\x1f\x8b' else raw
    return list(csv.DictReader(io.StringIO(body.decode('utf-8-sig')))), hashlib.sha256(raw).hexdigest()


def _int(value):
    f = float(value)
    if f != int(f):
        raise ValueError('non-integer')
    return int(f)


def gain_exclusion(row):
    """Why a scrimmage run/pass row is outside G_run or G_pass, or None if it is in G.

    v0.3.1 (TEAM_LAYER_CORRECTION_PROTOCOL.md): follows `model.fit`'s classification order, so the
    gain ridge sees exactly the plays the engine tilts. Enforced penalties, defensive touchdowns,
    interceptions, lost fumbles and recovered fumbles belong to the fixed group F."""
    if enforced_penalty(row):
        return 'penalty'
    if row.get('touchdown') == '1' and row.get('td_team') and row['td_team'] != row.get('posteam'):
        return 'defensive_touchdown'
    if row.get('interception') == '1' or row.get('fumble_lost') == '1':
        return 'turnover'
    if row.get('fumble') == '1':
        return 'fumble_recovered'
    return None


def load(games_path, pbp_paths):
    games, games_sha = _rows(games_path)
    reg = [r for r in games if r.get('game_type') == 'REG' and r.get('season') in SEASONS]
    gain, rate = defaultdict(lambda: defaultdict(lambda: [0, 0])), defaultdict(lambda: defaultdict(lambda: [0, 0]))
    end_ids, pbp_ids, sources, counts = set(), set(), [], defaultdict(int)
    for path in pbp_paths:
        rows, sha = _rows(path)
        sources.append(dict(file=Path(path).name, sha256=sha))
        for r in rows:
            if r.get('season_type') != 'REG':
                continue
            gid = r['game_id']
            pbp_ids.add(gid)
            if (r.get('desc') or '').strip() == 'END GAME':
                end_ids.add(gid)
            if r.get('play_type') not in ('run', 'pass'):
                continue
            try:
                down, dist, qtr = _int(r['down']), _int(r['ydstogo']), _int(r['qtr'])
                o, d = r['posteam'], r['defteam']
                ps, ds = _int(r['posteam_score']), _int(r['defteam_score'])
                gained = _int(r['yards_gained'])
            except (ValueError, TypeError, KeyError):
                counts['excluded:missing_field'] += 1
                continue
            if not o or not d or not 1 <= down <= 4 or r.get('two_point_attempt') == '1':
                counts['excluded:not_scrimmage'] += 1
                continue
            kind = 'pass' if r['play_type'] == 'pass' else 'run'
            lead = 'ahead' if ps > ds else 'behind' if ps < ds else 'tied'
            cell = rate[gid][(o, d, down, band(dist), 1 if qtr <= 2 else 2, lead)]
            cell[0] += 1
            cell[1] += kind == 'pass'
            counts['rate_plays'] += 1
            excluded = gain_exclusion(r)
            if excluded:
                counts[f'gain_excluded:{excluded}'] += 1
                continue
            g = gain[gid][(o, d, kind)]
            g[0] += 1
            g[1] += 0 if (kind == 'pass' and r.get('complete_pass') != '1' and r.get('sack') != '1') else gained
            counts['gain_plays'] += 1
    excluded = exclusions(reg, end_ids, pbp_ids)
    schedule = {r['game_id']: kickoff(r) for r in reg}
    teams = {r['game_id']: (r['home_team'], r['away_team']) for r in reg}
    targets = sorted(g for g, r in ((r['game_id'], r) for r in reg) if r['season'] == TARGET_SEASON)
    return dict(schedule=schedule, teams=teams, targets=targets, excluded=excluded, gain=gain, rate=rate,
                games_rows=reg, games_sha256=games_sha, pbp_sources=sources, counts=dict(counts))

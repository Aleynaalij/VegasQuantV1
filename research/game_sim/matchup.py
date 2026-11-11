"""Cutoff-safe historical team effects and player opportunities, not forecasts."""
import csv
import gzip
import hashlib
import io
import math
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

MODEL_ID = 'vq-matchup-features/0.1.1'
RIDGE_PLAYS = 100
ITERATIONS = 100


def timestamp(value):
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if result.tzinfo is None:
        raise ValueError('timezone required')
    return result


def read_sources(manifest, cutoff, historical=False):
    limit = timestamp(cutoff)
    seen = set()
    rows = []
    sources = []
    if not manifest:
        raise ValueError('source manifest required')
    for source in manifest:
        data = Path(source['path']).read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        if digest != source['sha256'] or not source['source_url'].startswith('https://'):
            raise ValueError('invalid source provenance')
        retrieved = timestamp(source['retrieved_at'])
        if historical and retrieved > limit:
            raise ValueError('retrieved after historical cutoff')
        decoded = gzip.decompress(data) if data[:2] == b'\x1f\x8b' else data
        for row in csv.DictReader(io.StringIO(decoded.decode('utf-8-sig'))):
            key = (row['game_id'], row['play_id'])
            if key in seen:
                raise ValueError('duplicate game/play')
            seen.add(key)
            rows.append(row)
        sources.append({k: source[k] for k in ('source_url', 'sha256', 'retrieved_at')})
    return rows, sources


def fit(rows, cutoff, sources):
    """Caller must obtain rows and verified sources through read_sources."""
    limit = timestamp(cutoff)
    if not sources or any(not x['source_url'].startswith('https://') or
            len(x['sha256']) != 64 or any(c not in '0123456789abcdef' for c in x['sha256']) for x in sources):
        raise ValueError('verified source manifest required')
    retrospective = any(timestamp(x['retrieved_at']) > limit for x in sources)
    groups = defaultdict(list)
    opportunity = defaultdict(Counter)
    raw_opportunity = defaultdict(Counter)
    coverage = Counter()
    latest = None
    for row in rows:
        coverage['rows'] += 1
        # nflverse start_time is UTC ISO when supplied; callers must normalize
        # gameday + local start_time rather than guess a timezone.
        kickoff = row.get('game_start_utc')
        if not kickoff:
            raise ValueError('explicit game_start_utc required')
        when = timestamp(kickoff)
        if when >= limit:
            coverage['excluded:at_or_after_cutoff'] += 1
            continue
        end = row.get('game_end_utc')
        if not end:
            raise ValueError('verified game_end_utc required')
        completed = timestamp(end)
        if completed < when:
            raise ValueError('completion before kickoff')
        if completed >= limit:
            coverage['excluded:incomplete_at_cutoff'] += 1
            continue
        age_days = (limit - when).total_seconds() / 86400
        if age_days > 730:
            coverage['excluded:older_than_730_days'] += 1
            continue
        weight = 2 ** (-age_days / 120)
        if row.get('season_type') != 'REG' or row.get('qtr') not in ('1', '2', '3', '4'):
            coverage['excluded:period_or_season'] += 1
            continue
        if row.get('penalty') == '1' or row.get('two_point_attempt') == '1':
            coverage['excluded:penalty_or_try'] += 1
            continue
        kind = row.get('play_type')
        if kind not in ('run', 'pass'):
            coverage['excluded:non_ordinary_play'] += 1
            continue
        try:
            epa = float(row['epa'])
        except (ValueError, KeyError, TypeError):
            coverage['excluded:missing_epa'] += 1
            continue
        if not math.isfinite(epa) or not row.get('posteam') or not row.get('defteam'):
            coverage['excluded:invalid_value'] += 1
            continue
        offense, defense = row['posteam'], row['defteam']
        groups[kind].append((offense, defense, epa, weight))
        latest = when if latest is None else max(latest, when)
        coverage['accepted:' + kind] += 1
        if row.get('qb_scramble') == '1':
            coverage['qb_scramble:rush_epa_and_carry'] += 1
        roles = [('carry', row.get('rusher_player_id'))] if kind == 'run' else (
            [] if row.get('sack') == '1' else [
                ('passer', row.get('passer_player_id')),
                ('target', row.get('receiver_player_id'))])
        for role, player in roles:
            if player:
                opportunity[(offense, role)][player] += weight
                raw_opportunity[(offense, role)][player] += 1
            else:
                coverage['missing_identity:' + role] += 1
    effects = {}
    for kind, plays in sorted(groups.items()):
        mean = sum(p[2]*p[3] for p in plays) / sum(p[3] for p in plays)
        teams = sorted({p[0] for p in plays} | {p[1] for p in plays})
        attack = dict.fromkeys(teams, 0.0)
        defense = dict.fromkeys(teams, 0.0)
        by_attack, by_defense = defaultdict(list), defaultdict(list)
        for a, d, y, w in plays:
            by_attack[a].append((d, y, w))
            by_defense[d].append((a, y, w))
        for _ in range(ITERATIONS):
            for team in teams:
                attack[team] = sum(w*(y - mean - defense[d]) for d, y, w in by_attack[team]) / (sum(w for d,y,w in by_attack[team]) + RIDGE_PLAYS)
            for team in teams:
                defense[team] = sum(w*(y - mean - attack[a]) for a, y, w in by_defense[team]) / (sum(w for a,y,w in by_defense[team]) + RIDGE_PLAYS)
        effects[kind] = dict(league_epa=mean, offense=attack, defense_allowed=defense,
                             offense_plays={t: len(by_attack[t]) for t in teams},
                             defense_plays={t: len(by_defense[t]) for t in teams},
                             offense_weighted_support={t:sum(w for d,y,w in by_attack[t]) for t in teams})
    if set(effects) != {'run', 'pass'}:
        raise ValueError('both pass and rush support required')
    return dict(model_id=MODEL_ID, status='DEVELOPMENT_ONLY', cutoff=cutoff,
                historical_cutoff=latest.isoformat(), sources=sources, coverage=dict(coverage),
                retrospective_source_retrieval=retrospective,
                effects=effects, recency=dict(half_life_days=120, maximum_age_days=730),
                opportunities=[dict(team=t, role=r, counts=dict(sorted(c.items())),raw_counts=dict(raw_opportunity[(t,r)]))
                    for (t, r), c in sorted(opportunity.items())],
                forecast_supported=False)


def matchup_epa(model, offense, defense, kind):
    effect = model['effects'][kind]
    if offense not in effect['offense'] or defense not in effect['defense_allowed']:
        raise ValueError('unknown team; no silent league fallback')
    return effect['league_epa'] + effect['offense'][offense] + effect['defense_allowed'][defense]


def workload_shares(model, team, role, roster, prior, evidence):
    """Current source-backed scenario weights; historical team IDs never clear players."""
    limit = timestamp(model['cutoff'])
    if not evidence or any(not e['source_url'].startswith('https://') or
            len(e['sha256']) != 64 or any(c not in '0123456789abcdef' for c in e['sha256']) or
            timestamp(e['retrieved_at']) > limit for e in evidence):
        raise ValueError('current evidence required at cutoff')
    if not roster or len({p['id'] for p in roster}) != len(roster):
        raise ValueError('unique current roster required')
    if any(not p['id'] or p.get('availability') != 'reviewed_active' for p in roster):
        raise ValueError('unknown/out availability blocks allocation')
    if set(prior) != {p['id'] for p in roster} or any(type(v) not in (int, float) or
            not math.isfinite(v) or v < 0 for v in prior.values()) or not math.isclose(sum(prior.values()), 1):
        raise ValueError('explicit normalized role prior required')
    counts = next((x['counts'] for x in model['opportunities'] if x['team'] == team and x['role'] == role), {})
    # Preserve omitted historical volume as uncertainty rather than reassigning it.
    excluded = sum(n for p, n in counts.items() if p not in prior)
    denominator = sum(counts.values()) + 20
    shares = {p: (counts.get(p, 0) + 20 * prior[p]) / denominator for p in prior}
    return dict(shares=shares, unallocated_share=excluded / denominator,
                source_evidence=evidence, scenario_only=True, forecast_supported=False)

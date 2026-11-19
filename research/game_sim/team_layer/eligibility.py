"""Section 1: cutoff-safe evidence eligibility, with exclusions generated from the sources.

Kickoffs come from nflverse `games.csv` `gameday` + `gametime`, which are America/New_York wall
times. No game end time is assumed or invented: the 24-hour gap relies only on no admitted game
lasting 24 hours, and unfinished games are excluded outright.
"""
from collections import Counter
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

EASTERN = ZoneInfo('America/New_York')
MIN_GAP = timedelta(hours=24)
MAX_AGE_DAYS = 730
HALF_LIFE_DAYS = 120

REASON_NO_RESULT = 'no final result in source'
REASON_NO_END = 'no end-of-game row'
REASON_NOT_IN_GAMES = 'missing from games.csv'
REASON_NOT_IN_PBP = 'missing from play-by-play'
# Status values a schedule row can carry for a game that did not finish normally.
UNFINISHED = ('cancel', 'suspend', 'abandon', 'postpone', 'reschedul')


def kickoff(row):
    """Scheduled kickoff (aware, UTC) from gameday YYYY-MM-DD and gametime HH:MM (Eastern)."""
    day, time = (row.get('gameday') or '').strip(), (row.get('gametime') or '').strip()
    if not day or not time:
        raise ValueError('kickoff requires gameday and gametime')
    local = datetime.strptime(f'{day} {time}', '%Y-%m-%d %H:%M').replace(tzinfo=EASTERN)
    return local.astimezone(ZoneInfo('UTC'))


def _final(row):
    return all((row.get(k) or '').strip() not in ('', 'NA') for k in ('result', 'home_score', 'away_score'))


def exclusions(games_rows, pbp_end_ids, pbp_game_ids):
    """Generated exclusion list: [{game_id, reason}], sorted, from the two sources only.

    games_rows: REG rows of games.csv; pbp_end_ids: game_ids with an END GAME row;
    pbp_game_ids: every game_id seen in the play-by-play.
    """
    out = []
    schedule = {r['game_id']: r for r in games_rows if r.get('game_type') == 'REG'}
    for gid, row in schedule.items():
        status = (row.get('status') or row.get('game_status') or '').lower()
        if not _final(row) or any(word in status for word in UNFINISHED):
            out.append(dict(game_id=gid, reason=REASON_NO_RESULT))
        elif gid not in pbp_game_ids:
            out.append(dict(game_id=gid, reason=REASON_NOT_IN_PBP))
        elif gid not in pbp_end_ids:
            out.append(dict(game_id=gid, reason=REASON_NO_END))
    for gid in sorted(set(pbp_game_ids) - set(schedule)):
        out.append(dict(game_id=gid, reason=REASON_NOT_IN_GAMES))
    return sorted(out, key=lambda x: (x['game_id'], x['reason']))


def weight(age_days):
    return 2 ** (-age_days / HALF_LIFE_DAYS)


def admit(evidence_kickoff, target_kickoff, evidence_id, excluded_ids):
    """(admitted, reason, weight). Age is measured kickoff to kickoff."""
    if evidence_id in excluded_ids:
        return False, 'excluded', 0.0
    gap = target_kickoff - evidence_kickoff
    if gap <= timedelta(0):
        return False, 'at or after target', 0.0
    if gap < MIN_GAP:
        return False, 'within 24 hours of target', 0.0
    age = gap.total_seconds() / 86400
    if age > MAX_AGE_DAYS:
        return False, 'older than 730 days', 0.0
    return True, 'admitted', weight(age)


def evidence_for(target_id, schedule, excluded):
    """Admitted evidence games for one target: ({game_id: weight}, Counter of refusal reasons).

    schedule: {game_id: kickoff datetime}; excluded: iterable of exclusion dicts.
    """
    excluded_ids = {x['game_id'] for x in excluded}
    target = schedule[target_id]
    admitted, refused = {}, Counter()
    for gid, when in schedule.items():
        if gid == target_id:
            continue
        ok, reason, w = admit(when, target, gid, excluded_ids)
        if ok:
            admitted[gid] = w
        else:
            refused[reason] += 1
    return admitted, refused


def check_cutoff(target_kickoff, evidence_rows):
    """Raise if any evidence row breaks rule 1 for this target (rows carry `kickoff`)."""
    for row in evidence_rows:
        if target_kickoff - row['kickoff'] < MIN_GAP:
            raise ValueError(f"evidence {row.get('game_id')} within 24 hours of target")

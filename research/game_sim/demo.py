"""Synthetic renderer fixture. No fitted probabilities or real-game forecasts."""
from __future__ import annotations
import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path

PLAY_TYPES = {'run', 'pass_complete', 'pass_incomplete', 'sack', 'interception',
              'fumble_lost', 'kickoff', 'punt', 'field_goal', 'extra_point',
              'two_point', 'penalty', 'kneel', 'spike', 'timeout', 'end_period'}


def ball_x(state):
    """Absolute left-to-right field coordinate; no player tracking implied."""
    attacks_right = (state['possession'] == 'home') == (state['home_defends'] == 'left')
    return 100 - state['yardline_100'] if attacks_right else state['yardline_100']


def validate(run):
    def require(ok, message):
        if not ok:
            raise ValueError(message)
    require(run['schema_version'] == 'vq-game-sim/0.1', 'unsupported schema')
    require(run['mode'] == 'demo' and run['is_demo'] is True, 'fixture is demo only')
    require(run['runs'] == {'requested': 0, 'actual': 0}, 'script is not an ensemble')
    require(run['ensemble'] is None, 'demo has no fitted distributions')
    require(run['sources'] == [], 'synthetic fixture cannot claim external sources')
    require(run['replay']['selection']['method'] == 'synthetic_script', 'selection disclosure')
    previous = None
    for i, event in enumerate(run['replay']['events']):
        a, b = event['before'], event['after']
        require(event['sequence'] == i, 'sequence must be contiguous')
        require(event['play_type'] in PLAY_TYPES, 'unknown play type')
        require(previous is None or a == previous, 'disconnected replay')
        for state in (a, b):
            require(state['possession'] in ('home', 'away'), 'invalid possession')
            require(state['home_defends'] in ('left', 'right'), 'invalid direction')
            for key in ('period', 'clock_s', 'yardline_100', 'home_score', 'away_score'):
                require(type(state[key]) is int, f'integer required: {key}')
            require(1 <= state['period'] <= 4, 'demo only supports regulation')
            require(0 <= state['clock_s'] <= 900, 'invalid clock')
            require((state['down'] is None and state['yards_to_go'] is None) or (type(state['down']) is int and type(state['yards_to_go']) is int and 1 <= state['down'] <= 4 and 0 <= state['yards_to_go'] <= 100), 'invalid down/distance')
            require(0 <= state['yardline_100'] <= 100, 'invalid field position')
            require(min(state['home_score'], state['away_score']) >= 0, 'negative score')
        transition = b['period'] != a['period']
        require(not transition or (event['play_type'] == 'end_period' and a['clock_s'] == 0 and b['period'] == a['period'] + 1 and b['clock_s'] == 900), 'invalid period transition')
        require(transition or b['clock_s'] <= a['clock_s'], 'clock moved backward')
        require(transition or b['home_defends'] == a['home_defends'], 'direction changed midperiod')
        require(event['period'] == a['period'] and event['clock_before_s'] == a['clock_s'] and event['clock_after_s'] == b['clock_s'], 'clock aliases disagree')
        require(event['yardline_100'] == a['yardline_100'], 'yardline alias disagrees')
        # End coordinate is the ball's dead-ball location BEFORE possession/direction reset.
        require(0 <= event['ball_end_x'] <= 100 and event['ball_start_x'] == ball_x(a), 'invalid ball coordinates')
        delta = {side: b[f'{side}_score'] - a[f'{side}_score'] for side in ('home', 'away')}
        require(delta == event['score_delta'], 'score deltas disagree')
        require(all(v >= 0 for v in delta.values()) and sum(v > 0 for v in delta.values()) <= 1, 'invalid score change')
        points = sum(delta.values())
        allowed = {'run': {0, 2, 6}, 'pass_complete': {0, 2, 6}, 'extra_point': {0, 1}, 'field_goal': {0, 3}}
        require(points in allowed.get(event['play_type'], {0}), 'unsupported scoring event')
        if points == 6:
            require(event['flags']['touchdown'] and delta[a['possession']] == 6, 'touchdown mismatch')
        require(all(p['player_id'].startswith('demo-') for p in event['participants']), 'real identity in demo')
        previous = b
    require(bool(run['replay']['events']), 'empty replay')
    require(run['box_score']['home'] == previous['home_score'] and run['box_score']['away'] == previous['away_score'], 'final score mismatch')
    return run


def build_demo():
    state = dict(period=1, clock_s=900, possession='home', home_defends='left', down=1,
                 yards_to_go=10, yardline_100=75, home_score=0, away_score=0)
    events = []
    def add(kind, seconds, yards=0, points=0, **changes):
        nonlocal state
        before = deepcopy(state)
        after = deepcopy(state)
        after['clock_s'] -= seconds
        after.update(changes)
        if kind in ('run', 'pass_complete'):
            after['yardline_100'] -= yards
            after['down'] = 1 if yards >= before['yards_to_go'] else before['down'] + 1
            after['yards_to_go'] = min(10, after['yardline_100']) if after['down'] == 1 else before['yards_to_go'] - yards
        after[f"{before['possession']}_score"] += points
        if points == 6:
            after.update(down=None, yards_to_go=None, yardline_100=98)
        if kind == 'extra_point':
            after.update(down=None, yards_to_go=None, yardline_100=65)
        role = 'rusher' if kind == 'run' else 'target'
        participants = [{'role': role, 'player_id': f'demo-{before["possession"]}-{role}', 'name': 'Demo Runner' if role == 'rusher' else 'Demo Receiver'}] if kind in ('run', 'pass_complete') else []
        if kind == 'pass_complete':
            participants.append(dict(role='passer', player_id=f'demo-{before["possession"]}-passer', name='Demo Quarterback'))
        attacks_right = (before['possession'] == 'home') == (before['home_defends'] == 'left')
        end_x = (100 if attacks_right else 0) if kind == 'kickoff' or points == 6 else ball_x(before) + (yards if attacks_right else -yards)
        events.append(dict(sequence=len(events), period=before['period'], clock_before_s=before['clock_s'], clock_after_s=after['clock_s'], possession=before['possession'], play_type=kind, yards=yards, yardline_100=before['yardline_100'], ball_start_x=ball_x(before), ball_end_x=end_x, before=before, after=after, participants=participants, flags=dict(first_down=kind in ('run','pass_complete') and yards >= before['yards_to_go'], touchdown=points == 6, turnover=False, safety=False, made=True if kind == 'extra_point' else None, penalty_on=None), score_delta={s: after[f'{s}_score']-before[f'{s}_score'] for s in ('home','away')}, stat_deltas=[dict(player_id=participants[0]['player_id'], stat='rushing_yards' if kind == 'run' else 'receiving_yards', value=yards)] if participants else []))
        if kind == 'pass_complete':
            events[-1]['stat_deltas'] += [dict(player_id=participants[0]['player_id'], stat='receptions', value=1), dict(player_id=participants[1]['player_id'], stat='passing_yards', value=yards), dict(player_id=participants[1]['player_id'], stat='completions', value=1), dict(player_id=participants[1]['player_id'], stat='pass_attempts', value=1)]
        if kind == 'run':
            events[-1]['stat_deltas'].append(dict(player_id=participants[0]['player_id'], stat='carries', value=1))
        state = after
    add('run', 35, 6)
    add('pass_complete', 38, 19)
    add('run', 36, 8)
    add('pass_complete', 40, 22)
    add('run', 32, 20, points=6)
    add('extra_point', 0, points=1)
    add('kickoff', 8, possession='away', down=1, yards_to_go=10, yardline_100=75)
    add('run', 35, 4)
    add('pass_complete', 38, 12)
    payload = dict(schema_version='vq-game-sim/0.1', mode='demo', is_demo=True,
        run_id='demo-script-v1', generated_at='2026-10-27T00:00:00Z', historical_cutoff=None, inputs_as_of=None,
        model_id='synthetic-script-v1', model_version='demo-1', artifact_hash=None,
        teams={s: dict(id=f'demo-{s}', abbr='VQA' if s == 'home' else 'VQB', name=f'Vegas Demo {s.title()}') for s in ('home','away')},
        runs=dict(requested=0, actual=0), seed=None, blockers=['SYNTHETIC_DEMO_NOT_A_FORECAST', 'PARTIAL_REPLAY_NOT_A_FULL_GAME'], sources=[], ensemble=None, players=[],
        replay=dict(seed=None, selection=dict(method='synthetic_script', description='Hand-authored partial first-quarter sequence; no model runs or selection from an ensemble.', distance=None), events=events),
        box_score=dict(home=state['home_score'], away=state['away_score']))
    payload['input_hash'] = hashlib.sha256(json.dumps(events, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    return validate(payload)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=Path(__file__).with_name('demo.json'))
    args = parser.parse_args()
    args.output.write_text(json.dumps(build_demo(), indent=2) + '\n')

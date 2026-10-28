"""One research build: fit, simulate once, reproduce, diagnose, verify and package.

No database, current matchup, model approval or public publishing side effects.
"""
import argparse
import csv
import gzip
import hashlib
import io
import json
import math
from pathlib import Path
from dataclasses import asdict
from .batch import canonical, run_batch
from .evaluate import scores, evaluate
from .model import fit, source_state
from .render import render
from .state import State, Action, transition


def validate_trace(events):
    previous = None
    for index, event in enumerate(events):
        if event['sequence'] != index:
            raise ValueError('replay sequence discontinuity')
        if previous is not None and canonical(previous) != canonical(event['before']):
            raise ValueError('replay state discontinuity')
        state = dict(event['before'])
        state['ot_completed'] = tuple(state['ot_completed'])
        expected = asdict(transition(State(**state), Action(**event['action'])).after)
        if canonical(expected) != canonical(event['after']):
            raise ValueError('replay differs from rules kernel')
        previous = event['after']
    if not previous or previous['phase'] != 'final':
        raise ValueError('incomplete replay')
    return dict(events=len(events), rules_replay_verified=True)


def source_metrics(path):
    finals, digest = scores(path)
    values = {g: dict(total=sum(pair), touchdowns=0, field_goals=0, punts=0,
                      timeouts=0, fg_attempts=0, late_fg_attempts=0, late_decisions=0)
              for g, pair in finals.items()}
    raw = Path(path).read_bytes()
    raw = gzip.decompress(raw) if raw[:2] == b'\x1f\x8b' else raw
    missing = 0
    for row in csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))):
        if row['game_id'] not in values:
            continue
        item = values[row['game_id']]
        item['touchdowns'] += int(row.get('touchdown') == '1')
        item['field_goals'] += int(row.get('field_goal_result') == 'made')
        item['punts'] += int(row.get('play_type') == 'punt')
        item['timeouts'] += int(row.get('timeout') == '1')
        fg = row.get('play_type') == 'field_goal'
        item['fg_attempts'] += int(fg)
        # Diagnostics exclude administrative blank-state rows on BOTH sides.
        try:
            s = source_state(row)
        except (ValueError, TypeError, KeyError):
            missing += 1
            continue
        if s.phase == 'scrimmage' and s.period in (2, 4) and s.clock <= 30 and s.yardline <= 35:
            item['late_decisions'] += int(row.get('timeout') != '1')
            item['late_fg_attempts'] += int(fg)
    return values, digest, missing


def moments(distribution):
    n = distribution['n']
    mean = distribution['mean']
    variance = sum(b['count'] * (b['lo'] - mean)**2 for b in distribution['bins']) / (n - 1) if n > 1 else 0
    return n, mean, variance


def reproduction_report(batch, source):
    values, digest, missing = source_metrics(source)
    from statistics import mean, variance
    report = {}
    diagnostics = {}
    for key in next(iter(values.values())):
        actual = [row[key] for row in values.values()]
        d = batch['ensemble']['total'] if key == 'total' else batch['research_metrics'][key]
        n, m, var = moments(d)
        tolerance = 3 * math.sqrt(variance(actual)/len(actual) + var/n)
        item = dict(source_mean=mean(actual), simulated_mean=m, difference=m-mean(actual),
                    tolerance_3se=tolerance, passed=abs(m-mean(actual)) <= tolerance)
        (report if key in ('total', 'touchdowns', 'field_goals', 'punts') else diagnostics)[key] = item
    gaps = batch['coverage']['censoring'].get('unsupported_censoring', 0)
    return dict(protocol='baseline-correction-2026-10-27', source_sha256=digest,
                source_games=len(values), metrics=report, diagnostics=diagnostics,
                source_missing_context_rows=missing, runs=batch['runs'],
                unsupported_censoring_samples=gaps,
                thin_context_samples=batch['coverage']['censoring'].get('thin_context_support', 0),
                passed=not batch['runs']['failed'] and not gaps and all(x['passed'] for x in report.values()),
                scope='IN_SAMPLE_REPRODUCTION_ONLY; not model approval')


def build(source, calibration, output, *, runs=10000, seed=1701):
    output = Path(output)
    # mkdir atomically refuses an existing artifact directory; never overwrite evidence.
    output.mkdir(parents=True, exist_ok=False)
    model = fit([source])
    batch = run_batch(model, runs, seed, both_possessions=False)
    gate = reproduction_report(batch, source)
    trace = validate_trace(batch['replay']['events'])
    calibration_report = evaluate(batch, source, calibration) if not batch['runs']['failed'] else dict(status='BLOCKED_INCOMPLETE_SIMULATION')
    files = dict(model=model, batch=batch, gate=gate, calibration=calibration_report,
                 replay=render(batch) if not batch['runs']['failed'] else dict(status='BLOCKED_INCOMPLETE_SIMULATION'))
    file_manifest = {}
    for name, payload in files.items():
        raw = canonical(payload)
        compressed = gzip.compress(raw, mtime=0)
        filename = name + '.json.gz'
        (output/filename).write_bytes(compressed)
        file_manifest[filename] = dict(sha256=hashlib.sha256(compressed).hexdigest(),
                                       canonical_sha256=hashlib.sha256(raw).hexdigest())
    implementation = [Path(__file__), *[Path(__file__).with_name(x) for x in (
        'model.py','state.py','batch.py','evaluate.py','render.py','INTEGRATED_BUILD_PROTOCOL.md','FIELD_CONTEXT_PROTOCOL.md','LATE_SCORE_PROTOCOL.md','HALF_CONTEXT_PROTOCOL.md','TIMEOUT_BUDGET_PROTOCOL.md','TIMEOUT_SUPPORT_PROTOCOL.md','LAST300_PROTOCOL.md')]]
    manifest = dict(model_id=model['model_id'], status='RESEARCH_REVIEW_REQUIRED',
                    model_sha256=batch['artifact_sha256'], seed=seed, runs=batch['runs'],
                    reproduction_passed=gate['passed'], calibration_adopted=False,
                    trace=trace, files=file_manifest,
                    implementation_sha256={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in implementation},
                    blockers=batch['blockers'], sources=model['sources'],
                    approval=False, current_matchup_supported=False, team_player_coupling_enabled=False)
    (output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    return dict(manifest=manifest, gate=gate, calibration=calibration_report.get('summary'))


if __name__ == '__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--source',required=True)
    p.add_argument('--calibration',required=True)
    p.add_argument('--output',required=True)
    args=p.parse_args()
    print(json.dumps(build(args.source,args.calibration,args.output),indent=2),flush=True)

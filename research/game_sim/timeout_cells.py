"""Timeout-opportunity cells for v0.2.20 (RUNNING_CLOCK_PROTOCOL.md): shared by the source support
audit and the fit, so both use one definition. Running this module as a script audits support only.

Two opportunity families, defined to match the engine's own decision points:
- RUNNING: a late continuing run/completion (Q2/Q4, <=300 s, scrimmage, no TD, same possession at
  the next scrimmage context), i.e. exactly the plays the engine's `couple_stop` handles. The
  outcome is a timeout immediately after it (the corrected 9th-diagnostic definition). Keyed by the
  play's own pre-snap state, so no post-play clock is assumed.
- STOPPED: every other pre-snap opportunity `fit_timeouts` counts, minus the snap whose decision a
  no-call running play already consumed, and minus timeouts attributed to running plays.

Each cell is categorical over {no call, offense call, defense call} for one eligibility config
(both / offense-only / defense-only budgets), so the two rates always come from one count.
"""
import argparse, csv, gzip, hashlib, io, json
from collections import Counter, defaultdict
from pathlib import Path
from dataclasses import replace
from .model import source_state, timeout_contexts, recovered_timeout_state, training_events, other, pre_timeout_budgets, COMPOUND_PLAY_TYPES

MIN = 30


def presnap_state(row):
    """Pre-snap state; a compound row (a play carrying its following timeout) records post-timeout
    budgets, so the caller's timeout is restored (amendment A1, pre_timeout_budgets)."""
    s = source_state(row)
    if row.get('timeout') == '1' and row.get('play_type') in COMPOUND_PLAY_TYPES and s.phase == 'scrimmage':
        s = replace(s, **pre_timeout_budgets(row))
    return s


def stop_band(s):
    return ('last10' if s.clock <= 10 else 'last30' if s.clock <= 30 else 'last120' if s.clock <= 120 else 'last300') + ('@h1' if s.period == 2 else '@h2')


def leads(s):
    margin = getattr(s, s.possession + '_score') - getattr(s, other(s.possession) + '_score')
    coarse = 'ahead' if margin > 0 else 'behind' if margin < 0 else 'tied'
    fine = coarse + ('1-3' if abs(margin) <= 3 else '4-8' if abs(margin) <= 8 else '9+') if margin else coarse
    return coarse, fine


def eligibility(s):
    o, d = getattr(s, s.possession + '_timeouts') > 0, getattr(s, other(s.possession) + '_timeouts') > 0
    return 'both' if o and d else 'offense' if o else 'defense' if d else None


def keys(band, s, elig):
    coarse, fine = leads(s)
    field = str(max(0, min(4, (s.yardline - 1) // 20)))
    return ['|'.join((band, elig, fine, field)), '|'.join((band, elig, fine)), '|'.join((band, elig, coarse)), '|'.join((band, elig))]


# Pre-declared band coarsening, used only when a floor cell has fewer than MIN opportunities. It
# widens the time window within the same half, family and eligibility; it never crosses clock
# state (family) or budget configuration. Each use is counted.
RUNNING_CHAIN = {'last10': ['le30', 'le120', 'le300'], 'last30': ['le30', 'le120', 'le300'],
                 'last120': ['le300'], 'last300': ['le300']}
RUNNING_MEMBERS = {'le30': ('last10', 'last30'), 'le120': ('last10', 'last30', 'last120'),
                   'le300': ('last10', 'last30', 'last120', 'last300')}
STOPPED_CHAIN = {'last10@h2': ['le30@h2', 'le120@h2', 'le300@h2'], 'last10@h1': ['le30@h1', 'le120@h1'],
                 'last30@h2': ['le30@h2', 'le120@h2', 'le300@h2'], 'last30@h1': ['le30@h1', 'le120@h1'],
                 'last120@h2': ['le120@h2', 'le300@h2'], 'last120@h1': ['le120@h1'],
                 'last300@h2': ['le300@h2'],
                 'normal@q1': ['normal@h1', 'normal@all', 'normal@all~role'],
                 'normal@q2': ['normal@h1', 'normal@all', 'normal@all~role'],
                 'normal@q3': ['normal@h2', 'normal@all', 'normal@all~role'],
                 'normal@q4': ['normal@h2', 'normal@all', 'normal@all~role']}
STOPPED_MEMBERS = {'le30@h1': ('last10@h1', 'last30@h1'), 'le120@h1': ('last10@h1', 'last30@h1', 'last120@h1'),
                   'le30@h2': ('last10@h2', 'last30@h2'), 'le120@h2': ('last10@h2', 'last30@h2', 'last120@h2'),
                   'le300@h2': ('last10@h2', 'last30@h2', 'last120@h2', 'last300@h2'),
                   'normal@h1': ('normal@q1', 'normal@q2'), 'normal@h2': ('normal@q3', 'normal@q4'),
                   'normal@all': ('normal@q1', 'normal@q2', 'normal@q3', 'normal@q4')}
# Last resort, normal bands only: the eligible role's marginal rate over every normal-band
# opportunity where that role had a timeout, whatever the other side's budget. Counted as
# `role_marginal_timeout_cell`. Never used in late bands and never for a role without a timeout.


def coarse_floors(family, band, elig):
    """Ordered coarsened floor keys after the exact floor `band|elig`."""
    if family == 'running':
        base, half = band.split('@')
        return [f'{c}@{half}|{elig}' for c in RUNNING_CHAIN[base]]
    return [f'{c}|{elig}' for c in STOPPED_CHAIN[band]]


def add_coarse(table, family):
    """Adds coarsened floor cells as sums of their member floors (deterministic, sorted)."""
    members = RUNNING_MEMBERS if family == 'running' else STOPPED_MEMBERS
    halves = ('h1', 'h2')
    for elig in ('both', 'offense', 'defense'):
        if family == 'running':
            for coarse, parts in members.items():
                for half in halves:
                    cell = Counter()
                    for part in parts:
                        cell.update(table.get(f'{part}@{half}|{elig}', Counter()))
                    table[f'{coarse}@{half}|{elig}'] = cell
        else:
            for coarse, parts in members.items():
                cell = Counter()
                for part in parts:
                    cell.update(table.get(f'{part}|{elig}', Counter()))
                table[f'{coarse}|{elig}'] = cell
    if family == 'stopped':
        for role in ('offense', 'defense'):
            cell = Counter()
            for elig in ('both', role):
                src = table.get(f'normal@all|{elig}', Counter())
                cell['n'] += src['n']
                cell[role] += src[role]
            table[f'normal@all~role|{role}'] = cell
    return table


COARSE_RANK = {'le30': 0, 'le120': 1, 'le300': 2, 'normal@h1': 0, 'normal@h2': 0, 'normal@all': 1, 'normal@all~role': 9}


def key_rank(key):
    """A global order consistent with every lookup chain (RESIDUAL_BACKOFF_PROTOCOL.md)."""
    band, rest = key.split('|', 1)
    base = band.split('@')[0] if band.startswith('le') else band
    if base in COARSE_RANK:
        return 4 + COARSE_RANK[base]
    parts = rest.split('|')
    if len(parts) == 3:
        return 0
    if len(parts) == 2:
        lead = parts[1]
        return 1 if (any(ch.isdigit() for ch in lead) or lead == 'tied') else 2
    return 3


def residual_cells(ops, family):
    """v0.2.21 residual cells: each key counts only the opportunities that reach it unresolved, so a
    lookup that walks the chain to the first key with n >= MIN reads exactly the opportunities that
    resolved there. `normal@all~role` keeps its v0.2.20 marginal definition (declared exception).
    Returns (cells, number of opportunities left unresolved)."""
    by_key = defaultdict(list)
    for i, (path, _, _) in enumerate(ops):
        for key in dict.fromkeys(path):
            by_key[key].append(i)
    resolved = [False] * len(ops)
    cells = {}
    for key in sorted(by_key, key=lambda k: (key_rank(k), k)):
        if '~role' in key:
            role = key.split('|')[1]
            cell = Counter()
            for i, (_, outcome, meta) in enumerate(ops):
                if meta and meta[0].startswith('normal@q') and meta[1] in ('both', role):
                    cell['n'] += 1
                    cell[role] += int(outcome == role)
        else:
            cell = Counter()
            for i in by_key[key]:
                if not resolved[i]:
                    cell['n'] += 1
                    cell[ops[i][1]] += 1
        cells[key] = cell
        if cell['n'] >= MIN:
            for i in by_key[key]:
                resolved[i] = True
    # Amendment A1: a chain's terminal floor whose residual is below MIN resolved nobody, so nothing
    # reads it except the leftovers; it takes its full (v0.2.20) count instead. Counted in coverage.
    terminal = {path[-1] for path, _, _ in ops}
    for key in sorted(terminal):
        if '~role' in key or cells[key]['n'] >= MIN:
            continue
        full = Counter()
        for i in by_key[key]:
            full['n'] += 1
            full[ops[i][1]] += 1
        if any(not resolved[i] for i in by_key[key]) and full['n'] >= MIN:
            cells[key] = full
            for i in by_key[key]:
                resolved[i] = True
    return cells, resolved.count(False)


def chain(family, band, s, elig):
    """Full lookup order for one opportunity: exact keys, then pre-declared coarsened floors."""
    return keys(band, s, elig) + coarse_floors(family, band, elig)


def stopped_band(s):
    # timeout_contexts' band, read from its floor key 'band|role'.
    return timeout_contexts(s, 'offense')[-1].split('|')[0]


def running_play(rows, i, row, s):
    """(is_running_opportunity, followed, caller_team, continuation_index)."""
    if not (s.phase == 'scrimmage' and s.period in (2, 4) and s.clock <= 300):
        return False, False, None, None
    kind = row.get('play_type')
    if not (kind == 'run' or (kind == 'pass' and row.get('complete_pass') == '1')) or row.get('touchdown') == '1':
        return False, False, None, None
    cont = next((j for j in range(i + 1, min(i + 9, len(rows))) if rows[j]['game_id'] == row['game_id'] and rows[j]['qtr'] == row['qtr']
                 and rows[j].get('posteam') and rows[j].get('down') and rows[j].get('yardline_100')), None)
    if cont is None or rows[cont].get('posteam') != row['posteam']:
        return False, False, None, None
    nxt = rows[i + 1] if i + 1 < len(rows) else {}
    if row.get('timeout') == '1':
        return True, True, row.get('timeout_team'), cont
    if nxt.get('timeout') == '1' and nxt.get('play_type') == 'no_play':
        return True, True, nxt.get('timeout_team'), cont
    return True, False, None, cont


def tabulate(path):
    raw = Path(path).read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    body = gzip.decompress(raw) if raw[:2] == b'\x1f\x8b' else raw
    rows = list(csv.DictReader(io.StringIO(body.decode('utf-8-sig'))))
    running, stopped, coverage = tabulate_rows(rows)
    return running, stopped, coverage, digest


def tabulate_rows(rows):
    """(running cells, stopped cells, coverage) from source rows, coarsened floors included."""
    running_ops, stopped_ops = [], []
    coverage = Counter()
    consumed = set()  # snap rows whose pre-snap decision a no-call running play consumed
    running_timeouts = set()  # timeout rows attributed to a running play
    for i, row in enumerate(rows):
        if row.get('season_type') != 'REG':
            continue
        try:
            s = presnap_state(row)
        except (ValueError, TypeError, KeyError):
            continue
        ok, followed, caller, cont = running_play(rows, i, row, s)
        if not ok:
            continue
        elig = eligibility(s)
        coverage['running_plays'] += 1
        if elig is None:
            coverage['running_no_budget'] += 1
            if not followed:
                consumed.add(cont)
            continue
        outcome = 'none'
        if followed:
            if caller not in (row.get('posteam'), row.get('defteam')):
                coverage['running_excluded:unknown caller'] += 1
                continue
            outcome = 'offense' if caller == row['posteam'] else 'defense'
            running_timeouts.add(i if row.get('timeout') == '1' else i + 1)
        else:
            consumed.add(cont)
        running_ops.append((chain('running', stop_band(s), s, elig), outcome, None))
        coverage['running_opportunities:' + elig] += 1
        coverage['running_calls:' + outcome] += 1
    for i, row, event in training_events(rows):
        if row.get('season_type') != 'REG':
            continue
        timeout = row.get('timeout') == '1' and event != 'play'
        if not timeout and row.get('play_type') not in ('run', 'pass', 'qb_kneel', 'qb_spike', 'punt', 'field_goal'):
            continue
        if timeout and i in running_timeouts:
            coverage['stopped_skipped:running_timeout'] += 1
            continue
        if not timeout and i in consumed:
            coverage['stopped_skipped:decision_consumed'] += 1
            continue
        try:
            if timeout:
                s, caller = recovered_timeout_state(rows, i, row)
            else:
                s, caller = presnap_state(row), None
            if s.period > 4 or s.phase != 'scrimmage':
                continue
        except (ValueError, TypeError, KeyError) as e:
            coverage['stopped_excluded:' + str(e)] += 1
            continue
        elig = eligibility(s)
        if elig is None:
            continue
        outcome = caller if timeout else 'none'
        band = stopped_band(s)
        stopped_ops.append((chain('stopped', band, s, elig), outcome, (band, elig)))
        coverage['stopped_opportunities:' + elig] += 1
        coverage['stopped_calls:' + str(outcome)] += 1

    running, unresolved_r = residual_cells(running_ops, 'running')
    stopped, unresolved_s = residual_cells(stopped_ops, 'stopped')
    coverage['residual_unresolved:running'] = unresolved_r
    coverage['residual_unresolved:stopped'] = unresolved_s
    return running, stopped, coverage


def audit(path):
    running, stopped, coverage, digest = tabulate(path)

    def floors(table):
        out = {}
        for key, c in sorted(table.items()):
            if key.count('|') == 1 and not key.startswith(('le', 'normal@h', 'normal@all')):
                out[key] = dict(n=c['n'], offense=c['offense'], defense=c['defense'], supported=c['n'] >= MIN)
        return out

    def levels(table):
        depth = Counter()
        for key, c in table.items():
            depth[f"level{key.count('|')}:{'ok' if c['n'] >= MIN else 'thin'}"] += 1
        return dict(sorted(depth.items()))

    def resolved(table, family, bands):
        """Floor cells that remain unsupported after the whole pre-declared chain."""
        out = []
        for band in bands:
            for elig in ('both', 'offense', 'defense'):
                exact = f'{band}|{elig}'
                path = [exact] + coarse_floors(family, band, elig)
                if not any(table.get(k, Counter())['n'] >= MIN for k in path):
                    out.append(exact)
        return out

    run_bands = [f'{b}@{h}' for b in ('last10', 'last30', 'last120', 'last300') for h in ('h1', 'h2')]
    stop_bands = list(STOPPED_CHAIN)
    rf, sf = floors(running), floors(stopped)
    return dict(source_sha256=digest, minimum=MIN, coverage=dict(sorted(coverage.items())),
                running_floors=rf, stopped_floors=sf,
                running_levels=levels(running), stopped_levels=levels(stopped),
                unsupported_running_floors=[k for k, v in rf.items() if not v['supported']],
                unsupported_stopped_floors=[k for k, v in sf.items() if not v['supported']],
                unresolved_running_floors=resolved(running, 'running', run_bands),
                unresolved_stopped_floors=resolved(stopped, 'stopped', stop_bands),
                scope='SOURCE_SUPPORT_AUDIT_ONLY; no fit, no simulation, no gate')


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--source', required=True)
    a = p.parse_args()
    print(json.dumps(audit(a.source), indent=2))

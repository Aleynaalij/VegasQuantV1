"""Section 3: mapping team effects onto one context's empirical template weights.

Templates keep their source-recorded outcomes; only weights move. F (every kind outside the run
and pass groups) keeps its total mass and internal proportions. Nothing is clamped: an effect
that cannot be honoured is dropped for that context and counted.
"""
import math
from collections import Counter

RUN = frozenset({'run'})
PASS = frozenset({'pass_complete', 'pass_incomplete', 'sack'})
BRACKET = (-0.5, 0.5)
TOLERANCE = 1e-6
MAX_ITER = 200


def _logistic(x):
    return 1 / (1 + math.exp(-x))


def _tilted_mean(items, lam):
    m = max(lam * y for _, y in items)
    ws = [w * math.exp(lam * y - m) for w, y in items]
    total = sum(ws)
    return sum(w * y for w, (_, y) in zip(ws, items)) / total, ws, total


def solve_tilt(items, shift):
    """lambda with E_lambda[y] = E_0[y] + shift on [(weight, yards)]; (lambda, status)."""
    if len({y for _, y in items}) < 2:
        return 0.0, 'tilt_degenerate'
    base = _tilted_mean(items, 0.0)[0]
    target = base + shift
    lo, hi = BRACKET
    f_lo = _tilted_mean(items, lo)[0] - target
    f_hi = _tilted_mean(items, hi)[0] - target
    if f_lo > 0 or f_hi < 0:
        return 0.0, 'tilt_unattainable'
    for _ in range(MAX_ITER):
        mid = (lo + hi) / 2
        f = _tilted_mean(items, mid)[0] - target
        if abs(f) <= TOLERANCE:
            return mid, 'ok'
        if f < 0:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2, 'ok'


def adjust(entries, templates, g_o=0.0, h_d=0.0, a_o=0.0, b_d=0.0, context=None, log=None):
    """New {template_id: weight} for one context's {template_id: count}.

    With every coefficient zero the original mapping is returned unchanged (same object), so the
    sampler's zero-coefficient path is the untouched base path. `log` (a list) receives one record
    per dropped effect with the context and target.

    Sign convention (protocol amendment A1): b_d and h_d are what a defense *allows*, as estimated
    by the shared ridge (matchup.py `defense_allowed`), so they add: shift = a_o + b_d and the pass
    logit moves by g_o + h_d.
    """
    counts = Counter()
    if g_o == 0 and h_d == 0 and a_o == 0 and b_d == 0:
        return entries, counts
    kind = {k: templates[int(k)]['kind'] for k in entries}
    run = {k: float(v) for k, v in entries.items() if kind[k] in RUN}
    pas = {k: float(v) for k, v in entries.items() if kind[k] in PASS}
    fixed = {k: float(v) for k, v in entries.items() if k not in run and k not in pas}
    m_run, m_pass = sum(run.values()), sum(pas.values())
    mass = m_run + m_pass
    # Step 1: run/pass split, holding the combined mass fixed.
    if mass == 0 or m_pass == 0 or m_run == 0:
        counts['split_degenerate'] += 1
        new_run, new_pass = m_run, m_pass
    else:
        q = _logistic(math.log(m_pass / m_run) + g_o + h_d)
        new_run, new_pass = mass * (1 - q), mass * q
    out = dict(fixed)
    # Step 2: gain tilt within each group, renormalised to the group's new mass.
    for group, new_mass in ((run, new_run), (pas, new_pass)):
        if not group or new_mass == 0:
            continue
        old_mass = sum(group.values())
        items = [(w, float(templates[int(k)].get('yards', 0) or 0)) for k, w in group.items()]
        shift = a_o + b_d
        lam, status = (0.0, 'ok') if shift == 0 else solve_tilt(items, shift)
        if status != 'ok':
            counts[status] += 1
            if log is not None:
                log.append(dict(status=status, context=context, target_shift=shift))
        _, ws, total = _tilted_mean(items, lam) if lam else (None, [w for w, _ in items], old_mass)
        for k, w in zip(group, ws):
            out[k] = w / total * new_mass
    return out, counts

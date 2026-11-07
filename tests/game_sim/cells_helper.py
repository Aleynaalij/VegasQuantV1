"""Synthetic v0.2.20 timeout-cell fixtures for unit tests (RUNNING_CLOCK_PROTOCOL.md)."""
from research.game_sim.timeout_cells import eligibility, keys, stop_band, stopped_band


def floor(state, family):
    band = stop_band(state) if family == 'running' else stopped_band(state)
    return keys(band, state, eligibility(state))[-1]


def cell_model(states, *, running=None, stopped=None):
    """timeout_model with the floor cell of each state set to (n, offense, defense)."""
    model = dict(design='running-clock-cells/0.2.20', running={}, stopped={}, coverage={}, minimum_context=30)
    for family, counts in (('running', running), ('stopped', stopped)):
        if counts is None:
            continue
        for s in states:
            if eligibility(s) is None or (family == 'running' and not (s.period in (2, 4, 5) and s.clock <= 300)):
                continue
            n, o, d = counts
            model[family][floor(s, family)] = dict(n=n, offense=o, defense=d)
    return model

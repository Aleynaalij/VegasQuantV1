"""Source check for the normal@all~role cells (ROLE_MARGINAL_PROTOCOL.md). Descriptive only.

Usage: python3 -m research.game_sim.role_marginal_check <play_by_play_2022.csv.gz>

Reports the source's normal-band stopped opportunities by eligibility and caller, the fitted role
cells, whether a stored `~role|both` cell exists (v0.2.23: yes, with zero calls; v0.2.24: absent),
and the rates the runtime composes for a both-eligible decision at that floor.
The historical v0.2.23 output is preserved in `diagnostics/role-marginal-source-0.2.23.json`.
"""
import csv, gzip, io, json, sys
from collections import Counter
from pathlib import Path
from . import timeout_cells as tc


def report_rows(rows):
    captured = {}
    original = tc.residual_cells

    def spy(ops, family, full_keys=None):
        captured[family] = ops
        return original(ops, family, full_keys)

    tc.residual_cells = spy
    try:
        _, stopped, _ = tc.tabulate_rows(rows)
    finally:
        tc.residual_cells = original
    c = Counter()
    for _, outcome, meta in captured['stopped']:
        if meta and meta[0].startswith('normal@q'):
            c[(meta[1], outcome)] += 1
    off, de = stopped.get('normal@all~role|offense', Counter()), stopped.get('normal@all~role|defense', Counter())
    both = stopped.get('normal@all~role|both')
    return dict(
        normal_band_stopped_opportunities_by_eligibility_and_outcome={f'{e}|{o}': n for (e, o), n in sorted(c.items())},
        both_eligible_n=sum(n for (e, _), n in c.items() if e == 'both'),
        both_eligible_offense_calls=c[('both', 'offense')], both_eligible_defense_calls=c[('both', 'defense')],
        fitted_role_offense=dict(off), fitted_role_defense=dict(de),
        stored_role_both_cell=dict(both) if both is not None else 'absent',
        composed_both_floor=dict(supported=tc.key_supported(stopped, 'normal@all~role|both'),
                                 p_offense=off['offense'] / off['n'] if off['n'] else None,
                                 p_defense=de['defense'] / de['n'] if de['n'] else None),
        scope='DESCRIPTIVE_SOURCE_CHECK_ONLY')


def report(path):
    raw = Path(path).read_bytes()
    body = gzip.decompress(raw) if raw[:2] == b'\x1f\x8b' else raw
    return report_rows(list(csv.DictReader(io.StringIO(body.decode('utf-8-sig')))))


if __name__ == '__main__':
    print(json.dumps(report(sys.argv[1]), indent=1))

"""AUDIT_PLAN §6 accounting for one package (ACCOUNTING_PROTOCOL.md). Fits nothing.

Reads the package batch's full-batch `coverage.censoring` counters and recomputes from the source
which terminal timeout keys took their full count (residual amendment A1), so their usage in the
batch can be summed. Also reconciles the relabelled counters against an older batch if given.
"""
import argparse, csv, gzip, io, json
from collections import defaultdict
from pathlib import Path
from .timeout_cells import tabulate_rows

RETIRED = ('clock_preserved_samples', 'half_pooled_fallback', 'half_preserved_samples')


def batch_counts(folder):
    raw = (Path(folder) / 'batch.json.gz').read_bytes() if (Path(folder) / 'batch.json.gz').exists() else (Path(folder) / 'batch.json').read_bytes()
    batch = json.loads(gzip.decompress(raw) if raw[:2] == b'\x1f\x8b' else raw)
    return batch, batch['coverage']['censoring']


def full_count_keys(source):
    raw = Path(source).read_bytes()
    body = gzip.decompress(raw) if raw[:2] == b'\x1f\x8b' else raw
    rows = list(csv.DictReader(io.StringIO(body.decode('utf-8-sig'))))
    keys = {}
    tabulate_rows(rows, keys)
    return {family: sorted(v) for family, v in keys.items()}


def report(folder, source, previous=None):
    batch, c = batch_counts(folder)
    full = full_count_keys(source)
    paths = defaultdict(dict)
    for k, v in sorted(c.items()):
        if k.startswith('play_context:'):
            _, branch, path = k.split(':', 2)
            paths[branch][path] = v
    terminal = {k: v for k, v in sorted(c.items()) if k.startswith('timeout_terminal_floor:')}
    full_use = {f'{fam}:{key}': c.get(f'timeout_terminal_floor:{fam}:{key}', 0) for fam, ks in full.items() for key in ks}
    out = dict(
        scope='ACCOUNTING_ONLY', package=str(folder), runs=batch['runs'], model_sha256=batch['artifact_sha256'],
        play_context_paths=dict(paths), play_context_draws=sum(v for k, v in c.items() if k.startswith('play_context:')),
        play_context_length={k.split(':')[1]: v for k, v in sorted(c.items()) if k.startswith('play_context_length:')},
        band_labels={k: c.get(k, 0) for k in ('band_preserved_samples', 'band_half_preserved_samples', 'band_half_pooled_fallback', 'last300_normal_fallback')},
        two_minute_warning={k: c.get(k, 0) for k in ('two_minute_warning_snapped', 'two_minute_warning_seconds_restored', 'warning_censored_resampled', 'warning_censored_unresolved')},
        terminal_full_count_keys=full, terminal_full_count_lookups=sum(full_use.values()), terminal_full_count_by_key=full_use,
        terminal_floor_lookups=terminal,
        clipping={k: c.get(k, 0) for k in ('elapsed_clipped_to_clock', 'spot_clamped', 'yards_clamped_to_field', 'runoff_clipped_to_clock', 'penalty_half_distance')},
        other_paths={k: v for k, v in sorted(c.items()) if not k.startswith(('play_context', 'timeout_terminal_floor:', 'timeout_cell:', 'separate_timeout:'))},
        timeout_cell_depths={k: v for k, v in sorted(c.items()) if k.startswith('timeout_cell:')})
    if previous:
        _, p = batch_counts(previous)
        b, f = c.get('band_preserved_samples', 0), c.get('last300_normal_fallback', 0)
        checks = {
            'band_preserved + last300_normal_fallback == old clock_preserved': [b + f, p.get('clock_preserved_samples')],
            'band_half_pooled + last300_normal_fallback == old half_pooled': [c.get('band_half_pooled_fallback', 0) + f, p.get('half_pooled_fallback')],
            'band_half_preserved == old half_preserved': [c.get('band_half_preserved_samples', 0), p.get('half_preserved_samples')],
        }
        shared = {k: [p[k], c.get(k)] for k in p if isinstance(p[k], (int, float)) and k not in RETIRED and p[k] != c.get(k)}
        out['reconciliation'] = dict(checks={k: dict(new=v[0], old=v[1], ok=v[0] == v[1]) for k, v in checks.items()},
                                     shared_counters_changed=shared, retired_in_new=[k for k in RETIRED if k in c])
    return out


if __name__ == '__main__':
    a = argparse.ArgumentParser()
    a.add_argument('--folder', required=True)
    a.add_argument('--source', required=True)
    a.add_argument('--previous')
    x = a.parse_args()
    print(json.dumps(report(x.folder, x.source, x.previous), indent=2))

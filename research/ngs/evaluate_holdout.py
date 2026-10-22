"""NGS-003: the pre-registered holdout test of the NGS risk flags (docs/research/ngs-backtest-plan.md).

    python research/ngs/evaluate_holdout.py --dataset /tmp/vq-ngs/dataset.csv --output docs/research/ngs-backtest-results.json

Run once, on the NGS-002 dataset. For each statistic and applicable flag in the 2024-2025 holdout,
legs with a known flag are split into flagged and unflagged; legs whose flag is missing are left
out. A flag becomes a rule proposal only if all three hold:
  * flagged clear rate at least 8 points below unflagged;
  * at least 150 flagged legs;
  * the 95% interval of the difference (Newcombe's Wilson-score method) excludes zero.
Development seasons are reported for context and decide nothing.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path

Z = 1.959963984540054
MIN_GAP_POINTS = 8.0
MIN_FLAGGED = 150
FLAGS = ("F1", "F2", "F3", "F4", "F5", "F6")


def wilson(hits: int, n: int) -> tuple[float, float]:
    if n == 0:
        return (math.nan, math.nan)
    p = hits / n
    centre = (p + Z * Z / (2 * n)) / (1 + Z * Z / n)
    half = Z * math.sqrt(p * (1 - p) / n + Z * Z / (4 * n * n)) / (1 + Z * Z / n)
    return (centre - half, centre + half)


def newcombe(h1: int, n1: int, h2: int, n2: int) -> tuple[float, float, float]:
    """Difference p1 - p2 with Newcombe's hybrid Wilson-score 95% interval."""
    p1, p2 = h1 / n1, h2 / n2
    l1, u1 = wilson(h1, n1)
    l2, u2 = wilson(h2, n2)
    d = p1 - p2
    return d, d - math.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2), d + math.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2)


def evaluate(rows: list[dict]) -> dict:
    cells = defaultdict(lambda: {"flagged": [0, 0], "unflagged": [0, 0], "missing": 0})
    for r in rows:
        for flag in filter(None, r["applicable_flags"].split(",")):
            c = cells[(r["split"], r["statistic"], flag)]
            if r[flag] == "":
                c["missing"] += 1
                continue
            side = c["flagged" if r[flag] == "1" else "unflagged"]
            side[0] += int(r["cleared"])
            side[1] += 1
    out = {}
    for (split, stat, flag), c in sorted(cells.items()):
        (hf, nf), (hu, nu) = c["flagged"], c["unflagged"]
        entry = {"flagged_legs": nf, "flagged_clear_rate": hf / nf if nf else None,
                 "unflagged_legs": nu, "unflagged_clear_rate": hu / nu if nu else None, "missing_flag": c["missing"]}
        if nf and nu:
            d, lo, hi = newcombe(hf, nf, hu, nu)
            entry.update({"difference_points": 100 * d, "difference_95pct_points": [100 * lo, 100 * hi]})
            if split == "holdout":
                checks = {"gap_at_least_8_points": 100 * d <= -MIN_GAP_POINTS,
                          "at_least_150_flagged": nf >= MIN_FLAGGED,
                          "interval_excludes_zero": hi < 0}
                entry["checks"] = checks
                entry["rule_proposal"] = all(checks.values())
        elif split == "holdout":
            entry["checks"] = None
            entry["rule_proposal"] = False
        out[f"{split}:{stat}:{flag}"] = entry
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dataset", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    a = ap.parse_args()
    raw = a.dataset.read_bytes()
    rows = list(csv.DictReader(raw.decode("utf-8").splitlines()))
    results = evaluate(rows)
    report = {"plan": "docs/research/ngs-backtest-plan.md", "dataset_sha256": hashlib.sha256(raw).hexdigest(),
              "rows": len(rows), "rule": {"min_gap_points": MIN_GAP_POINTS, "min_flagged": MIN_FLAGGED,
              "interval": "Newcombe hybrid Wilson-score 95%", "missing_flags": "excluded"},
              "results": results,
              "rule_proposals": [k for k, v in results.items() if v.get("rule_proposal")]}
    a.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({k: {"flagged": v["flagged_legs"], "flag_rate": round(v["flagged_clear_rate"] or 0, 3),
        "unflagged_rate": round(v["unflagged_clear_rate"] or 0, 3), "diff_pts": round(v.get("difference_points", 0), 1),
        "ci": [round(x, 1) for x in v.get("difference_95pct_points", [])], "proposal": v.get("rule_proposal")}
        for k, v in results.items() if k.startswith("holdout")}, indent=1))
    print(json.dumps({"rule_proposals": report["rule_proposals"]}))


if __name__ == "__main__":
    main()

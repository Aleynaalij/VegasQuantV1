"""v0.4 (v0.3 + NGS inputs) against v0.3 on the same player-games. See ngs-v0.4-plan.md.

    python research/probability/compare_v04.py --data player_stats_2022.csv ... stats_player_week_2026.csv \
        --ngs ngs_receiving.csv.gz ngs_rushing.csv.gz --test-year 2025 --output /tmp/v04

Fits both versions on train <= 2022, calibrates on 2023 and scores the test season. The paired
Brier difference (v0.4 minus v0.3) gets a 1,000-replicate NFL-game-clustered bootstrap, seed 1701.
Research output only: nothing is published and no gate changes.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path
import numpy as np
import pandas as pd
from engine import MARKETS, normalize, prepare, fit, probabilities, calibrate, calibrated, metrics
from ngs_features import NgsIndex

THRESHOLDS = [20.5, 40.5, 60.5, 80.5, 100.5]


def scored(frame, market, ngs, train_end, calibration_year, test_year, max_week=None):
    rows = prepare(frame, market, ngs)
    train = [r for r in rows if r["season"] <= train_end]
    calib = [r for r in rows if r["season"] == calibration_year]
    test = [r for r in rows if r["season"] == test_year and (max_week is None or r["week"] <= max_week)]
    model = fit(train)
    cp, cy, _ = probabilities(model, calib, THRESHOLDS)
    model["calibration"] = calibrate(cp, cy)
    p, y, _ = probabilities(model, test, THRESHOLDS)
    return test, calibrated(p, model["calibration"]), y


def paired(test_a, p_a, test_b, p_b, y):
    """Bootstrap the per-player-game Brier difference b - a, clustered by NFL game."""
    if [(r["player_id"], r["season"], r["week"]) for r in test_a] != [(r["player_id"], r["season"], r["week"]) for r in test_b]:
        raise ValueError("Versions scored different player-games")
    k = len(THRESHOLDS)
    delta = ((p_b - y) ** 2 - (p_a - y) ** 2).reshape(-1, k).mean(axis=1)
    games = defaultdict(list)
    for row, d in zip(test_a, delta):
        games[row["game_key"]].append(d)
    sums = np.array([sum(v) for v in games.values()])
    counts = np.array([len(v) for v in games.values()])
    rng = np.random.default_rng(1701)
    means = []
    for _ in range(1000):
        i = rng.integers(0, len(sums), len(sums))
        means.append(float(sums[i].sum() / counts[i].sum()))
    return {"brier_difference": float(delta.mean()), "difference_95pct": np.quantile(means, [.025, .975]).tolist(),
            "nfl_games": len(sums), "player_games": len(delta)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", nargs="+", required=True)
    ap.add_argument("--ngs", nargs=2, required=True, metavar=("RECEIVING", "RUSHING"))
    ap.add_argument("--test-year", type=int, default=2025)
    ap.add_argument("--max-week", type=int, help="Only score test weeks up to this one (2026 check)")
    ap.add_argument("--output", required=True)
    a = ap.parse_args()
    frame = pd.concat([normalize(pd.read_csv(p, low_memory=False)) for p in a.data], ignore_index=True)
    ngs = NgsIndex({"receiving": pd.read_csv(a.ngs[0], low_memory=False), "rushing": pd.read_csv(a.ngs[1], low_memory=False)})
    report = {"plan": "research/probability/ngs-v0.4-plan.md", "test_year": a.test_year, "max_week": a.max_week, "markets": {},
              "sources": [{"file": Path(p).name, "sha256": hashlib.sha256(Path(p).read_bytes()).hexdigest()} for p in [*a.data, *a.ngs]]}
    for market in MARKETS:
        t3, p3, y3 = scored(frame, market, None, 2022, 2023, a.test_year, a.max_week)
        t4, p4, y4 = scored(frame, market, ngs, 2022, 2023, a.test_year, a.max_week)
        if not np.array_equal(y3, y4):
            raise ValueError("Outcomes differ between versions")
        cmp = paired(t3, p3, t4, p4, y3)
        upper = cmp["difference_95pct"][1]
        report["markets"][market] = {"v0.3": metrics(p3, y3), "v0.4": metrics(p4, y4), "paired": cmp,
            "meets_primary_rule": upper < 0 if a.max_week is None else None,
            "meets_fresh_check": cmp["brier_difference"] <= 0 if a.max_week is not None else None}
        for v in ("v0.3", "v0.4"):
            report["markets"][market][v].pop("calibration_bins")
    out = Path(a.output)
    out.mkdir(parents=True, exist_ok=True)
    (out / "comparison.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({m: {"v0.3": round(r["v0.3"]["brier"], 6), "v0.4": round(r["v0.4"]["brier"], 6), **r["paired"],
        "primary": r["meets_primary_rule"], "fresh": r["meets_fresh_check"]} for m, r in report["markets"].items()}, indent=2))


if __name__ == "__main__":
    main()

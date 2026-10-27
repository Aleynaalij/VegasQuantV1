"""v0.5 rushing (v0.3 + game-script inputs) against v0.3. See rushing-v0.5-plan.md.

    python research/probability/compare_v05.py --data player_stats_2022.csv ... stats_player_week_2026.csv \
        --schedules games.csv --output /tmp/v05

Fits both versions on train <= 2022, calibrates on 2023, then scores 2025 (secondary) and 2026 from
Week 7 (primary). The paired Brier difference (v0.5 minus v0.3) gets a 1,000-replicate
NFL-game-clustered bootstrap, seed 1701. Research output only: nothing is published.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
import pandas as pd
from engine import normalize, prepare, fit, probabilities, calibrate, calibrated, metrics
from compare_v04 import THRESHOLDS, paired
from game_lines import GameLines

MARKET = "rushing"
FRESH = (2026, 7)  # First week no version has scored against player outcomes.


def scored(rows, test):
    model = fit([r for r in rows if r["season"] <= 2022])
    cp, cy, _ = probabilities(model, [r for r in rows if r["season"] == 2023], THRESHOLDS)
    model["calibration"] = calibrate(cp, cy)
    t = [r for r in rows if test(r)]
    p, y, _ = probabilities(model, t, THRESHOLDS)
    return t, calibrated(p, model["calibration"]), y


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", nargs="+", required=True)
    ap.add_argument("--schedules", required=True)
    ap.add_argument("--output", required=True)
    a = ap.parse_args()
    frame = pd.concat([normalize(pd.read_csv(p, low_memory=False)) for p in a.data], ignore_index=True)
    lines = GameLines(pd.read_csv(a.schedules, low_memory=False))
    v3, v5 = prepare(frame, MARKET), prepare(frame, MARKET, lines=lines)
    samples = {"2025": lambda r: r["season"] == 2025,
               "2026_from_week_7": lambda r: (r["season"], r["week"]) >= FRESH}
    report = {"plan": "research/probability/rushing-v0.5-plan.md", "market": MARKET, "samples": {},
              "sources": [{"file": Path(p).name, "sha256": hashlib.sha256(Path(p).read_bytes()).hexdigest()}
                          for p in [*a.data, a.schedules]]}
    for name, test in samples.items():
        t3, p3, y3 = scored(v3, test)
        t5, p5, y5 = scored(v5, test)
        if not np.array_equal(y3, y5):
            raise ValueError("Outcomes differ between versions")
        cmp = paired(t3, p3, t5, p5, y3)
        m3, m5 = metrics(p3, y3), metrics(p5, y5)
        m3.pop("calibration_bins"), m5.pop("calibration_bins")
        report["samples"][name] = {"weeks": sorted({(r["season"], r["week"]) for r in t3}),
                                   "v0.3": m3, "v0.5": m5, "paired": cmp}
    s25, s26 = report["samples"]["2025"]["paired"], report["samples"]["2026_from_week_7"]["paired"]
    report["passes_stage_1"] = bool(s26["brier_difference"] <= 0 and s25["brier_difference"] <= 0
                                    and s25["difference_95pct"][1] < 0)
    out = Path(a.output)
    out.mkdir(parents=True, exist_ok=True)
    (out / "comparison.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({n: {"v0.3": round(s["v0.3"]["brier"], 6), "v0.5": round(s["v0.5"]["brier"], 6), **s["paired"]}
                      for n, s in report["samples"].items()} | {"passes_stage_1": report["passes_stage_1"]}, indent=2))


if __name__ == "__main__":
    main()

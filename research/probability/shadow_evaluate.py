"""Grade the hosted shadow journal and build the qualification dossier (qualification.md).

Research only. `grade` reads forecasts whose game ended at least six hours ago, takes each player's
final yards from the nflverse weekly stats and records them append-only. `report` scores every
graded forecast against the frozen October 16 protocol and stores the dossier in
private.nfl_qualification_reports. Neither step approves a model: approval stays a documented human
decision. The repository is public, so the job prints counts and pass/fail flags only.

  python shadow_evaluate.py grade
  python shadow_evaluate.py report

Environment: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
"""
from __future__ import annotations
import argparse
from collections import defaultdict
import hashlib
import json
import math
import os
from pathlib import Path
import random
import sys
import tempfile
import urllib.request

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from hosted_scan import MODEL, NFLVERSE, Supabase  # noqa: E402

PROTOCOL = "qualification-2026-10-16"
YARDS = {"rushing": "rushing_yards", "receiving": "receiving_yards"}
# Frozen protocol values: review floors, the price band and the claimed edge.
MIN_PLAYER_GAMES, MIN_GAMES, MIN_SLICE = 200, 40, 50
BAND = (-249, -150)
EDGE_PP = 3.0
BOOTSTRAP, SEED = 1000, 20261016


def download(season: int, folder: Path) -> Path:
    path = folder / f"stats_player_week_{season}.csv"
    with urllib.request.urlopen(NFLVERSE.format(season), timeout=120) as r:
        path.write_bytes(r.read())
    return path


def outcomes(pending, frames):
    """Final yards per pending forecast. A player missing from a week whose team already appears
    in the file did not play (void); a team missing from the week is not published yet (left pending)."""
    rows, teams = {}, set()
    for season, (frame, url, sha) in frames.items():
        for r in frame.to_dict("records"):
            key = (season, int(r["week"]))
            teams.add((*key, r.get("recent_team")))
            if r.get("season_type", "REG") == "REG" and r.get("player_id"):
                rows[(*key, r["player_id"])] = (r, url, sha)
    graded = []
    for p in pending:
        key = (int(p["season"]), int(p["week"]))
        if p["season"] not in frames or (*key, p["team"]) not in teams:
            continue
        found = rows.get((*key, p["player_id"]))
        url, sha = frames[p["season"]][1:]
        if found is None:
            graded.append({"forecast_id": p["forecast_id"], "void": True, "source_url": url, "source_sha256": sha})
            continue
        value = found[0].get(YARDS[p["market"]])
        if value is None or (isinstance(value, float) and math.isnan(value)):
            continue
        graded.append({"forecast_id": p["forecast_id"], "void": False, "yards": max(float(value), 0.0),
                       "source_url": url, "source_sha256": sha})
    return graded


def grade(db: Supabase, fetch=download) -> dict:
    pending = db.request("/rest/v1/rpc/nfl_shadow_pending_outcomes", {}) or []
    if not pending:
        return {"pending": 0, "recorded": 0}
    import pandas as pd
    from engine import normalize
    frames = {}
    with tempfile.TemporaryDirectory() as tmp:
        for season in sorted({int(p["season"]) for p in pending}):
            path = fetch(season, Path(tmp))
            frames[season] = (normalize(pd.read_csv(path, low_memory=False)), NFLVERSE.format(season),
                              hashlib.sha256(path.read_bytes()).hexdigest())
    graded = outcomes(pending, frames)
    result = db.request("/rest/v1/rpc/record_nfl_shadow_outcomes", {"p_outcomes": graded}) if graded else {}
    return {"pending": len(pending), "graded": len(graded), **(result or {})}


def implied(odds: float) -> float:
    return 100 / (odds + 100) if odds > 0 else -odds / (-odds + 100)


def profit(odds: float) -> float:
    return odds / 100 if odds > 0 else 100 / -odds


def settle(r) -> str:
    """win / loss / push for an over or under at the stored line."""
    if r["void"]:
        return "void"
    y, line = float(r["yards"]), float(r["line"])
    if y == line:
        return "push"
    return "win" if (y > line) == (r["direction"] == "over") else "loss"


def first_observations(rows):
    """Protocol main sample: the first capture per player/game/market/direction/line."""
    first = {}
    for r in sorted(rows, key=lambda r: r["recorded_at"]):
        first.setdefault((r["player_id"], r["game_id"], r["market"], r["direction"], float(r["line"])), r)
    return list(first.values())


def clustered(values_by_game, stat, rng):
    """95% game-clustered bootstrap interval of stat(list of values)."""
    games = list(values_by_game)
    if len(games) < 2:
        return None
    draws = []
    for _ in range(BOOTSTRAP):
        sample = [v for g in (rng.choice(games) for _ in games) for v in values_by_game[g]]
        if sample:
            draws.append(stat(sample))
    draws.sort()
    return [draws[int(0.025 * len(draws))], draws[int(0.975 * len(draws)) - 1]]


def mean(xs):
    return sum(xs) / len(xs) if xs else None


def scope_report(rows, rng):
    settled = [(r, settle(r)) for r in rows]
    decided = [(r, s) for r, s in settled if s in ("win", "loss")]
    counts = {k: sum(s == k for _, s in settled) for k in ("win", "loss", "push", "void")}
    games = {r["game_id"] for r, _ in decided}
    player_games = {(r["player_id"], r["game_id"]) for r, _ in decided}
    # Conditional no-push probability, as priced (engine.evaluate_quote).
    p = lambda r: float(r["research_probability"]) / (1 - float(r["push_probability"] or 0))
    y = lambda s: 1.0 if s == "win" else 0.0
    brier = lambda q, s: (q - y(s)) ** 2
    model_brier = mean([brier(p(r), s) for r, s in decided])
    price_brier = mean([brier(implied(float(r["odds"])), s) for r, s in decided])
    log_loss = mean([-math.log(min(max(p(r) if s == "win" else 1 - p(r), 1e-12), 1)) for r, s in decided])
    paired = defaultdict(list)
    for r, s in decided:
        if r["no_vig_probability"] is not None:
            paired[r["game_id"]].append(brier(p(r), s) - brier(float(r["no_vig_probability"]), s))
    diffs = [d for v in paired.values() for d in v]
    reliability = []
    for lo in [i / 10 for i in range(10)]:
        b = [(p(r), y(s)) for r, s in decided if lo <= p(r) < lo + 0.1 or (lo == 0.9 and p(r) == 1)]
        if b:
            reliability.append({"bin": [lo, round(lo + 0.1, 1)], "n": len(b),
                                "forecast": mean([q for q, _ in b]), "observed": mean([o for _, o in b])})
    band = [(r, s) for r, s in settled if s != "void" and BAND[0] <= float(r["odds"]) <= BAND[1]]
    eligible = [(r, s) for r, s in band if r["direction"] == "over" and float(r["estimated_edge_pp"]) >= EDGE_PP]
    units = defaultdict(list)
    for r, s in eligible:
        units[r["game_id"]].append(profit(float(r["odds"])) if s == "win" else 0.0 if s == "push" else -1.0)
    flat = [u for v in units.values() for u in v]
    clv = [implied(float(r["closing_odds"])) - implied(float(r["odds"])) for r, _ in eligible if r["closing_odds"] is not None]
    novig_interval = clustered(paired, mean, rng)
    return_interval = clustered(units, mean, rng)
    floors = {"player_games": len(player_games) >= MIN_PLAYER_GAMES, "games": len(games) >= MIN_GAMES,
              "price_band_slice": len([1 for _, s in band if s in ("win", "loss")]) >= MIN_SLICE}
    criteria = {
        "review_floors": all(floors.values()),
        "beats_no_vig_brier": bool(novig_interval and novig_interval[1] < 0),
        "positive_return_lower_bound": bool(return_interval and return_interval[0] > 0),
    }
    return {
        "counts": counts, "player_games": len(player_games), "games": len(games), "floors": floors,
        "brier": {"model": model_brier, "raw_price": price_brier, "log_loss": log_loss},
        "no_vig": {"paired": len(diffs), "model_minus_no_vig_brier": mean(diffs), "ci95": novig_interval},
        "reliability": reliability,
        "eligible_cohort": {"definition": f"over, price {BAND[0]} to {BAND[1]}, estimated edge >= {EDGE_PP}pp",
                            "n": len(flat), "flat_unit_return": mean(flat), "ci95": return_interval,
                            "clv_coverage": len(clv), "mean_clv_probability": mean(clv)},
        "criteria": criteria,
        "meets_protocol": all(criteria.values()),
    }


def build_report(rows, model_id: str) -> dict:
    rng = random.Random(SEED)
    main = first_observations(rows)
    scopes = defaultdict(list)
    for r in main:
        scopes[f"{r['market']}:{r['player_position']}"].append(r)
    return {"protocol": PROTOCOL, "model_id": model_id, "graded_forecasts": len(rows), "main_sample": len(main),
            "scopes": {k: scope_report(v, rng) for k, v in sorted(scopes.items())},
            "note": "Research evaluation only. Passing every criterion makes a scope eligible for a documented human "
                    "approval review; it does not approve the model or authorize any publication."}


def report(db: Supabase) -> dict:
    model_id = json.loads(MODEL.read_text())["model_id"]
    rows = db.request("/rest/v1/rpc/nfl_shadow_evaluation_rows", {"p_model_id": model_id}) or []
    dossier = build_report(rows, model_id)
    db.request("/rest/v1/rpc/record_nfl_qualification_report",
               {"p_model_id": model_id, "p_protocol": PROTOCOL, "p_report": dossier})
    return {"graded_forecasts": dossier["graded_forecasts"], "main_sample": dossier["main_sample"],
            "scopes": {k: {"player_games": v["player_games"], "games": v["games"], "criteria": v["criteria"]}
                       for k, v in dossier["scopes"].items()}}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("step", choices=["grade", "report"])
    args = parser.parse_args()
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not configured; nothing to do.", file=sys.stderr)
        return
    db = Supabase(url, key)
    print(json.dumps(grade(db) if args.step == "grade" else report(db), allow_nan=False))


if __name__ == "__main__":
    main()

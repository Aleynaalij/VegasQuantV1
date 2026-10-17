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
    """Final yards per pending forecast that has a row in the weekly stats. A missing row is left
    pending, never voided: the weekly file omits players who took snaps without recording a
    stat (a receiver never targeted), so absence does not prove the player sat out."""
    rows = {}
    for season, (frame, url, sha) in frames.items():
        for r in frame.to_dict("records"):
            if r.get("season_type", "REG") == "REG" and r.get("player_id"):
                rows[(season, int(r["week"]), r["player_id"])] = (r, url, sha)
    graded = []
    for p in pending:
        found = rows.get((int(p["season"]), int(p["week"]), p["player_id"]))
        if found is None:
            continue
        url, sha = found[1:]
        value = found[0].get(YARDS[p["market"]])
        if value is None or (isinstance(value, float) and math.isnan(value)):
            continue
        graded.append({"forecast_id": p["forecast_id"], "void": False, "yards": max(float(value), 0.0),
                       "source_url": url, "source_sha256": sha})
    return graded


def load(seasons, fetch=download):
    """Season -> (normalized weekly frame, source URL, SHA-256)."""
    import pandas as pd
    from engine import normalize
    frames = {}
    with tempfile.TemporaryDirectory() as tmp:
        for season in sorted(seasons):
            path = fetch(season, Path(tmp))
            frames[season] = (normalize(pd.read_csv(path, low_memory=False)), NFLVERSE.format(season),
                              hashlib.sha256(path.read_bytes()).hexdigest())
    return frames


def grade(db: Supabase, fetch=download) -> dict:
    # Ungraded finished forecasts, plus graded ones still inside the correction window.
    pending = db.request("/rest/v1/rpc/nfl_shadow_pending_outcomes", {}) or []
    if not pending:
        return {"pending": 0, "recorded": 0}
    frames = load({int(p["season"]) for p in pending}, fetch)
    graded = outcomes(pending, frames)
    result = db.request("/rest/v1/rpc/record_nfl_shadow_outcomes", {"p_outcomes": graded}) if graded else {}
    return {"pending": len(pending), "graded": len(graded), **(result or {})}


def add_baselines(rows, frames):
    """Each row's empirical baseline: the player's prior 16 same-team regular-season games at the
    same line (the engine's validation baseline), conditional on no push."""
    games = defaultdict(list)
    for frame, _, _ in frames.values():
        for r in frame.to_dict("records"):
            if r.get("season_type", "REG") == "REG" and r.get("player_id"):
                games[(r["player_id"], r.get("recent_team"))].append(r)
    for history in games.values():
        history.sort(key=lambda r: (int(r["season"]), int(r["week"])))
    for row in rows:
        target = (int(row["season"]), int(row["week"]))
        prior = [r for r in games.get((row["player_id"], row["team"]), []) if (int(r["season"]), int(r["week"])) < target][-16:]
        values = [max(float(r[YARDS[row["market"]]]), 0.0) for r in prior if r.get(YARDS[row["market"]]) == r.get(YARDS[row["market"]])]
        line = float(row["line"])
        wins = sum(v > line if row["direction"] == "over" else v < line for v in values)
        decided = sum(v != line for v in values)
        row["baseline_probability"] = wins / decided if decided else None
    return rows


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


# The frozen protocol's initial claims; every other market/position stays diagnostic only.
SUPPORTED_SCOPES = {"rushing:RB", "receiving:WR"}
# Approval slices inside the price band: the engine's tested 20.5-100.5 line range, by the inclusive
# bounds reported in the dossier. A whole-yard line on a boundary (40.0) or outside the range (20.0)
# belongs to no slice.
LINE_SLICES = [(20.5, 39.5), (40.5, 59.5), (60.5, 79.5), (80.5, 100.5)]


def effective(pairs):
    """Distinct player-games and games: alternate lines for one player in one game are correlated
    and must not multiply the effective sample size."""
    return {"player_games": len({(r["player_id"], r["game_id"]) for r, _ in pairs}),
            "games": len({r["game_id"] for r, _ in pairs})}


def metrics(settled, rng):
    """Calibration, historical-baseline and no-vig comparisons and flat-unit returns for a set of
    (row, settlement) pairs."""
    decided = [(r, s) for r, s in settled if s in ("win", "loss")]
    # Conditional no-push probability, as priced (engine.evaluate_quote).
    p = lambda r: float(r["research_probability"]) / (1 - float(r["push_probability"] or 0))
    y = lambda s: 1.0 if s == "win" else 0.0
    brier = lambda q, s: (q - y(s)) ** 2
    paired = defaultdict(list)
    for r, s in decided:
        if r["no_vig_probability"] is not None:
            paired[r["game_id"]].append(brier(p(r), s) - brier(float(r["no_vig_probability"]), s))
    diffs = [d for v in paired.values() for d in v]
    # Each player's prior-16-game hit rate at the same line (engine validation baseline).
    versus_history = defaultdict(list)
    for r, s in decided:
        if r.get("baseline_probability") is not None:
            versus_history[r["game_id"]].append(brier(p(r), s) - brier(float(r["baseline_probability"]), s))
    history_diffs = [d for v in versus_history.values() for d in v]
    reliability = []
    for lo in [i / 10 for i in range(10)]:
        b = [(p(r), y(s)) for r, s in decided if lo <= p(r) < lo + 0.1 or (lo == 0.9 and p(r) == 1)]
        if b:
            reliability.append({"bin": [lo, round(lo + 0.1, 1)], "n": len(b),
                                "forecast": mean([q for q, _ in b]), "observed": mean([o for _, o in b])})
    eligible = [(r, s) for r, s in settled if s != "void" and BAND[0] <= float(r["odds"]) <= BAND[1]
                and r["direction"] == "over" and float(r["estimated_edge_pp"]) >= EDGE_PP]
    units = defaultdict(list)
    for r, s in eligible:
        units[r["game_id"]].append(profit(float(r["odds"])) if s == "win" else 0.0 if s == "push" else -1.0)
    flat = [u for v in units.values() for u in v]
    clv = [implied(float(r["closing_odds"])) - implied(float(r["odds"])) for r, _ in eligible if r["closing_odds"] is not None]
    return {
        "decided": len(decided), "decided_effective": effective(decided),
        "brier": {"model": mean([brier(p(r), s) for r, s in decided]),
                  "raw_price": mean([brier(implied(float(r["odds"])), s) for r, s in decided]),
                  "log_loss": mean([-math.log(min(max(p(r) if s == "win" else 1 - p(r), 1e-12), 1)) for r, s in decided])},
        "historical_baseline": {"paired": len(history_diffs), "model_minus_baseline_brier": mean(history_diffs),
                                "ci95": clustered(versus_history, mean, rng)},
        "no_vig": {"paired": len(diffs),
                   "paired_effective": effective([(r, s) for r, s in decided if r["no_vig_probability"] is not None]),
                   "model_minus_no_vig_brier": mean(diffs), "ci95": clustered(paired, mean, rng)},
        "reliability": reliability,
        "eligible_cohort": {"definition": f"over, price {BAND[0]} to {BAND[1]}, estimated edge >= {EDGE_PP}pp",
                            "n": len(flat), "n_effective": effective(eligible), "flat_unit_return": mean(flat), "ci95": clustered(units, mean, rng),
                            "clv_coverage": len(clv), "mean_clv_probability": mean(clv)},
    }


def scope_report(scope, rows, rng):
    """`rows` is the scope's main sample, graded or not. Only graded rows are scored; the rest are
    reported as pending so a dossier never hides unresolved forecasts."""
    graded = [r for r in rows if r.get("graded", True)]
    pending = [r for r in rows if not r.get("graded", True)]
    settled = [(r, settle(r)) for r in graded]
    decided = [(r, s) for r, s in settled if s in ("win", "loss")]
    games = {r["game_id"] for r, _ in decided}
    player_games = {(r["player_id"], r["game_id"]) for r, _ in decided}
    scope_floors = {"player_games": len(player_games) >= MIN_PLAYER_GAMES, "games": len(games) >= MIN_GAMES}
    supported = scope in SUPPORTED_SCOPES
    slices = []
    for lo, hi in LINE_SLICES:
        part = [(r, s) for r, s in settled if BAND[0] <= float(r["odds"]) <= BAND[1] and lo <= float(r["line"]) <= hi]
        m = metrics(part, rng)
        criteria = {
            # A slice is the scope proposed for approval, so the protocol's floors apply to the slice
            # itself, counted in distinct player-games and games, not in correlated quotes.
            "review_floors": all(scope_floors.values()) and m["decided_effective"]["player_games"] >= max(MIN_SLICE, MIN_PLAYER_GAMES)
                             and m["decided_effective"]["games"] >= MIN_GAMES,
            # Missing no-vig coverage blocks the claim: the paired comparison needs its own floor.
            "no_vig_coverage": m["no_vig"]["paired_effective"]["player_games"] >= MIN_SLICE,
            "beats_no_vig_brier": bool(m["no_vig"]["ci95"] and m["no_vig"]["ci95"][1] < 0),
            # A few winning selections cannot carry the return claim: the cohort needs its own floor.
            "return_sample": m["eligible_cohort"]["n_effective"]["player_games"] >= MIN_SLICE,
            "positive_return_lower_bound": bool(m["eligible_cohort"]["ci95"] and m["eligible_cohort"]["ci95"][0] > 0),
        }
        slices.append({"price": list(BAND), "lines": [lo, hi], **m, "criteria": criteria,
                       "meets_protocol": supported and all(criteria.values())})
    return {
        "supported": supported,
        "counts": {**{k: sum(s == k for _, s in settled) for k in ("win", "loss", "push", "void")},
                   "corrected": sum(1 for r in graded if r.get("corrections")),
                   "pending_finished": sum(1 for r in pending if r.get("finished")),
                   "pending_upcoming": sum(1 for r in pending if not r.get("finished"))},
        "player_games": len(player_games), "games": len(games), "floors": scope_floors,
        "all_lines": metrics(settled, rng),
        "slices": slices,
        "eligible_slices": [s["lines"] for s in slices if s["meets_protocol"]],
    }


def provenance(rows, input_sources):
    """What a dossier was computed from: the weekly files behind the baselines, the outcome sources,
    and a digest of every scored outcome version, so a stored report can be reproduced or audited
    after nflverse files or corrections change."""
    graded = sorted((r for r in rows if r.get("graded", True)), key=lambda r: str(r["forecast_id"]))
    scored = [[str(r["forecast_id"]), r.get("yards"), bool(r.get("void")), r.get("outcome_version"),
               r.get("outcome_source_sha256")] for r in graded]
    return {
        "baseline_inputs": input_sources,
        "outcome_sources": sorted({(r["outcome_source_url"], r["outcome_source_sha256"]) for r in graded
                                   if r.get("outcome_source_sha256")}),
        "corrected_outcome_versions": sorted(str(r["outcome_version"]) for r in graded if r.get("outcome_version")),
        "scored_outcomes_sha256": hashlib.sha256(json.dumps(scored, sort_keys=True, default=str).encode()).hexdigest(),
    }


def scan_coverage(runs):
    """The candidates that never became forecasts: per hosted run, its coverage counts, blocker
    reasons and recorded forecasts, summed across runs."""
    totals, blockers = defaultdict(int), defaultdict(int)
    for run in runs:
        for k, v in (run.get("coverage") or {}).items():
            totals[k] += int(v or 0)
        counts = run.get("blocker_counts")
        if isinstance(counts, dict):
            for reason, n in counts.items():
                blockers[reason] += int(n or 0)
        else:
            # Runs that only summarise by game: count each reason once per game it blocked.
            for game in run.get("per_game") or []:
                reasons = (game or {}).get("blockers") or {}
                for reason, n in (reasons.items() if isinstance(reasons, dict) else ((r, 1) for r in reasons)):
                    blockers[reason] += int(n or 0)
    return {"runs": len(runs), "runs_with_forecasts": sum(1 for r in runs if r.get("recorded_forecasts")),
            "recorded_forecasts": sum(int(r.get("recorded_forecasts") or 0) for r in runs),
            "candidates": dict(totals), "blocker_counts": dict(sorted(blockers.items()))}


def build_report(rows, model_id: str, input_sources=None, runs=None) -> dict:
    rng = random.Random(SEED)
    # The first capture is chosen among every captured forecast, before outcomes are known.
    main = first_observations(rows)
    scopes = defaultdict(list)
    for r in main:
        scopes[f"{r['market']}:{r['player_position']}"].append(r)
    return {"protocol": PROTOCOL, "model_id": model_id, "captured_forecasts": len(rows),
            "graded_forecasts": sum(1 for r in rows if r.get("graded", True)), "main_sample": len(main),
            "provenance": provenance(rows, input_sources or []),
            "scan_coverage": scan_coverage(runs or []),
            "scopes": {k: scope_report(k, v, rng) for k, v in sorted(scopes.items())},
            "note": "Research evaluation only. A slice that meets every criterion is eligible for a documented human "
                    "approval review; it does not approve the model or authorize any publication. Scopes outside "
                    "RB rushing and WR receiving are diagnostic only."}


def report(db: Supabase, fetch=download) -> dict:
    model_id = json.loads(MODEL.read_text())["model_id"]
    rows = db.request("/rest/v1/rpc/nfl_shadow_evaluation_rows", {"p_model_id": model_id}) or []
    runs = db.request("/rest/v1/rpc/nfl_shadow_scan_coverage", {"p_model_id": model_id}) or []
    input_sources = []
    if rows:
        seasons = {int(r["season"]) for r in rows}
        frames = load(seasons | {s - 1 for s in seasons}, fetch)
        add_baselines(rows, frames)
        input_sources = [{"season": s, "source_url": url, "sha256": sha} for s, (_, url, sha) in sorted(frames.items())]
    dossier = build_report(rows, model_id, input_sources, runs)
    db.request("/rest/v1/rpc/record_nfl_qualification_report",
               {"p_model_id": model_id, "p_protocol": PROTOCOL, "p_report": dossier})
    return {"scan_runs": dossier["scan_coverage"]["runs"],
            "captured_forecasts": dossier["captured_forecasts"], "graded_forecasts": dossier["graded_forecasts"],
            "main_sample": dossier["main_sample"],
            "scopes": {k: {"supported": v["supported"], "player_games": v["player_games"], "games": v["games"],
                           "counts": v["counts"], "eligible_slices": v["eligible_slices"]}
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

"""NBA shadow scorecard: grades the pregame journal against recorded box scores and the betting market.

Research only. Reads the service-only `nba_shadow_evaluation_rows` (forecasts for started games, the
Over result from public.nba_grade and the same book's closing price) and stores one report through
`record_nba_shadow_report`. Protocol and floors: research/nba/MODEL.md. The report can say a market
is ready for owner review; it never approves the model or creates picks. Prints counts only.

Environment: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
"""
from __future__ import annotations
from collections import defaultdict
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from hosted_scan import MODEL, Supabase, iso  # noqa: E402

PROTOCOL = "nba-shadow-2026-10-17"
MIN_FORECASTS, MIN_GAMES, MIN_NO_VIG, MIN_RETURN, MIN_CLV = 300, 40, 200, 100, 150
EDGE_PP, BOOTSTRAP, SEED = 3.0, 1000, 1701


def implied(odds):
    return 100 / (odds + 100) if odds > 0 else -odds / (-odds + 100)


def profit(odds):
    return odds / 100 if odds > 0 else 100 / -odds


def rows(db: Supabase, model_id: str):
    out, after = [], 0
    while True:
        page = db.request("/rest/v1/rpc/nba_shadow_evaluation_rows", {"p_model": model_id, "p_after": after, "p_limit": 1000})
        out += page
        if len(page) < 1000:
            return out
        after = page[-1]["id"]


def first_captures(data):
    """The earliest forecast per game, player, market and line: one test per quote, no repeats."""
    first = {}
    for r in sorted(data, key=lambda r: (r["observed_at"], r["id"])):
        first.setdefault((r["game_id"], r["athlete_id"], r["market"], float(r["line"])), r)
    return list(first.values())


def clustered(values, games, rng):
    """95% interval of the mean, resampling whole games."""
    by = defaultdict(list)
    for v, g in zip(values, games):
        by[g].append(v)
    sums = np.array([sum(v) for v in by.values()])
    counts = np.array([len(v) for v in by.values()])
    means = [sums[i].sum() / counts[i].sum() for i in (rng.integers(0, len(sums), len(sums)) for _ in range(BOOTSTRAP))]
    return [float(x) for x in np.quantile(means, [.025, .975])]


def market_report(data, rng):
    graded = [r for r in data if r["result"] in ("WIN", "LOSS")]
    games = {r["game_id"] for r in graded}
    out = {"forecasts": len(data), "graded": len(graded), "games": len(games),
           "pending": sum(r["result"] == "PENDING" for r in data), "void": sum(r["result"] == "VOID" for r in data),
           "review": sum(r["result"] == "REVIEW" for r in data)}
    if not graded:
        return {**out, "criteria": {}, "ready_for_owner_review": False}
    p = np.array([float(r["over_probability"]) for r in graded])
    y = np.array([r["result"] == "WIN" for r in graded], dtype=float)
    out["model_brier"] = float(np.mean((p - y) ** 2))
    out["observed_over_rate"] = float(y.mean())
    paired = [r for r in graded if r["no_vig_over"] is not None]
    out["no_vig_pairs"] = len(paired)
    if paired:
        q = np.array([float(r["no_vig_over"]) for r in paired])
        pp = np.array([float(r["over_probability"]) for r in paired])
        yy = np.array([r["result"] == "WIN" for r in paired], dtype=float)
        delta = (pp - yy) ** 2 - (q - yy) ** 2
        out["no_vig_brier"] = float(np.mean((q - yy) ** 2))
        out["model_minus_no_vig_brier"] = float(delta.mean())
        out["model_minus_no_vig_brier_95pct"] = clustered(delta, [r["game_id"] for r in paired], rng)
    # The side the model prefers over the no-vig price, priced as offered when the forecast was made.
    bets, clv = [], []
    for r in paired:
        over = float(r["over_probability"]) > float(r["no_vig_over"])
        model_p = float(r["over_probability"]) if over else 1 - float(r["over_probability"])
        market_p = float(r["no_vig_over"]) if over else 1 - float(r["no_vig_over"])
        odds, close = (r["over_odds"], r["close_over_odds"]) if over else (r["under_odds"], r["close_under_odds"])
        if close is not None:
            clv.append(implied(close) - implied(odds))
        if (model_p - market_p) * 100 >= EDGE_PP:
            won = (r["result"] == "WIN") == over
            bets.append((profit(odds) if won else -1.0, r["game_id"]))
    out["closing_line_value"] = {"n": len(clv), "mean_pp": float(np.mean(clv) * 100) if clv else None,
                                 "beat_close_rate": float(np.mean([c > 0 for c in clv])) if clv else None}
    out["flat_return"] = {"n": len(bets), "edge_threshold_pp": EDGE_PP,
                          "units_per_bet": float(np.mean([b[0] for b in bets])) if bets else None,
                          "units_per_bet_95pct": clustered([b[0] for b in bets], [b[1] for b in bets], rng) if len(bets) >= 20 else None}
    criteria = {
        "sample_floors": out["graded"] >= MIN_FORECASTS and out["games"] >= MIN_GAMES,
        "no_vig_coverage": out["no_vig_pairs"] >= MIN_NO_VIG,
        "beats_no_vig_brier": bool(paired) and out["model_minus_no_vig_brier_95pct"][1] < 0,
        "closing_coverage": len(clv) >= MIN_CLV,
        "positive_closing_line_value": bool(clv) and out["closing_line_value"]["mean_pp"] > 0,
        "return_sample": len(bets) >= MIN_RETURN,
        "positive_return_lower_bound": out["flat_return"]["units_per_bet_95pct"] is not None and out["flat_return"]["units_per_bet_95pct"][0] > 0,
    }
    return {**out, "criteria": criteria, "ready_for_owner_review": all(criteria.values())}


def build_report(model_id, data, now):
    rng = np.random.default_rng(SEED)
    sample = first_captures(data)
    by_market = defaultdict(list)
    for r in sample:
        by_market[r["market"]].append(r)
    return {"protocol": PROTOCOL, "model_id": model_id, "generated_at": iso(now), "status": "SHADOW_ONLY",
            "official_eligible": False, "forecast_rows": len(data), "first_captures": len(sample),
            "floors": {"graded": MIN_FORECASTS, "games": MIN_GAMES, "no_vig_pairs": MIN_NO_VIG, "return_bets": MIN_RETURN, "clv_pairs": MIN_CLV},
            "markets": {m: market_report(v, rng) for m, v in sorted(by_market.items())},
            "note": "Ready for owner review is not approval. Official NBA picks need a separate, owner-approved gate."}


def main():
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("Supabase credentials not configured; nothing to do")
        return
    db, now = Supabase(url, key), datetime.now(timezone.utc)
    model_id = json.loads(MODEL.read_text())["model_id"]
    report = build_report(model_id, rows(db, model_id), now)
    db.request("/rest/v1/rpc/record_nba_shadow_report", {"p": {"model_id": model_id, "report": report}})
    print(json.dumps({"first_captures": report["first_captures"], **{m: {k: s[k] for k in ("graded", "games", "pending", "ready_for_owner_review")}
                      for m, s in report["markets"].items()}}))


if __name__ == "__main__":
    main()

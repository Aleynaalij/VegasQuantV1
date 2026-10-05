"""Vegas Quant v0.1: pregame opportunity/efficiency distribution, research only.

Train, calibrate and test on disjoint chronological seasons. No market data is
used in fitting. This module never publishes picks or alters account balances.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
from collections import defaultdict
import numpy as np
import pandas as pd
from scipy.optimize import minimize
from scipy.special import expit, logit

VERSION = "vq-opportunity-efficiency-0.1"
MARKETS = {"rushing": ("carries", "rushing_yards", 6),
           "receiving": ("targets", "receiving_yards", 3)}
FEATURES = ["intercept", "recent_opportunities", "long_opportunities",
            "opportunity_trend", "historical_efficiency", "opponent_yards_ratio",
            "opponent_opportunities_ratio", "history_size", "quarterback", "tight_end"]

def implied(odds):
    if not np.isfinite(odds) or abs(odds) < 100:
        raise ValueError("Valid American odds required")
    return 100 / (odds + 100) if odds > 0 else -odds / (-odds + 100)

def weighted(values):
    a = np.asarray(values, dtype=float)
    w = 0.85 ** np.arange(len(a)-1, -1, -1)
    return float(np.average(a, weights=w))

def feature(history, opponent_history, league_history, position, market):
    """Only rows observed BEFORE the prediction week can be passed here."""
    count, yards, _ = MARKETS[market]
    h = history[-16:]
    counts = [r[count] for r in h]
    efficiencies = [(max(r[yards], 0)+1)/(r[count]+1) for r in h]
    league = league_history[-512:]
    opp = opponent_history[-8:]
    # Empirical-Bayes shrinkage toward league mean, with 8 pseudo-games.
    league_y = np.mean([r[1] for r in league]) if league else 1
    league_c = np.mean([r[0] for r in league]) if league else 1
    oy = (sum(r[1] for r in opp)+8*league_y)/(len(opp)+8)
    oc = (sum(r[0] for r in opp)+8*league_c)/(len(opp)+8)
    return np.array([1, np.log1p(weighted(counts[-4:])), np.log1p(weighted(counts)),
        np.log1p(weighted(counts[-4:]))-np.log1p(weighted(counts)),
        np.log(weighted(efficiencies)), np.log(max(oy, .01)/max(league_y, .01)),
        np.log(max(oc, .01)/max(league_c, .01)), len(h)/16,
        float(position == "QB"), float(position == "TE")])

def prepare(frame, market):
    required = {"player_id", "recent_team", "opponent_team", "season", "week",
                "season_type", "position", *MARKETS[market][:2]}
    if required-set(frame.columns):
        raise ValueError(f"Missing columns: {sorted(required-set(frame.columns))}")
    d = frame[frame.season_type == "REG"].copy()
    if d.duplicated(["player_id", "season", "week"]).any():
        raise ValueError("Duplicate player-week records")
    if d[list(required)].isna().any().any():
        raise ValueError("Missing required historical fields")
    count, yards, minimum = MARKETS[market]
    if (d[count] < 0).any():
        raise ValueError("Negative opportunities")
    allowed_positions = {"RB"} if market == "rushing" else {"RB", "WR", "TE"}
    history, defense, league = defaultdict(list), defaultdict(list), defaultdict(list)
    result = []
    for (season, week), group in d.sort_values(["season", "week", "player_id"]).groupby(["season", "week"], sort=True):
        for row in group.to_dict("records"):
            h = history[(row["player_id"], row["recent_team"])]
            pos = row["position"]
            if pos in allowed_positions and len(h) >= 4 and weighted([r[count] for r in h[-16:]]) >= minimum:
                x = feature(h, defense[(row["opponent_team"], pos)], league[pos], pos, market)
                result.append({"season": int(season), "week": int(week), "player_id": row["player_id"],
                    "team": row["recent_team"], "opponent": row["opponent_team"], "position": pos,
                    "count": float(row[count]), "yards": float(row[yards]), "x": x.tolist(),
                    "baseline": [float(r[yards]) for r in h[-16:]]})
        # Update state only AFTER all predictions for this week are prepared.
        for row in group.to_dict("records"):
            history[(row["player_id"], row["recent_team"])].append(row)
        for (opponent, pos), part in group.groupby(["opponent_team", "position"]):
            totals = (float(part[count].sum()), float(part[yards].sum()))
            defense[(opponent, pos)].append(totals)
            league[pos].append(totals)
    return result

def ridge(x, y):
    penalty = np.eye(x.shape[1])*10
    penalty[0, 0] = 0
    return np.linalg.solve(x.T@x+penalty, x.T@y)

def fit(rows):
    x = np.array([r["x"] for r in rows])
    volume = np.log1p([r["count"] for r in rows])
    efficiency = np.log([(max(r["yards"], 0)+1)/(r["count"]+1) for r in rows])
    bv, be = ridge(x, volume), ridge(x, efficiency)
    residuals = np.column_stack((volume-x@bv, efficiency-x@be))
    pools = {pos: residuals[[r["position"] == pos for r in rows]].tolist()
             for pos in sorted({r["position"] for r in rows})}
    return {"volume_coefficients": bv.tolist(), "efficiency_coefficients": be.tolist(),
            "residual_pairs": pools, "train_rows": len(rows)}

def distribution(model, row):
    x = np.array(row["x"])
    errors = np.array(model["residual_pairs"].get(row["position"], []))
    if len(errors) < 100:
        raise ValueError("Insufficient position residual history")
    # Paired residuals retain opportunity/efficiency correlation and volume risk.
    values = np.expm1(x@np.array(model["volume_coefficients"])+errors[:, 0]
        + x@np.array(model["efficiency_coefficients"])+errors[:, 1])
    return np.maximum(0, np.rint(values))

def probabilities(model, rows, thresholds):
    p, y, b = [], [], []
    for row in rows:
        values = distribution(model, row)
        for threshold in thresholds:
            p.append(float(np.mean(values > threshold)))
            y.append(float(row["yards"] > threshold))
            b.append(float(np.mean(np.array(row["baseline"]) > threshold)))
    return np.array(p), np.array(y), np.array(b)

def calibrate(p, y):
    z = logit(np.clip(p, .001, .999))
    def loss(ab):
        q = np.clip(expit(ab[0]+ab[1]*z), 1e-8, 1-1e-8)
        return float(-np.mean(y*np.log(q)+(1-y)*np.log(1-q))+.001*(ab[1]-1)**2)
    result = minimize(loss, [0., 1.], bounds=[(-5, 5), (.1, 5)])
    if not result.success:
        raise ValueError("Calibration optimization failed")
    return result.x.tolist()

def calibrated(p, ab):
    return expit(ab[0]+ab[1]*logit(np.clip(p, .001, .999)))

def metrics(p, y):
    p = np.clip(p, 1e-8, 1-1e-8)
    bins = []
    for low in np.arange(0, 1, .1):
        mask = (np.minimum((p*10).astype(int), 9) == round(low*10))
        if mask.any():
            bins.append({"lower": round(float(low), 1), "n": int(mask.sum()),
                         "predicted": float(p[mask].mean()), "observed": float(y[mask].mean())})
    return {"threshold_predictions": len(y), "brier": float(np.mean((p-y)**2)),
        "log_loss": float(-np.mean(y*np.log(p)+(1-y)*np.log(1-p))),
        "ece": sum(b["n"]*abs(b["predicted"]-b["observed"]) for b in bins)/len(y),
        "calibration_bins": bins}

def train(frame, train_end=2022, calibration_year=2023, test_year=2024):
    if not train_end < calibration_year < test_year:
        raise ValueError("Train/calibration/test must be chronological and disjoint")
    artifact, report = {"version": VERSION, "models": {}, "features": FEATURES}, {"version": VERSION, "markets": {}}
    for market in MARKETS:
        rows = prepare(frame, market)
        sets = [[r for r in rows if r["season"] <= train_end],
                [r for r in rows if r["season"] == calibration_year],
                [r for r in rows if r["season"] == test_year]]
        if min(map(len, sets)) < 200:
            raise ValueError(f"{market}: at least 200 pregame examples needed per split")
        model = fit(sets[0])
        thresholds = [20.5, 40.5, 60.5, 80.5, 100.5]  # Predeclared; no test-year optimization.
        cp, cy, _ = probabilities(model, sets[1], thresholds)
        model["calibration"] = calibrate(cp, cy)
        p, y, b = probabilities(model, sets[2], thresholds)
        score = metrics(calibrated(p, model["calibration"]), y)
        baseline = metrics(b, y)
        # Player-game block bootstrap: thresholds from one row are correlated.
        delta = ((calibrated(p, model["calibration"])-y)**2-(b-y)**2).reshape(-1,len(thresholds)).mean(axis=1)
        rng = np.random.default_rng(1701)
        means = [float(np.mean(rng.choice(delta, len(delta), replace=True))) for _ in range(1000)]
        score["baseline_brier_difference_95pct"] = np.quantile(means, [.025, .975]).tolist()
        report["markets"][market] = {"train_player_games": len(sets[0]),
            "calibration_player_games": len(sets[1]), "test_player_games": len(sets[2]),
            "thresholds": thresholds, "model": score, "empirical_player_baseline": baseline}
        artifact["models"][market] = model
    artifact["splits"] = {"train_through": train_end, "calibration": calibration_year, "test": test_year}
    report["splits"] = artifact["splits"]
    report["release_status"] = "SHADOW_ONLY"
    report["blockers"] = ["No archived timestamped player-prop odds for held-out price/EV testing",
        "No prospective current-season validation", "Injury/role changes require verified manual review",
        "No tested prediction of spread, total, moneyline, touchdown or parlay probabilities"]
    report["note"] = "Threshold tests are diagnostic yard forecasts, not historical sportsbook wagers. No ROI or edge is established. Bootstrap clusters by player-game, not NFL game; cross-player correlation remains a limitation."
    artifact["validation"] = report
    artifact["model_id"] = hashlib.sha256(json.dumps(artifact, sort_keys=True).encode()).hexdigest()
    return artifact, report

def evaluate_quote(artifact, row, quote, as_of):
    """Estimate a research probability, price it, then apply the release gate."""
    market = quote["market"]
    if market not in MARKETS or quote["direction"] not in {"over", "under", "at_least"}:
        raise ValueError("Unsupported market/direction")
    if row["player_id"] != quote["player_id"] or row["opponent"] != quote["opponent"]:
        raise ValueError("Quote and forecast identity mismatch")
    if "team" in quote and row.get("team") != quote["team"]:
        raise ValueError("Quote and forecast team mismatch")
    if not quote.get("sportsbook", "").strip():
        raise ValueError("Named sportsbook required")
    at, observed, kickoff = map(pd.Timestamp, [as_of, quote["observed_at"], quote["kickoff"]])
    if any(t.tz is None for t in [at, observed, kickoff]):
        raise ValueError("Timezone-aware timestamps required")
    if not quote["source_url"].startswith("https://") or observed > at or at >= kickoff:
        raise ValueError("Verified pregame quote and source required")
    if (row["season"], row["week"]) != (quote["season"], quote["week"]):
        raise ValueError("Forecast and quote game window mismatch")
    threshold = float(quote["line"])
    if not np.isfinite(threshold) or threshold < 0 or threshold*2 != round(threshold*2):
        raise ValueError("Nonnegative whole/half-yard threshold required")
    model = artifact["models"][market]
    values = distribution(model, row)
    # Calibrated survival function; differencing supplies coherent discrete push mass.
    survival = lambda t: float(calibrated(float(np.mean(values > t)), model["calibration"]))
    if quote["direction"] == "at_least":
        if threshold != int(threshold):
            raise ValueError("Alternative at-least line must be integral")
        win, push = survival(threshold-.5), 0.
    elif threshold == int(threshold):
        over, ge = survival(threshold+.5), survival(threshold-.5)
        push = max(0., ge-over)
        win = over if quote["direction"] == "over" else 1-ge
    else:
        push = 0.
        win = survival(threshold) if quote["direction"] == "over" else 1-survival(threshold)
    break_even = implied(float(quote["odds"]))
    profit = quote["odds"]/100 if quote["odds"]>0 else 100/-quote["odds"]
    edge = (win/(1-push)-break_even)*100
    ev = win*profit-(1-win-push)
    blockers = list(artifact["validation"]["blockers"])
    if row.get("history_through") is None:
        blockers.append("Historical input cutoff is not documented")
    elif tuple(row["history_through"]) >= (quote["season"],quote["week"]):
        raise ValueError("Historical input contains target-week or future outcomes")
    elif row["history_through"][0] < quote["season"]-1:
        blockers.append("Player history is stale")
    elif row["history_through"][0] == quote["season"] and quote["week"]-row["history_through"][1] > 2:
        blockers.append("Recent workload history is missing")
    if at-observed > pd.Timedelta(minutes=15):
        blockers.append("Quote older than 15 minutes")
    if not quote.get("availability_verified"):
        blockers.append("Current player/role availability unverified")
    if quote.get("role_change"):
        blockers.append("Role change outside validated feature assumptions")
    return {"model_id": artifact["model_id"], "version": VERSION, "research_probability": win,
        "push_probability": push, "break_even_probability": break_even,
        "estimated_edge_pp": edge, "estimated_ev_per_unit": ev,
        "median_yards": float(np.median(values)), "yard_interval_10_90": np.quantile(values,[.1,.9]).tolist(),
        "quote": quote, "forecast_inputs": dict(zip(FEATURES,row["x"])),
        "status": "WAIT" if blockers else ("BETTABLE" if edge >= 3 and ev > 0 else "PASS"),
        "official_eligible": False, "blockers": blockers,
        "warning": "Experimental research output; neither validated edge nor an official recommendation."}

def forecast_inputs(frame, market, quote):
    """Construct live features using prior weeks only; no synthetic outcomes."""
    target = (int(quote["season"]), int(quote["week"]))
    past = frame[(frame.season_type == "REG") &
        ((frame.season < target[0]) | ((frame.season == target[0]) & (frame.week < target[1])))].copy()
    past = past.sort_values(["season", "week", "player_id"])
    if past.duplicated(["player_id", "season", "week"]).any():
        raise ValueError("Duplicate historical records")
    history = past[(past.player_id == quote["player_id"]) & (past.recent_team == quote["team"])]
    if len(history) < 4:
        raise ValueError("At least four prior same-team games required")
    pos = history.iloc[-1].position
    if pos not in ({"RB"} if market == "rushing" else {"RB", "WR", "TE"}):
        raise ValueError("Position is outside the supported model cohort")
    count, yards, minimum = MARKETS[market]
    if weighted(history[count].tail(16).tolist()) < minimum:
        raise ValueError("Workload is below validated cohort threshold")
    defense = past[past.position == pos].groupby(["season", "week", "opponent_team"])[[count,yards]].sum().reset_index()
    league = list(defense[[count,yards]].itertuples(index=False, name=None))
    opponent = list(defense[defense.opponent_team == quote["opponent"]][[count,yards]].itertuples(index=False,name=None))
    x = feature(history.to_dict("records"), opponent, league, pos, market)
    return {"player_id": quote["player_id"], "position": pos, "opponent": quote["opponent"],
            "team": quote["team"], "season": target[0], "week": target[1], "x": x.tolist(),
            "history_through": [int(history.iloc[-1].season),int(history.iloc[-1].week)]}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", nargs="+", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", help="Existing immutable model; skip fitting")
    parser.add_argument("--quotes", help="JSON array of timestamped exact-market quotes")
    parser.add_argument("--as-of", help="Timezone-aware quote evaluation timestamp")
    args = parser.parse_args()
    paths = [Path(p) for p in args.data]
    frame = pd.concat([pd.read_csv(p) for p in paths], ignore_index=True)
    if args.model:
        if not args.quotes or not args.as_of:
            parser.error("--model requires --quotes and --as-of")
        artifact = json.loads(Path(args.model).read_text())
        expected = hashlib.sha256(json.dumps({k:v for k,v in artifact.items() if k!="model_id"},sort_keys=True).encode()).hexdigest()
        if expected != artifact.get("model_id"):
            raise ValueError("Model artifact integrity check failed")
        quotes = json.loads(Path(args.quotes).read_text())
        outputs = [evaluate_quote(artifact,forecast_inputs(frame,q["market"],q),q,args.as_of) for q in quotes]
        Path(args.output).write_text(json.dumps(outputs,indent=2,allow_nan=False)+"\n")
        print(json.dumps({"forecasts":len(outputs),"official_eligible":0}))
        return
    artifact, report = train(frame)
    manifest = [{"file": p.name, "source_url": "https://github.com/nflverse/nflverse-data/releases/download/player_stats/"+p.name,
        "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in paths]
    artifact["sources"] = manifest
    report["sources"] = manifest
    artifact["model_id"] = hashlib.sha256(json.dumps({k:v for k,v in artifact.items() if k!="model_id"},sort_keys=True).encode()).hexdigest()
    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    (out/"model.json").write_text(json.dumps(artifact, indent=2, allow_nan=False)+"\n")
    (out/"validation.json").write_text(json.dumps(report, indent=2, allow_nan=False)+"\n")
    print(json.dumps({"model_id": artifact["model_id"], "status": report["release_status"],
        "markets": {m: {"test_games": s["test_player_games"], "brier": s["model"]["brier"],
        "baseline_brier": s["empirical_player_baseline"]["brier"]} for m,s in report["markets"].items()}}, indent=2))

if __name__ == "__main__":
    main()

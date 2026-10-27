"""Vegas Quant NBA v0.1: pregame minutes x per-minute-rate distribution, research only.

Mirrors the NFL v0.3 engine (research/probability/engine.py) with NBA inputs: volume is minutes,
efficiency is the stat per minute, games are keyed by ESPN game id and ordered by date. Train,
calibrate and test on disjoint chronological seasons (regular season only). No market data is used
in fitting. This module never publishes picks or alters account balances.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path
import numpy as np
import pandas as pd
from scipy.optimize import minimize
from scipy.special import expit, logit

VERSION = "vq-nba-minutes-rate-0.1"
SOURCE = "https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_nba_player_boxscores/"
# The Odds API market key -> box-score column, predeclared test thresholds, minimum recent minutes.
MARKETS = {"player_points": ("points", [9.5, 14.5, 19.5, 24.5, 29.5]),
           "player_rebounds": ("rebounds", [3.5, 5.5, 7.5, 9.5, 11.5])}
MIN_HISTORY, MIN_MINUTES = 5, 20.0
# The Odds API spelling, as stored in nba_games; ESPN's "LA Clippers" is the one alias.
TEAMS = {"Atlanta Hawks", "Boston Celtics", "Brooklyn Nets", "Charlotte Hornets", "Chicago Bulls", "Cleveland Cavaliers",
         "Dallas Mavericks", "Denver Nuggets", "Detroit Pistons", "Golden State Warriors", "Houston Rockets", "Indiana Pacers",
         "Los Angeles Clippers", "Los Angeles Lakers", "Memphis Grizzlies", "Miami Heat", "Milwaukee Bucks",
         "Minnesota Timberwolves", "New Orleans Pelicans", "New York Knicks", "Oklahoma City Thunder", "Orlando Magic",
         "Philadelphia 76ers", "Phoenix Suns", "Portland Trail Blazers", "Sacramento Kings", "San Antonio Spurs",
         "Toronto Raptors", "Utah Jazz", "Washington Wizards"}
ALIASES = {"LA Clippers": "Los Angeles Clippers"}
POSITIONS = {"G": "G", "PG": "G", "SG": "G", "F": "F", "SF": "F", "PF": "F", "C": "C"}
FEATURES = ["intercept", "recent_minutes", "long_minutes", "minutes_trend", "starter_share",
            "historical_rate", "recent_rate", "opponent_rate_ratio", "home", "back_to_back",
            "history_size", "center", "forward"]

def normalize(frame):
    """Played regular-season rows between NBA teams; DNP rows and All-Star exhibitions are excluded."""
    d = frame.copy()
    required = {"game_id", "season", "season_type", "game_date", "athlete_id", "team_display_name", "opponent_team_display_name",
                "minutes", "points", "rebounds", "starter", "did_not_play", "home_away", "athlete_position_abbreviation"}
    if required - set(d.columns):
        raise ValueError(f"Missing columns: {sorted(required - set(d.columns))}")
    d["team"] = d.team_display_name.replace(ALIASES)
    d["opponent"] = d.opponent_team_display_name.replace(ALIASES)
    d = d[(d.season_type == 2) & (d.did_not_play.astype(str).str.lower() != "true") & d.minutes.notna()
          & d.team.isin(TEAMS) & d.opponent.isin(TEAMS)].copy()
    d["position"] = d.athlete_position_abbreviation.map(POSITIONS)
    if d.position.isna().any():
        raise ValueError("Unknown position abbreviation")
    if d.duplicated(["athlete_id", "game_id"]).any():
        raise ValueError("Duplicate player-game records")
    stats = d[["minutes", "points", "rebounds"]].to_numpy(dtype=float)
    if not np.isfinite(stats).all() or (stats < 0).any():
        raise ValueError("Nonfinite or negative box-score values")
    d["date"] = pd.to_datetime(d.game_date)
    d["starter"] = d.starter.astype(str).str.lower() == "true"
    return d.sort_values(["date", "game_id", "athlete_id"])

def implied(odds):
    if not np.isfinite(odds) or abs(odds) < 100:
        raise ValueError("Valid American odds required")
    return 100 / (odds + 100) if odds > 0 else -odds / (-odds + 100)

def weighted(values, decay=.9):
    a = np.asarray(values, dtype=float)
    return float(np.average(a, weights=decay ** np.arange(len(a) - 1, -1, -1)))

def feature(history, opponent_history, league_history, position, stat, home, rest_days):
    """Only games played BEFORE the target game can be passed here."""
    h = history[-20:]
    minutes = [r["minutes"] for r in h]
    rates = [(r[stat] + 1) / (r["minutes"] + 1) for r in h]
    league = league_history[-600:]
    opp = opponent_history[-10:]
    # Opponent stat allowed per minute to this position, shrunk toward the league with 10 pseudo-games.
    league_rate = sum(r[0] for r in league) / max(sum(r[1] for r in league), 1) if league else 1
    opp_rate = (sum(r[0] for r in opp) + 10 * league_rate * 48) / (sum(r[1] for r in opp) + 10 * 48)
    return np.array([1, np.log1p(weighted(minutes[-5:])), np.log1p(weighted(minutes)),
        np.log1p(weighted(minutes[-5:])) - np.log1p(weighted(minutes)),
        float(np.mean([r["starter"] for r in h[-10:]])),
        np.log(weighted(rates)), np.log(weighted(rates[-5:])),
        np.log(max(opp_rate, 1e-3) / max(league_rate, 1e-3)),
        float(home), float(rest_days <= 1), len(h) / 20,
        float(position == "C"), float(position == "F")])

def eligible(history):
    return len(history) >= MIN_HISTORY and weighted([r["minutes"] for r in history[-20:]]) >= MIN_MINUTES

def prepare(frame, market):
    stat = MARKETS[market][0]
    d = normalize(frame)
    history, defense, league, last_game = defaultdict(list), defaultdict(list), defaultdict(list), {}
    result = []
    for date, group in d.groupby("date", sort=True):
        rows = group.to_dict("records")
        for row in rows:
            h = history[(row["athlete_id"], row["team"])]
            if not eligible(h):
                continue
            previous = last_game.get(row["team"])
            rest = (date - previous).days if previous is not None else 7
            x = feature(h, defense[(row["opponent"], row["position"])], league[row["position"]],
                        row["position"], stat, row["home_away"] == "home", rest)
            result.append({"season": int(row["season"]), "date": str(date.date()), "game_id": str(row["game_id"]),
                "athlete_id": str(row["athlete_id"]), "team": row["team"], "opponent": row["opponent"],
                "position": row["position"], "minutes": float(row["minutes"]), "value": float(row[stat]),
                "x": x.tolist(), "baseline": [float(r[stat]) for r in h[-20:]]})
        # Update state only AFTER every prediction for this date is prepared.
        for row in rows:
            history[(row["athlete_id"], row["team"])].append(row)
        for (opponent, position), part in group.groupby(["opponent", "position"]):
            totals = (float(part[stat].sum()), float(part.minutes.sum()))
            defense[(opponent, position)].append(totals)
            league[position].append(totals)
        for team in group.team.unique():
            last_game[team] = date
    return result

def ridge(x, y):
    penalty = np.eye(x.shape[1]) * 10
    penalty[0, 0] = 0
    return np.linalg.solve(x.T @ x + penalty, x.T @ y)

def fit(rows, stat):
    x = np.array([r["x"] for r in rows])
    volume = np.log1p([r["minutes"] for r in rows])
    rate = np.log([(r["value"] + 1) / (r["minutes"] + 1) for r in rows])
    bv, br = ridge(x, volume), ridge(x, rate)
    residuals = np.round(np.column_stack((volume - x @ bv, rate - x @ br)), 4)
    pools = {p: residuals[[r["position"] == p for r in rows]].tolist() for p in sorted({r["position"] for r in rows})}
    return {"stat": stat, "volume_coefficients": bv.tolist(), "rate_coefficients": br.tolist(),
            "residual_pairs": pools, "train_rows": len(rows)}

def distribution(model, row):
    x = np.array(row["x"])
    errors = np.array(model["residual_pairs"].get(row["position"], []))
    if len(errors) < 100:
        raise ValueError("Insufficient position residual history")
    # Paired residuals keep the minutes/rate correlation (blowouts, foul trouble).
    minutes = np.clip(np.expm1(x @ np.array(model["volume_coefficients"]) + errors[:, 0]), 0, 60)
    rate = np.exp(x @ np.array(model["rate_coefficients"]) + errors[:, 1])
    return np.maximum(0, np.rint(rate * (minutes + 1) - 1))

def probabilities(model, rows, thresholds):
    p, y, b = [], [], []
    for row in rows:
        values = distribution(model, row)
        for t in thresholds:
            p.append(float(np.mean(values > t)))
            y.append(float(row["value"] > t))
            b.append(float(np.mean(np.array(row["baseline"]) > t)))
    return np.array(p), np.array(y), np.array(b)

def calibrate(p, y):
    z = logit(np.clip(p, .001, .999))
    def loss(ab):
        q = np.clip(expit(ab[0] + ab[1] * z), 1e-8, 1 - 1e-8)
        return float(-np.mean(y * np.log(q) + (1 - y) * np.log(1 - q)) + .001 * (ab[1] - 1) ** 2)
    result = minimize(loss, [0., 1.], bounds=[(-5, 5), (.1, 5)])
    if not result.success:
        raise ValueError("Calibration optimization failed")
    return result.x.tolist()

def calibrated(p, ab):
    return expit(ab[0] + ab[1] * logit(np.clip(p, .001, .999)))

def metrics(p, y):
    p = np.clip(p, 1e-8, 1 - 1e-8)
    bins = []
    for low in range(10):
        mask = np.minimum((p * 10).astype(int), 9) == low
        if mask.any():
            bins.append({"lower": low / 10, "n": int(mask.sum()), "predicted": float(p[mask].mean()), "observed": float(y[mask].mean())})
    return {"threshold_predictions": len(y), "brier": float(np.mean((p - y) ** 2)),
            "log_loss": float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p))),
            "ece": sum(b["n"] * abs(b["predicted"] - b["observed"]) for b in bins) / len(y), "calibration_bins": bins}

def game_bootstrap(rows, delta, thresholds, seed=1701):
    """95% interval of the mean Brier difference, resampling whole NBA games."""
    per_row = delta.reshape(-1, len(thresholds)).mean(axis=1)
    games = defaultdict(list)
    for row, d in zip(rows, per_row):
        games[row["game_id"]].append(d)
    sums = np.array([sum(v) for v in games.values()])
    counts = np.array([len(v) for v in games.values()])
    rng = np.random.default_rng(seed)
    means = [float(sums[i].sum() / counts[i].sum()) for i in (rng.integers(0, len(sums), len(sums)) for _ in range(1000))]
    return np.quantile(means, [.025, .975]).tolist(), len(sums)

def train(frame, train_end, calibration_season, test_season):
    if not train_end < calibration_season < test_season:
        raise ValueError("Train/calibration/test must be chronological and disjoint")
    artifact = {"version": VERSION, "models": {}, "features": FEATURES, "min_history": MIN_HISTORY, "min_minutes": MIN_MINUTES}
    report = {"version": VERSION, "markets": {}}
    for market, (stat, thresholds) in MARKETS.items():
        rows = prepare(frame, market)
        sets = [[r for r in rows if r["season"] <= train_end], [r for r in rows if r["season"] == calibration_season],
                [r for r in rows if r["season"] == test_season]]
        if min(map(len, sets)) < 1000:
            raise ValueError(f"{market}: at least 1000 pregame examples needed per split")
        model = fit(sets[0], stat)
        cp, cy, _ = probabilities(model, sets[1], thresholds)
        model["calibration"] = calibrate(cp, cy)
        p, y, b = probabilities(model, sets[2], thresholds)
        q = calibrated(p, model["calibration"])
        score, baseline = metrics(q, y), metrics(b, y)
        score["baseline_brier_difference_95pct"], games = game_bootstrap(sets[2], (q - y) ** 2 - (b - y) ** 2, thresholds)
        score["bootstrap_cluster"], score["test_nba_games"] = "NBA game", games
        report["markets"][market] = {"train_player_games": len(sets[0]), "calibration_player_games": len(sets[1]),
            "test_player_games": len(sets[2]), "thresholds": thresholds, "model": score, "empirical_player_baseline": baseline,
            "by_position": {pos: metrics(q[m], y[m]) for pos in sorted({r["position"] for r in sets[2]})
                            for m in [np.repeat([r["position"] == pos for r in sets[2]], len(thresholds))]},
            "by_threshold": {str(t): metrics(q[i::len(thresholds)], y[i::len(thresholds)]) for i, t in enumerate(thresholds)}}
        artifact["models"][market] = model
    artifact["splits"] = report["splits"] = {"train_through": train_end, "calibration": calibration_season, "test": test_season}
    report["release_status"] = "SHADOW_ONLY"
    report["blockers"] = ["No archived timestamped player-prop odds for held-out price/EV testing",
        "No prospective current-season validation", "Injury, rotation and minutes-restriction news is not modeled",
        "No tested prediction of spread, total, moneyline, assists, threes or parlay probabilities"]
    report["note"] = ("Threshold tests are diagnostic stat forecasts, not historical sportsbook wagers. No ROI or edge is "
        "established. Bootstrap clusters by NBA game; repeated-player dependence across games remains a limitation.")
    artifact["validation"] = report
    return artifact, report

def forecast_inputs(frame, market, quote, normalized=False):
    """Live features from games before the target date only; no synthetic outcomes. With
    normalized=True the frame is already normalize()d (the hosted scan does that once per run)."""
    stat = MARKETS[market][0]
    d = frame if normalized else normalize(frame)
    target = pd.Timestamp(quote["game_date"])
    past = d[d.date < target]
    history = past[(past.athlete_id.astype(str) == str(quote["athlete_id"])) & (past.team == quote["team"])].to_dict("records")
    if not eligible(history):
        raise ValueError("Player is outside the validated cohort (5+ same-team games, 20+ recent minutes)")
    position = history[-1]["position"]
    allowed = past[past.position == position].groupby(["date", "opponent"])[[stat, "minutes"]].sum().reset_index()
    league = list(allowed[[stat, "minutes"]].itertuples(index=False, name=None))
    opponent = list(allowed[allowed.opponent == quote["opponent"]][[stat, "minutes"]].itertuples(index=False, name=None))
    team_dates = past[past.team == quote["team"]].date
    rest = (target - team_dates.max()).days if len(team_dates) else 7
    x = feature(history, opponent, league, position, stat, quote["home"], rest)
    return {"athlete_id": str(quote["athlete_id"]), "position": position, "x": x.tolist(),
            "history_through": str(history[-1]["date"].date()), "history_games": len(history)}

def evaluate(artifact, market, row, line, odds=None, opposite_odds=None):
    """Calibrated Over probability at a half-point line, priced against a quote when one is given."""
    if line * 2 != round(line * 2) or line == int(line):
        raise ValueError("Half-point line required")
    model = artifact["models"][market]
    values = distribution(model, row)
    over = float(calibrated(float(np.mean(values > line)), model["calibration"]))
    out = {"model_id": artifact["model_id"], "over_probability": over, "median": float(np.median(values)),
           "interval_10_90": np.quantile(values, [.1, .9]).tolist(), "forecast_inputs": dict(zip(FEATURES, row["x"]))}
    if odds is not None:
        out["break_even"] = implied(odds)
        out["edge_pp"] = (over - out["break_even"]) * 100
        if opposite_odds is not None:
            a, b = implied(odds), implied(opposite_odds)
            out["no_vig"] = a / (a + b)
            out["difference_vs_no_vig_pp"] = (over - out["no_vig"]) * 100
    return out

def model_id(artifact):
    return hashlib.sha256(json.dumps({k: v for k, v in artifact.items() if k != "model_id"}, sort_keys=True).encode()).hexdigest()

def main():
    parser = argparse.ArgumentParser(description="Train the NBA research model on hoopR/ESPN player box scores")
    parser.add_argument("--data", nargs="+", required=True, help="player_box_<season>.csv files")
    parser.add_argument("--output", required=True)
    parser.add_argument("--train-end", type=int, default=2024)
    parser.add_argument("--calibration", type=int, default=2025)
    parser.add_argument("--test", type=int, default=2026)
    args = parser.parse_args()
    paths = [Path(p) for p in args.data]
    frame = pd.concat([pd.read_csv(p, low_memory=False) for p in paths], ignore_index=True)
    artifact, report = train(frame, args.train_end, args.calibration, args.test)
    artifact["sources"] = report["sources"] = [{"file": p.name, "source_url": SOURCE + p.name,
        "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in paths]
    artifact["model_id"] = model_id(artifact)
    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    (out / "model.json").write_text(json.dumps(artifact, separators=(",", ":"), allow_nan=False) + "\n")
    (out / "validation.json").write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")
    print(json.dumps({"model_id": artifact["model_id"], "markets": {m: {"test_player_games": s["test_player_games"],
        "brier": s["model"]["brier"], "baseline_brier": s["empirical_player_baseline"]["brier"],
        "difference_95pct": s["model"]["baseline_brier_difference_95pct"], "ece": s["model"]["ece"]}
        for m, s in report["markets"].items()}}, indent=2))

if __name__ == "__main__":
    main()

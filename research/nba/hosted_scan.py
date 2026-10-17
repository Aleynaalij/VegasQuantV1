"""Hosted NBA shadow scan: runs the frozen v0.1 model on live FanDuel player props and journals it.

Research only. Reads upcoming regular-season NBA games and the latest FanDuel points/rebounds prop
snapshots collected by nba-sync, builds pregame features from hoopR/ESPN player box scores plus the
box scores recorded this season (public.nba_player_results), and stores one forecast per player and
line through the service-only `record_nba_shadow_scan` RPC, which checks every price against the stored
snapshot. It never publishes, tails or changes a bankroll. The repository is public, so it prints
counts only: no players, prices or probabilities.

  python hosted_scan.py --check   # stdlib only: print fresh=true|false
  python hosted_scan.py           # full scan and upload (needs requirements.txt)

Environment: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
"""
from __future__ import annotations
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

HERE = Path(__file__).resolve().parent
MODEL = HERE / "artifacts" / "v0.1" / "model.json"
HOOPR = "https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_nba_player_boxscores/player_box_{}.csv"
MARKETS = ["player_points", "player_rebounds"]
BOOK = "FanDuel"
HORIZON = timedelta(hours=36)
FRESH = timedelta(minutes=20)    # a new snapshot since the last scan; the RPC accepts up to 30 minutes
EASTERN = timezone(timedelta(hours=-4))  # NBA dates are Eastern; DST shifts never move a game across midnight


def iso(t: datetime) -> str:
    return t.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_time(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def name_key(name: str) -> str:
    """Same idea as public.nba_name_key: case, accents, punctuation and Jr/Sr/II-IV suffixes ignored."""
    s = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z ]", "", s)
    s = re.sub(r"\b(jr|sr|ii|iii|iv)\b", "", s)
    return re.sub(r"\s+", " ", s).strip()


def season_of(day) -> int:
    """hoopR labels a season by the year it ends (2025-26 is 2026)."""
    return day.year + 1 if day.month >= 9 else day.year


class Supabase:
    def __init__(self, url: str, key: str, opener=urllib.request.urlopen):
        self.url, self.key, self.open = url.rstrip("/"), key, opener

    def request(self, path: str, body=None):
        req = urllib.request.Request(
            self.url + path,
            data=None if body is None else json.dumps(body, allow_nan=False).encode(),
            headers={"apikey": self.key, "Authorization": f"Bearer {self.key}",
                     "Content-Type": "application/json", "Accept": "application/json"},
            method="GET" if body is None else "POST")
        with self.open(req, timeout=60) as r:
            return json.loads(r.read().decode() or "null")

    def select(self, table: str, **query: str):
        return self.request(f"/rest/v1/{table}?" + urllib.parse.urlencode(query, safe="(),.*:>-"))

    def all(self, table: str, **query: str):
        """Every row, 1000 at a time (the PostgREST page cap)."""
        rows, offset = [], 0
        while True:
            page = self.select(table, **query, limit="1000", offset=str(offset))
            rows += page
            if len(page) < 1000:
                return rows
            offset += 1000


def upcoming_games(db: Supabase, now: datetime):
    return db.select("nba_games", select="id,provider_id,away_team,home_team,tipoff,tipoff_tbd,season_type",
                     season_type="eq.2", tipoff_tbd="is.false",
                     **{"and": f"(tipoff.gt.{iso(now)},tipoff.lte.{iso(now + HORIZON)})"}, order="tipoff.asc", limit="100")


def latest_props(db: Supabase, games, since: datetime):
    """The newest FanDuel snapshot per game and market recorded since `since`."""
    if not games:
        return []
    rows = db.select("nba_observations", select="id,game_id,recorded_at,observed_at,payload",
                     kind="eq.prop", game_id=f"in.({','.join(g['id'] for g in games)})",
                     recorded_at=f"gte.{iso(since)}", order="recorded_at.desc", limit="2000",
                     **{"payload->>book": f"eq.{BOOK}", "payload->>market": f"in.({','.join(MARKETS)})"})
    latest = {}
    for r in rows:
        latest.setdefault((r["game_id"], r["payload"]["market"]), r)
    return list(latest.values())


def check(db: Supabase, now: datetime) -> bool:
    return bool(latest_props(db, upcoming_games(db, now), now - FRESH))


def quotes(observation):
    """(player, line) -> {"over": price, "under": price} for half-point main lines."""
    out = defaultdict(dict)
    for o in observation["payload"].get("outcomes") or []:
        point, price, name = o.get("point"), o.get("price"), o.get("name")
        if name in ("Over", "Under") and isinstance(point, (int, float)) and point * 2 % 2 == 1 \
                and isinstance(price, int) and abs(price) >= 100 and (o.get("description") or "").strip():
            out[(o["description"], float(point))][name.lower()] = price
    return out


def season_rows(db: Supabase, now: datetime, positions: dict):
    """This season's recorded regular-season box scores, in hoopR's columns."""
    import pandas as pd
    start = datetime(now.year if now.month >= 9 else now.year - 1, 9, 1, tzinfo=timezone.utc)
    games = {g["id"]: g for g in db.all("nba_games", select="id,provider_id,away_team,home_team,tipoff,season_type",
                                        season_type="eq.2", tipoff=f"gte.{iso(start)}")}
    recorded = []
    for i in range(0, len(games), 100):
        ids = list(games)[i:i + 100]
        recorded += db.all("nba_player_results", select="game_id,athlete_id,player,team,side,played,minutes,points,rebounds,starter,position",
                           game_id=f"in.({','.join(ids)})", order="game_id.asc,athlete_id.asc")
    rows = []
    for r in recorded:
        g = games[r["game_id"]]
        day = parse_time(g["tipoff"]).astimezone(EASTERN).date()
        position = r.get("position") or positions.get(str(r["athlete_id"]))
        if not position:
            continue
        rows.append({"game_id": int(g["provider_id"]), "season": season_of(day), "season_type": 2, "game_date": str(day),
            "athlete_id": int(r["athlete_id"]), "athlete_display_name": r["player"], "team_display_name": r["team"],
            "opponent_team_display_name": g["home_team"] if r["side"] == "away" else g["away_team"],
            "minutes": r["minutes"], "points": r["points"], "rebounds": r["rebounds"], "starter": bool(r.get("starter")),
            "did_not_play": not r["played"], "home_away": r["side"], "athlete_position_abbreviation": position})
    return pd.DataFrame(rows)


def download(now: datetime, directory: Path):
    """hoopR seasons for this season and the two before; a season file not yet published is skipped."""
    files = []
    for season in range(season_of(now) - 2, season_of(now) + 1):
        path = directory / f"player_box_{season}.csv"
        try:
            urllib.request.urlretrieve(HOOPR.format(season), path)
            files.append(path)
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise
    if len(files) < 2:
        raise RuntimeError("hoopR history unavailable")
    return files


def run(db: Supabase, now: datetime, workdir: Path):
    import pandas as pd
    sys.path.insert(0, str(HERE))
    import engine
    artifact = json.loads(MODEL.read_text())
    if engine.model_id(artifact) != artifact["model_id"]:
        raise RuntimeError("Model artifact integrity check failed")
    games = upcoming_games(db, now)
    props = latest_props(db, games, now - timedelta(minutes=25))
    summary = Counter(games=len(games), snapshots=len(props))
    if not props:
        return {"model_id": artifact["model_id"], "generated_at": iso(now), "summary": dict(summary), "forecasts": []}
    files = download(now, workdir)
    history = pd.concat([pd.read_csv(p, low_memory=False) for p in files], ignore_index=True)
    positions = (history.sort_values("game_date").groupby(history.athlete_id.astype(str)).athlete_position_abbreviation.last().to_dict())
    current = season_rows(db, now, positions)
    if len(current):
        history = pd.concat([history, current[~current.game_id.isin(history.game_id)]], ignore_index=True)
    frame = engine.normalize(history)
    by_game = {g["id"]: g for g in games}
    forecasts = []
    for date in sorted({parse_time(by_game[p["game_id"]]["tipoff"]).astimezone(EASTERN).date() for p in props}):
        past = frame[frame.date < pd.Timestamp(date)]
        latest_team = past.groupby(past.athlete_id.astype(str)).team.last()
        names = defaultdict(set)
        for athlete, name in past.groupby(past.athlete_id.astype(str)).athlete_display_name.last().items():
            names[name_key(name)].add(athlete)
        for p in props:
            game = by_game[p["game_id"]]
            if parse_time(game["tipoff"]).astimezone(EASTERN).date() != date:
                continue
            market = p["payload"]["market"]
            for (player, line), price in quotes(p).items():
                summary["candidates"] += 1
                if "over" not in price:
                    summary["no_over_price"] += 1
                    continue
                match = [a for a in names.get(name_key(player), ()) if latest_team.get(a) in (game["away_team"], game["home_team"])]
                if len(match) != 1:
                    summary["unmatched_player" if not match else "ambiguous_player"] += 1
                    continue
                team = latest_team[match[0]]
                quote = {"athlete_id": match[0], "team": team, "opponent": game["home_team"] if team == game["away_team"] else game["away_team"],
                         "home": team == game["home_team"], "game_date": str(date)}
                try:
                    row = engine.forecast_inputs(past, market, quote, normalized=True)
                except ValueError:
                    summary["outside_cohort"] += 1
                    continue
                out = engine.evaluate(artifact, market, row, line, price["over"], price.get("under"))
                forecasts.append({"observation_id": p["id"], "athlete_id": match[0], "player": player, "team": team,
                    "market": market, "line": line, "over_odds": price["over"], "under_odds": price.get("under"),
                    "over_probability": min(max(out["over_probability"], 1e-6), 1 - 1e-6),
                    "forecast": {**out, "history_through": row["history_through"], "history_games": row["history_games"],
                                 "position": row["position"], "status": "SHADOW_ONLY", "official_eligible": False}})
    summary["forecasts"] = len(forecasts)
    summary["sources"] = len(files)
    return {"model_id": artifact["model_id"], "generated_at": iso(now), "summary": {
        **dict(summary), "inputs": [{"file": p.name, "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in files],
        "current_season_rows": int(len(current))}, "forecasts": forecasts}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("fresh=false" if args.check else "Supabase credentials not configured; nothing to do")
        return
    db, now = Supabase(url, key), datetime.now(timezone.utc)
    if args.check:
        print(f"fresh={'true' if check(db, now) else 'false'}")
        return
    with tempfile.TemporaryDirectory() as tmp:
        scan = run(db, now, Path(tmp))
    result = db.request("/rest/v1/rpc/record_nba_shadow_scan", {"p": scan}) if scan["forecasts"] else {"inserted": 0}
    counts = {k: v for k, v in scan["summary"].items() if isinstance(v, int)}
    print(json.dumps({"forecasts": len(scan["forecasts"]), "inserted": result.get("inserted"), **counts}))


if __name__ == "__main__":
    main()

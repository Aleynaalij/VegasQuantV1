"""Hosted prospective shadow scan: runs scan.py on the live slate and uploads it to the journal.

Research only. It reads upcoming NFL games and FanDuel prop snapshots from Supabase, downloads the
nflverse weekly logs, runs the unchanged v0.3 scanner, and records the run through the service-only
`record_nfl_shadow_scan` RPC (see qualification.md). It never publishes, tails, grades or changes a
bankroll. The repository is public, so it prints counts only: no players, prices or probabilities.

  python hosted_scan.py --check   # stdlib only: exit 0 and print fresh=true|false
  python hosted_scan.py           # full scan and upload (needs requirements.txt)

Environment: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import urllib.parse
import urllib.request

HERE = Path(__file__).resolve().parent
MODEL = HERE / "artifacts" / "v0.3" / "model.json"
PROP_MARKETS = ["player_rush_yds", "player_rush_yds_alternate",
                "player_reception_yds", "player_reception_yds_alternate"]
NFLVERSE = "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_{}.csv"
# The prop feed researches games up to seven days ahead, the same window scan.py accepts; quotes
# older than 15 minutes cannot be journaled.
HORIZON = timedelta(days=7)
FRESH = timedelta(minutes=14)


def iso(t: datetime) -> str:
    return t.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


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


def upcoming_games(db: Supabase, now: datetime):
    """Future, scheduled NFL games inside the prop-collection horizon (seven days)."""
    # Filter in the query, before the limit, so other sports can never crowd NFL games out.
    rows = db.select("games", select="id,season,week,kickoff,kickoff_tbd,sport,away_abbreviation,home_abbreviation",
                     sport="ilike.nfl", kickoff_tbd="is.false",
                     **{"and": f"(kickoff.gt.{iso(now)},kickoff.lte.{iso(now + HORIZON)})"},
                     order="kickoff.asc", limit="100")
    return [g for g in rows if str(g.get("sport") or "").upper() == "NFL" and not g.get("kickoff_tbd")
            and datetime.fromisoformat(g["kickoff"].replace("Z", "+00:00")) <= now + HORIZON]


def prop_observations(db: Supabase, games, since: datetime):
    if not games:
        return []
    ids = ",".join(g["id"] for g in games)
    odds = db.select("source_observations", select="id,game_id,kind,source,observed_at,recorded_at,payload",
                     kind="eq.odds", game_id=f"in.({ids})", **{"payload->>market": f"in.({','.join(PROP_MARKETS)})"},
                     recorded_at=f"gte.{iso(since)}", order="recorded_at.desc", limit="5000")
    injuries = db.select("source_observations", select="id,game_id,kind,source,observed_at,recorded_at,payload",
                         kind="eq.injury", game_id=f"in.({ids})", order="recorded_at.desc", limit="2000")
    return odds + injuries


def has_fresh_props(observations, now: datetime) -> bool:
    """Only scan when a FanDuel prop snapshot arrived recently; older quotes cannot be journaled."""
    return any(o.get("kind") == "odds" and (o.get("payload") or {}).get("book") == "FanDuel"
               and datetime.fromisoformat(o["recorded_at"].replace("Z", "+00:00")) >= now - FRESH
               for o in observations)


def slate(games):
    """Exactly the database kickoff strings, which the journal compares to the games table."""
    return [{"id": g["id"], "kickoff": g["kickoff"]} for g in games]


def download(season: int, folder: Path) -> Path:
    path = folder / f"stats_player_week_{season}.csv"
    with urllib.request.urlopen(NFLVERSE.format(season), timeout=120) as r:
        path.write_bytes(r.read())
    return path


def sources(paths):
    return [{"file": p.name, "sha256": hashlib.sha256(p.read_bytes()).hexdigest(),
             "source_url": NFLVERSE.format(p.name.removeprefix("stats_player_week_").removesuffix(".csv"))}
            for p in paths]


def journal_payload(result: dict) -> dict:
    """The upload: only FanDuel-priced cards can become journal rows, so the other books' and
    unpriced candidates are summarized as blocker counts instead of sent card by card. A full slate
    is about 7,000 cards, which timed out the upload RPC; coverage counts stay complete."""
    cards = result.get("cards") or []
    blockers = {}
    for c in cards:
        for b in c.get("blockers") or []:
            blockers[b] = blockers.get(b, 0) + 1
    fanduel = lambda c: (c.get("quote") or {}).get("sportsbook") == "FanDuel" and c.get("research_probability") is not None
    kept = [c for c in cards if fanduel(c)]
    # FanDuel-specific coverage per candidate player-market: another book's price does not count,
    # because the journal and the protocol use FanDuel quotes only.
    candidate = lambda c: (c.get("game_id"), c.get("player"), c.get("market"))
    candidates = {candidate(c) for c in cards}
    priced = {candidate(c) for c in kept}
    fd_blockers = {}
    for c in kept:
        for b in c.get("blockers") or []:
            fd_blockers[b] = fd_blockers.get(b, 0) + 1
    missing = len(candidates - priced)
    if missing:
        fd_blockers["No FanDuel quote for the player-market"] = missing
    return dict(result, cards=kept, blocker_counts=dict(sorted(blockers.items())),
                fanduel_coverage={"candidates": len(candidates), "priced": len(priced), "unavailable": missing},
                fanduel_blocker_counts=dict(sorted(fd_blockers.items())),
                card_summary={"scanned": len(cards), "uploaded_fanduel_priced": len(kept)})


def run(db: Supabase, now_fn=lambda: datetime.now(timezone.utc), fetch=download) -> dict:
    now = now_fn()
    games = upcoming_games(db, now)
    observations = prop_observations(db, games, now - timedelta(hours=24))
    if not has_fresh_props(observations, now):
        return {"scanned": False, "games": len(games), "reason": "No fresh FanDuel prop snapshot"}
    import pandas as pd
    sys.path.insert(0, str(HERE))
    from engine import normalize
    from scan import scan
    artifact = json.loads(MODEL.read_text())
    seasons = sorted({int(g["season"]) for g in games} | {int(g["season"]) - 1 for g in games})
    with tempfile.TemporaryDirectory() as tmp:
        paths = [fetch(s, Path(tmp)) for s in seasons]
        frame = pd.concat([normalize(pd.read_csv(p, low_memory=False)) for p in paths], ignore_index=True)
        input_sources = sources(paths)
    # The scan time is taken after downloads so every quote is judged against the moment of capture.
    as_of = iso(now_fn())
    result = scan(frame, artifact, games, observations, as_of)
    result["input_sources"] = input_sources
    payload = journal_payload(result)
    recorded = db.request("/rest/v1/rpc/record_nfl_shadow_scan", {"p_scan": payload, "p_slate": slate(games)})
    return {"scanned": True, "games": len(games), "coverage": result["coverage"], "uploaded_cards": len(payload["cards"]),
            "recorded_forecasts": (recorded or {}).get("recorded_forecasts"),
            "skipped_unverifiable_or_stale": (recorded or {}).get("skipped_unverifiable_or_stale"),
            "replayed": bool((recorded or {}).get("replayed"))}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Only report whether a scan is due")
    args = parser.parse_args()
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not configured; nothing to do.", file=sys.stderr)
        if args.check:
            print("fresh=false")
        return
    db = Supabase(url, key)
    if args.check:
        now = datetime.now(timezone.utc)
        games = upcoming_games(db, now)
        fresh = has_fresh_props(prop_observations(db, games, now - FRESH), now)
        print(f"games={len(games)}")
        print(f"fresh={'true' if fresh else 'false'}")
        return
    print(json.dumps(run(db)))


if __name__ == "__main__":
    main()

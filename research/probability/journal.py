"""Append-only research journal and prospective scoring; never grades official picks."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import sqlite3

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)

def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()

def timestamp(value):
    t = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if t.tzinfo is None:
        raise ValueError("Timezone-aware timestamp required")
    return t

class Journal:
    def __init__(self, path):
        self.db = sqlite3.connect(path)
        self.db.executescript("""
          CREATE TABLE IF NOT EXISTS events (
            seq INTEGER PRIMARY KEY, event_id TEXT UNIQUE NOT NULL,
            kind TEXT NOT NULL, recorded_at TEXT NOT NULL,
            payload TEXT NOT NULL, previous_hash TEXT NOT NULL, event_hash TEXT NOT NULL);
          CREATE TRIGGER IF NOT EXISTS no_update BEFORE UPDATE ON events
            BEGIN SELECT RAISE(ABORT, 'Research journal is append-only'); END;
          CREATE TRIGGER IF NOT EXISTS no_delete BEFORE DELETE ON events
            BEGIN SELECT RAISE(ABORT, 'Research journal is append-only'); END;
        """)

    def close(self):
        self.db.close()

    def events(self):
        result, previous = [], "GENESIS"
        for seq, event_id, kind, at, payload, prev, h in self.db.execute("SELECT * FROM events ORDER BY seq"):
            value = json.loads(payload)
            expected = digest(dict(event_id=event_id, kind=kind, recorded_at=at, payload=value, previous_hash=prev))
            if prev != previous or h != expected:
                raise ValueError("Journal integrity check failed")
            result.append(dict(seq=seq, event_id=event_id, kind=kind, recorded_at=at, payload=value))
            previous = h
        return result

    def append(self, kind, event_id, payload, now=None):
        at = (now or datetime.now(timezone.utc)).isoformat()
        self.db.execute("BEGIN IMMEDIATE")
        try:
            self.events()  # Refuse to extend a damaged history.
            old = self.db.execute("SELECT kind, payload FROM events WHERE event_id=?", (event_id,)).fetchone()
            if old:
                if old != (kind, canonical(payload)):
                    raise ValueError("Conflicting observation; prior history cannot be overwritten")
                self.db.rollback()
                return False
            previous = self.db.execute("SELECT event_hash FROM events ORDER BY seq DESC LIMIT 1").fetchone()
            previous = previous[0] if previous else "GENESIS"
            h = digest(dict(event_id=event_id, kind=kind, recorded_at=at, payload=payload, previous_hash=previous))
            self.db.execute("INSERT INTO events(event_id,kind,recorded_at,payload,previous_hash,event_hash) VALUES(?,?,?,?,?,?)",
                (event_id, kind, at, canonical(payload), previous, h))
            self.db.commit()
            return True
        except Exception:
            self.db.rollback()
            raise

    def forecast(self, payload, now=None):
        payload = {k:v for k,v in payload.items() if k != "journal_forecast_id"}
        now = now or datetime.now(timezone.utc)
        q = payload["quote"]
        generated, observed, kickoff = map(timestamp, [payload["generated_as_of"],q["observed_at"],q["kickoff"]])
        if not observed <= generated <= now < kickoff or (now-generated).total_seconds() > 900:
            raise ValueError("Forecast must be recorded before kickoff, without backdating")
        for key in ["model_id", "forecast_inputs", "history_through", "blockers", "research_probability", "push_probability"]:
            if key not in payload:
                raise ValueError(f"Missing forecast audit field: {key}")
        if not q["source_url"].startswith("https://"):
            raise ValueError("Quote source required")
        win, push = payload["research_probability"], payload["push_probability"]
        if not all(math.isfinite(x) and 0 <= x <= 1 for x in [win,push]) or push == 1 or win+push>1+1e-10:
            raise ValueError("Invalid probability mass")
        event_id = digest(dict(model_id=payload["model_id"], quote=q))
        return event_id, self.append("forecast", event_id, payload, now)

    def outcome(self, payload, now=None):
        now = now or datetime.now(timezone.utc)
        forecasts = {e["event_id"]:e for e in self.events() if e["kind"]=="forecast"}
        forecast = forecasts.get(payload["forecast_id"])
        if not forecast:
            raise ValueError("Outcome needs a previously recorded forecast")
        kickoff = timestamp(forecast["payload"]["quote"]["kickoff"])
        observed = timestamp(payload["observed_at"])
        if not kickoff < observed <= now or payload.get("final") is not True:
            raise ValueError("Final observed outcome required after kickoff")
        if not payload.get("source_url", "").startswith("https://"):
            raise ValueError("Outcome source required")
        if payload.get("void") is not True and (not isinstance(payload.get("yards"), (int,float)) or not math.isfinite(payload["yards"])):
            raise ValueError("Finite observed yards or explicit void required")
        return self.append("outcome", "outcome:"+payload["forecast_id"], payload, now)

    def report(self):
        events = self.events()
        forecasts = {e["event_id"]:e for e in events if e["kind"]=="forecast"}
        outcomes = {e["payload"]["forecast_id"]:e["payload"] for e in events if e["kind"]=="outcome"}
        scores, seen = [], set()
        for fid, event in forecasts.items():
            f, o = event["payload"], outcomes.get(fid)
            q = f["quote"]
            # Keep the first prospectively recorded observation, not the best hindsight price.
            group = tuple(q[k] for k in ["player_id","season","week","market","direction","line"])+(f["model_id"],)
            if group in seen:
                continue
            seen.add(group)
            if o is None or o.get("void") is True:
                continue
            line, yards = q["line"], o["yards"]
            if q["direction"] != "at_least" and yards==line:
                scores.append(dict(push=True,profit=0.,model=None,market=None,no_vig=None))
                continue
            hit = int(yards>=line if q["direction"]=="at_least" else yards>line if q["direction"]=="over" else yards<line)
            p = f["research_probability"]/(1-f["push_probability"])
            profit = (q["odds"]/100 if q["odds"]>0 else 100/-q["odds"]) if hit else -1.
            market = f["break_even_probability"]
            nv = f.get("no_vig_market_probability")
            scores.append(dict(push=False,profit=profit,model=(p-hit)**2,market=(market-hit)**2,
                no_vig=None if nv is None else (nv-hit)**2))
        mean = lambda key: (sum(v[key] for v in scores if v[key] is not None)/sum(v[key] is not None for v in scores)) if any(v[key] is not None for v in scores) else None
        return dict(status="SHADOW_ONLY",forecast_observations=len(forecasts),unique_forecasts=len(seen),
            recorded_outcomes=len(outcomes),evaluated_observations=len(scores),pushes=sum(s["push"] for s in scores),
            model_brier=mean("model"),raw_price_brier=mean("market"),no_vig_brier=mean("no_vig"),
            no_vig_coverage=sum(s["no_vig"] is not None for s in scores),
            hypothetical_flat_unit_return=mean("profit"),official_picks_graded=0,
            limitation="Research simulation only; not executed wagers or a release decision. Different lines and directions remain correlated. First observation per exact selection/model is retained, including pending/void first observations.")

def main():
    p=argparse.ArgumentParser();p.add_argument("--journal",required=True)
    p.add_argument("--record-forecasts");p.add_argument("--record-outcomes");p.add_argument("--report",action="store_true")
    a=p.parse_args();j=Journal(a.journal)
    try:
        if a.record_forecasts:
            for f in json.loads(Path(a.record_forecasts).read_text()):
                fid, inserted=j.forecast(f);print(canonical(dict(forecast_id=fid,inserted=inserted)))
        if a.record_outcomes:
            for o in json.loads(Path(a.record_outcomes).read_text()):j.outcome(o)
        if a.report:print(json.dumps(j.report(),indent=2,allow_nan=False))
    finally:j.close()

if __name__=="__main__":main()

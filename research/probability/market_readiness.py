"""Audit passing/sacks historical inputs. Produces coverage diagnostics, NEVER probabilities/picks."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import pandas as pd

SPECS = {
    "passing_yards": {"position": {"QB"}, "extra": ["passing_attempts", "sacks_suffered"]},
    "def_sacks": {"position": {"DE", "DT", "NT", "DL", "EDGE", "LB", "OLB", "ILB", "MLB", "CB", "DB", "S", "FS", "SS"}, "extra": []},
}

def readiness(frame):
    frame=frame.copy()
    if "attempts" in frame.columns:
        if "passing_attempts" in frame.columns and not frame["passing_attempts"].equals(frame["attempts"]):
            raise ValueError("Conflicting passing-attempt schemas")
        frame["passing_attempts"]=frame["attempts"]
    required = {"player_id", "player_display_name", "season", "week", "season_type", "team", "position"}
    missing = sorted(required - set(frame.columns))
    if missing:
        raise ValueError("Missing identity columns: " + ", ".join(missing))
    regular = frame[frame.season_type == "REG"].copy()
    # Unidentified nonzero contributions must not vanish from the audit.
    for metric in SPECS:
        if metric in regular:
            nonzero = pd.to_numeric(regular[metric], errors="coerce").fillna(0) != 0
            if (nonzero & (regular.player_id.isna() | regular.team.isna())).any():
                raise ValueError("Unidentified nonzero " + metric)
    reports = {}
    for metric, spec in SPECS.items():
        absent = sorted(({metric} | set(spec["extra"])) - set(regular.columns))
        cohort = regular[regular.position.isin(spec["position"])].copy()
        if cohort.duplicated(["player_id", "season", "week"]).any():
            raise ValueError("Duplicate player/week rows in " + metric)
        values = pd.to_numeric(cohort[metric], errors="coerce") if metric in cohort else pd.Series(dtype=float)
        invalid = int((values.isna() | ((values < 0) if metric == "def_sacks" else False) | ((values * (2 if metric == "def_sacks" else 1)) % 1 != 0)).sum())
        reports[metric] = {
            "status": "INPUTS_MISSING" if absent or invalid else "HISTORY_PRESENT_MODEL_UNVALIDATED",
            "regular_season_rows": len(cohort),
            "distinct_players": int(cohort.player_id.nunique()),
            "missing_columns": absent,
            "invalid_or_missing_stat_rows": invalid,
            "fractional_stat_rows": int(((values % 1) != 0).sum()) if metric == "def_sacks" else 0,
            "model_approved": False,
            "blockers": (["Missing input columns: " + ", ".join(absent)] if absent else []) +
                (["Invalid/missing stat values; never fill as zero"] if invalid else []) +
                (["No verified pass-rush snaps/opportunities or pressure-rate series in this weekly input", "Exact numeric sack market settlement review required; Yes/No may differ"] if metric == "def_sacks" else ["Protection, availability, projected attempts and current-season role review required"]) +
                ["Separate immutable model, calibration and prospective priced validation required"],
        }
    return {"status": "RESEARCH_ONLY", "markets": reports, "probabilities_generated": 0, "picks_published": 0,
            "note": "Schema/history coverage is not model validation or a verified active roster. No numerical edge is claimed."}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", nargs="+", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    paths = [Path(p) for p in args.data]
    report = readiness(pd.concat([pd.read_csv(p, low_memory=False) for p in paths], ignore_index=True))
    report["observed_at"] = datetime.now(timezone.utc).isoformat()
    report["sources"] = [{"file": p.name, "sha256": hashlib.sha256(p.read_bytes()).hexdigest(),
        "source_url": "https://github.com/nflverse/nflverse-data/releases/download/stats_player/" + p.name} for p in paths]
    Path(args.output).write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")
    print(json.dumps({metric: {"rows": r["regular_season_rows"], "status": r["status"]} for metric, r in report["markets"].items()}))
if __name__ == "__main__":
    main()

"""Import public weekly NFL NGS summaries; no picks, forecasts or live tracking.

stdlib only. --output writes validated payloads locally; --publish uses the
existing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY server credentials.
"""
from __future__ import annotations
import argparse
import csv
from datetime import datetime, timezone
import gzip
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import urllib.request

RELEASE = "https://api.github.com/repos/nflverse/nflverse-data/releases/tags/nextgen_stats"
BASE = "https://github.com/nflverse/nflverse-data/releases/download/nextgen_stats/"
KINDS = {
    "passing": ("avg_time_to_throw", "completion_percentage_above_expectation", "avg_intended_air_yards"),
    "rushing": ("rush_yards_over_expected_per_att", "percent_attempts_gte_eight_defenders", "rush_attempts"),
    "receiving": ("avg_separation", "avg_yac_above_expectation", "targets"),
}
IDENTITY = ("season", "season_type", "week", "player_gsis_id", "player_display_name", "team_abbr")
TEAM_ALIASES = {"LA": "LAR", "STL": "LAR", "SD": "LAC", "OAK": "LV"}


def read(url: str, maximum=8_000_000):
    request = urllib.request.Request(url, headers={"User-Agent": "VegasQuant-NGS/1.0 (vegasquant.app)", "Accept": "application/json" if url == RELEASE else "application/octet-stream"})
    with urllib.request.urlopen(request, timeout=45) as response:
        raw = response.read(maximum + 1)
    if len(raw) > maximum:
        raise ValueError("NGS source exceeds size limit")
    return raw


def choose_asset(release: dict, kind: str):
    if kind not in KINDS:
        raise ValueError("Unsupported NGS category")
    # Discover actual release assets: legacy .csv URLs can return 404.
    for name in (f"ngs_{kind}.csv.gz", f"ngs_{kind}.csv"):
        for asset in release.get("assets", []):
            if asset.get("name") == name and asset.get("browser_download_url") == BASE + name:
                return asset
    raise ValueError(f"No supported {kind} asset in official nflverse release")


def normalize(raw: bytes, asset: dict, kind: str, seasons: list[int], retrieved_at: str):
    if asset.get("browser_download_url") not in (BASE + f"ngs_{kind}.csv.gz", BASE + f"ngs_{kind}.csv"):
        raise ValueError("Unexpected source URL")
    source = gzip.GzipFile(fileobj=io.BytesIO(raw)).read(20_000_001) if asset["name"].endswith(".gz") else raw
    if len(source) > 20_000_000:
        raise ValueError("Expanded NGS source exceeds size limit")
    reader = csv.DictReader(io.StringIO(source.decode("utf-8-sig")))
    if not set(IDENTITY + KINDS[kind]).issubset(reader.fieldnames or []):
        raise ValueError("NGS schema changed; required columns missing")
    rows, seen = [], set()
    for row in reader:
        if int(row["season"]) not in seasons:
            continue
        if not re.fullmatch(r"\d{2}-\d{7}", row["player_gsis_id"]) or not row["player_display_name"]:
            raise ValueError("Invalid NGS player identity")
        if row["season_type"] not in ("REG", "POST") or not 0 <= int(row["week"]) <= 23:
            raise ValueError("Invalid NGS season/week")
        for field in KINDS[kind]:
            value = row[field]
            if value not in ("", "NA") and not math.isfinite(float(value)):
                raise ValueError("Non-finite NGS metric")
        identity = tuple(row[k] for k in ("season", "season_type", "week", "player_gsis_id", "team_abbr"))
        if identity in seen:
            raise ValueError("Duplicate NGS player-week identity")
        seen.add(identity)
        row["source_team_abbr"] = row["team_abbr"]
        row["team_abbr"] = TEAM_ALIASES.get(row["team_abbr"], row["team_abbr"])
        rows.append({key: None if value in ("", "NA") else value for key, value in row.items()})
    if not rows:
        raise ValueError("No NGS rows for requested seasons")
    updated = asset.get("updated_at")
    if not updated or datetime.fromisoformat(updated.replace("Z", "+00:00")) > datetime.fromisoformat(retrieved_at):
        raise ValueError("Invalid source update/retrieval timeline")
    return {"stat_type": kind, "seasons": sorted(set(seasons)), "source_url": asset["browser_download_url"],
            "source_sha256": hashlib.sha256(raw).hexdigest(), "source_updated_at": updated,
            "retrieved_at": retrieved_at, "row_count": len(rows), "rows": rows}


def publish(payload: dict):
    url, key = os.environ["SUPABASE_URL"].rstrip("/"), os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    request = urllib.request.Request(url + "/rest/v1/rpc/ingest_nfl_ngs", data=json.dumps({"p": payload}, allow_nan=False).encode(),
                                    headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    now = datetime.now(timezone.utc)
    season = now.year if now.month >= 3 else now.year - 1
    release = json.loads(read(RELEASE))
    if args.output:
        args.output.mkdir(parents=True, exist_ok=True)
    failures = []
    for kind in KINDS:
        try:
            asset = choose_asset(release, kind)
            raw = read(asset["browser_download_url"])
            payload = normalize(raw, asset, kind, [season - 1, season], datetime.now(timezone.utc).isoformat())
            if args.output:
                (args.output / f"{kind}.json").write_text(json.dumps(payload, allow_nan=False))
            result = publish(payload) if args.publish else {"validated_rows": payload["row_count"]}
            print(json.dumps({"category": kind, **result}))  # Public CI prints counts only.
        except Exception as error:
            failures.append(kind)
            print(json.dumps({"category": kind, "status": "failed", "reason": type(error).__name__}))
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

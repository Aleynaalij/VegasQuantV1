"""Download explicit nflverse historical snapshots; fail rather than substitute seasons."""
import argparse
import urllib.request
from pathlib import Path
p=argparse.ArgumentParser()
p.add_argument("--output",required=True)
p.add_argument("--years",type=int,nargs="+",default=[2022,2023,2024])
a=p.parse_args();out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
for year in a.years:
    filename=f"stats_player_week_{year}.csv" if year>=2025 else f"player_stats_{year}.csv"
    release="stats_player" if year>=2025 else "player_stats"
    url=f"https://github.com/nflverse/nflverse-data/releases/download/{release}/{filename}"
    target=out/filename
    urllib.request.urlretrieve(url,target)
    print(f"{year}: {target.stat().st_size} bytes from {url}")

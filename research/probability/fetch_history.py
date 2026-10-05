"""Download explicit nflverse historical snapshots; fail rather than substitute seasons."""
import argparse
import urllib.request
from pathlib import Path
p=argparse.ArgumentParser()
p.add_argument("--output",required=True)
p.add_argument("--years",type=int,nargs="+",default=[2022,2023,2024])
a=p.parse_args();out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
for year in a.years:
    url=f"https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_{year}.csv"
    target=out/f"player_stats_{year}.csv"
    urllib.request.urlretrieve(url,target)
    print(f"{year}: {target.stat().st_size} bytes from {url}")

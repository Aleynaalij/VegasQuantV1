"""Download/audit actual nflverse PBP; never fit, forecast, or publish."""
import argparse
from collections import Counter
import csv
from datetime import datetime, timezone
import gzip
import hashlib
import io
import json
from pathlib import Path
import urllib.request

REQUIRED=('game_id','play_id','season','season_type','qtr','posteam','defteam','down','ydstogo','yardline_100','quarter_seconds_remaining','game_seconds_remaining','play_type','yards_gained','home_team','away_team','total_home_score','total_away_score')

def audit(data, url, retrieved_at, source_updated_at=None):
    raw=gzip.decompress(data) if data[:2]==b'\x1f\x8b' else data
    reader=csv.DictReader(io.StringIO(raw.decode('utf-8-sig')))
    fields=reader.fieldnames or []
    missing=sorted(set(REQUIRED)-set(fields))
    if missing: raise ValueError('Missing required fields: '+','.join(missing))
    counts=Counter();types=Counter();games=set();seasons=set();seen=set();duplicates=0;rows=0
    for row in reader:
        rows+=1;games.add(row['game_id']);seasons.add(row['season']);types[row['play_type'] or 'MISSING']+=1
        key=(row['game_id'],row['play_id'])
        duplicates+=key in seen;seen.add(key)
        for field in REQUIRED:
            if row[field] not in ('','NA','NaN','nan'):counts[field]+=1
    return dict(source_url=url,sha256=hashlib.sha256(data).hexdigest(),bytes=len(data),retrieved_at=retrieved_at,source_updated_at=source_updated_at,seasons=sorted(seasons),rows=rows,games=len(games),duplicate_game_play_keys=duplicates,fields=fields,required_field_nonmissing=dict(counts),play_types=dict(types),purpose='Schema/coverage audit only. No fitted parameters or evaluation outcomes.',attribution='nflverse / nflfastR play-by-play; source-provider rights remain applicable.')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--seasons',nargs='+',type=int,required=True);parser.add_argument('--cache',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
    # Explicit audit limits: no silently downloaded holdout/current-season outcomes.
    if any(y not in (2022,2023) for y in args.seasons):raise ValueError('Initial audit restricted to training2022/calibration2023')
    args.cache.mkdir(parents=True,exist_ok=True)
    request=urllib.request.Request('https://api.github.com/repos/nflverse/nflverse-data/releases/tags/pbp',headers={'User-Agent':'VegasQuant-data-audit'})
    release=json.load(urllib.request.urlopen(request,timeout=30));reports=[]
    for season in args.seasons:
        names=(f'play_by_play_{season}.csv.gz',f'play_by_play_{season}.csv')
        asset=next((a for name in names for a in release['assets'] if a['name']==name),None)
        if asset is None:raise ValueError(f'No actual CSV asset for {season}')
        url=asset['browser_download_url'];response=urllib.request.urlopen(url,timeout=60);data=response.read()
        if len(data)!=asset['size']:raise ValueError('Download size mismatch')
        retrieved=datetime.now(timezone.utc).isoformat();(args.cache/asset['name']).write_bytes(data)
        report=audit(data,url,retrieved,asset.get('updated_at'));reports.append(report)
        print(json.dumps({k:report[k] for k in ('seasons','rows','games','sha256','duplicate_game_play_keys')}),flush=True)
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps({'audits':reports},indent=2)+'\n')
if __name__=='__main__':main()

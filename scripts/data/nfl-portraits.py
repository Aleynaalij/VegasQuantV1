"""Build exact-name portrait IDs. Does not infer roster or availability."""
import csv
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import urllib.request
SOURCE='https://github.com/nflverse/nflverse-data/releases/download/players/players.csv'
def normalize(rows):
    names={}
    for r in rows:
        if r['position'] not in {'QB','RB','FB','WR','TE','K'} or not r['espn_id'].isdigit(): continue
        try:
            if int(r['last_season']) < 2025: continue
        except ValueError: continue
        key=r['display_name'].strip().lower()
        names.setdefault(key,set()).add(r['espn_id'])
    return {name:next(iter(ids)) for name,ids in sorted(names.items()) if len(ids)==1}
if __name__=='__main__':
    data=urllib.request.urlopen(SOURCE,timeout=30).read()
    output={'source':SOURCE,'sha256':hashlib.sha256(data).hexdigest(),'retrieved_at':datetime.now(timezone.utc).isoformat(),'attribution':'Player identity mapping: nflverse. Portrait images: ESPN. Identity only; not current roster or availability.','portraits':normalize(csv.DictReader(io.StringIO(data.decode())))}
    Path('src/lib/nfl-portraits.json').write_text(json.dumps(output,indent=2)+'\n')
    print('Verified unambiguous portrait IDs:',len(output['portraits']))

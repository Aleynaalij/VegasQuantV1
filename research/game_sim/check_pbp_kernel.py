"""Compare supported ordinary snap transitions to actual consecutive PBP rows.

This is a rules consistency check, NOT predictive model evaluation. Complex rows
and discontinuities are excluded with counts; never count exclusions as successes.
"""
import argparse
from collections import Counter
import csv
import gzip
import hashlib
import io
import json
from pathlib import Path
from state import State,Action,transition

def check(data):
    reader=csv.DictReader(io.StringIO((gzip.decompress(data) if data[:2]==b'\x1f\x8b' else data).decode('utf-8-sig')))
    counts=Counter();mismatches=[];previous=None
    for row in reader:
        r=previous;previous=row
        if r is None:continue
        counts['pairs']+=1
        if r['game_id']!=row['game_id'] or r['qtr']!=row['qtr'] or r['posteam']!=row['posteam'] or not r['posteam']:
            counts['excluded_discontinuity']+=1;continue
        if r['play_type'] not in ('run','pass','qb_kneel','qb_spike') or any(r.get(k)=='1' for k in ('penalty','touchdown','safety','interception','fumble_lost','fumble','lateral_reception','lateral_rush','two_point_attempt')):
            counts['excluded_complex_or_nonsnap']+=1;continue
        try:
            ints=lambda key,source=r:int(float(source[key]))
            if ints('qtr')>4:raise ValueError('OT')
            elapsed=ints('quarter_seconds_remaining')-ints('quarter_seconds_remaining',row)
            if not 0<elapsed<=60:raise ValueError('clock gap')
            yard=ints('yards_gained');kind={'run':'run','qb_kneel':'kneel','qb_spike':'spike'}.get(r['play_type'])
            if kind is None:kind='sack' if r.get('sack')=='1' else 'pass_complete' if r.get('complete_pass')=='1' else 'pass_incomplete'
            home=r['posteam']==r['home_team'];s=State(period=ints('qtr'),clock=ints('quarter_seconds_remaining'),possession='home' if home else 'away',yardline=ints('yardline_100'),down=ints('down'),distance=ints('ydstogo'),home_score=ints('total_home_score'),away_score=ints('total_away_score'))
            expected=(ints('down',row),ints('ydstogo',row),ints('yardline_100',row))
            n=transition(s,Action(kind,elapsed,yard)).after
        except (ValueError,TypeError,KeyError):counts['excluded_missing_or_unsupported']+=1;continue
        if n.possession!=s.possession:counts['excluded_possession_transition']+=1;continue
        counts['checked']+=1
        actual=(n.down,n.distance,n.yardline)
        if actual==expected:counts['matched']+=1
        else:
            counts['mismatched']+=1
            if len(mismatches)<8:mismatches.append(dict(game_id=r['game_id'],play_id=r['play_id'],kind=kind,kernel=actual,source_next=expected))
    return dict(source_sha256=hashlib.sha256(data).hexdigest(),counts=dict(counts),examples=mismatches,scope='Supported consecutive ordinary snap transitions only, not a probability validation or complete rules audit.')
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--data',nargs='+',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    results=[dict(file=f.name,**check(f.read_bytes())) for f in a.data]
    a.output.write_text(json.dumps(results,indent=2)+'\n');print(json.dumps([{k:r[k] for k in ('file','counts')} for r in results]))

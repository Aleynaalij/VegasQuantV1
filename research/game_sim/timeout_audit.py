"""Reproduce a fixed prefix of the stored batch for timeout shape diagnostics."""
from collections import Counter, defaultdict
import argparse,csv,gzip,hashlib,json
from pathlib import Path
from .batch import game
from .model import Sampler,source_state,enforced_penalty
from .evaluate import scores

def band(seconds):
    return 'last10' if seconds<=10 else 'last30' if seconds<=30 else 'last120' if seconds<=120 else '121-300' if seconds<=300 else '301-600' if seconds<=600 else '601-900'

def summarize(counts,n):
    return {k:dict(c,timeouts_per_game=c['timeouts']/n,timeouts_per_100_snaps=100*c['timeouts']/c['snaps'] if c['snaps'] else None,
                   offense_zero_share=c['offense_zero']/c['snaps'] if c['snaps'] else None,defense_zero_share=c['defense_zero']/c['snaps'] if c['snaps'] else None) for k,c in sorted(counts.items())}

def audit(folder,source_path,runs=1000):
    folder=Path(folder)
    raw=(folder/'model.json.gz').read_bytes();model=json.loads(gzip.decompress(raw))
    batch=json.loads(gzip.decompress((folder/'batch.json.gz').read_bytes()))
    if not 1<=runs<=batch['runs']['requested']:raise ValueError('trace prefix outside stored batch')
    source_raw=Path(source_path).read_bytes();valid,digest=scores(source_path)
    source=defaultdict(Counter);sim=defaultdict(Counter);missing=Counter()
    for r in csv.DictReader(gzip.decompress(source_raw).decode('utf-8-sig').splitlines()):
        if r['game_id'] not in valid:continue
        try:q=int(r['qtr']);clock=int(float(r['quarter_seconds_remaining']))
        except ValueError:missing['clock']+=1;continue
        key=f'Q{q}:{band(clock)}'
        if r.get('timeout')=='1':source[key]['timeouts']+=1
        if r['play_type'] not in ('run','pass','qb_kneel','qb_spike','field_goal','punt') or enforced_penalty(r):continue
        try:s=source_state(r)
        except (ValueError,KeyError,TypeError):missing['snap_context']+=1;continue
        c=source[key];c['snaps']+=1
        c['offense_zero']+=getattr(s,s.possession+'_timeouts')==0
        c['defense_zero']+=getattr(s,('away' if s.possession=='home' else 'home')+'_timeouts')==0
    prepared=Sampler(model,batch['seed']).tables
    kinds={'run','pass_complete','pass_incomplete','sack','kneel','spike','fumble_recovered','interception','fumble_lost','defensive_touchdown','punt','punt_blocked','field_goal','blocked_field_goal'}
    failures=Counter();complete=0
    for i in range(runs):
        try:row=game(model,batch['seed']+i,both_possessions=False,trace=True,prepared_tables=prepared)
        except ValueError as e:
            failures[str(e)]+=1;continue
        complete+=1
        for event in row['events']:
            s=event['before'];a=event['action'];key=f"Q{s['period']}:{band(s['clock'])}";c=sim[key]
            if a['kind']=='timeout':c['timeouts']+=1
            if s['phase']=='scrimmage' and a['kind'] in kinds:
                c['snaps']+=1;c['offense_zero']+=s[s['possession']+'_timeouts']==0
                c['defense_zero']+=s[('away' if s['possession']=='home' else 'home')+'_timeouts']==0
    return dict(model_id=model['model_id'],source_sha256=digest,model_compressed_sha256=hashlib.sha256(raw).hexdigest(),source_games=len(valid),trace_prefix_runs=runs,completed_prefix_runs=complete,failed_prefix_runs=runs-complete,failures=dict(failures),seed=batch['seed'],
        accepted_fit_timeouts_per_game=model['coverage'].get('kind:timeout',0)/len(valid),fit_exclusions={k:v for k,v in model['coverage'].items() if k.startswith('excluded:')},
        missing=dict(missing),source=summarize(source,len(valid)),simulation=summarize(sim,complete) if complete else {},diagnostic_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        scope='Same seeded prefix replays, not a new ensemble; diagnostic only. Simulation rates condition on successful replays; ANY failures mean biased incomplete coverage, not qualification. Source raw timeouts include excluded events/OT. Snap denominator excludes enforced-penalty rows/actions; unsupported source contexts are counted missing. Q5 is shown separately.')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--folder',required=True);p.add_argument('--source',required=True);p.add_argument('--runs',type=int,default=1000);a=p.parse_args()
    print(json.dumps(audit(a.folder,a.source,a.runs),indent=2))

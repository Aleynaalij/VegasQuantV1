"""Fixed-prefix late-clock exposure and mix diagnostic; never a new fit."""
import argparse,csv,gzip,hashlib,json
from collections import Counter,defaultdict
from pathlib import Path
from .model import Sampler,source_state,enforced_penalty
from .batch import game
from .evaluate import scores

def audit(folder,source,runs=1000):
    root=Path(folder);model=json.loads(gzip.decompress((root/'model.json.gz').read_bytes()));batch=json.loads(gzip.decompress((root/'batch.json.gz').read_bytes()));raw=Path(source).read_bytes();rows=list(csv.DictReader(gzip.decompress(raw).decode('utf-8-sig').splitlines()));valid,_=scores(source)
    counters={side:defaultdict(Counter) for side in ('source','simulation')};excluded=Counter()
    def add(side,s,kind,elapsed,stopped):
        if s.phase!='scrimmage' or s.period not in (2,4) or s.clock>300 or kind not in ('run','pass_complete'):return
        lead='ahead' if getattr(s,s.possession+'_score')>getattr(s,('away' if s.possession=='home' else 'home')+'_score') else 'behind' if getattr(s,s.possession+'_score')<getattr(s,('away' if s.possession=='home' else 'home')+'_score') else 'tied'
        band='last10' if s.clock<=10 else 'last30' if s.clock<=30 else 'last120' if s.clock<=120 else 'last300'
        key=f'Q{s.period}|{band}|{lead}|{kind}';c=counters[side][key];c['n']+=1;c['elapsed']+=elapsed
        if stopped:c['stopped_n']+=1;c['stopped_elapsed']+=elapsed
    for i,r in enumerate(rows[:-1]):
        if r['game_id'] not in valid or enforced_penalty(r):continue
        kind='run' if r['play_type']=='run' else 'pass_complete' if r['play_type']=='pass' and r.get('complete_pass')=='1' else None
        if not kind:continue
        nxt=rows[i+1]
        try:
            s=source_state(r)
            if nxt['game_id']!=r['game_id'] or nxt['qtr']!=r['qtr']:continue
            elapsed=s.clock-int(float(nxt['quarter_seconds_remaining']))
            if not 0<elapsed<=60:excluded['source_gap']+=1;continue
            add('source',s,kind,elapsed,r.get('timeout')=='1' or (nxt.get('timeout')=='1' and nxt.get('play_type')=='no_play'))
        except (ValueError,KeyError,TypeError):excluded['source_context']+=1
    prepared=Sampler(model,batch['seed']).tables;failed=Counter();complete=0;phantom=Counter()
    for i in range(runs):
        try:row=game(model,batch['seed']+i,both_possessions=False,trace=True,prepared_tables=prepared)
        except ValueError as e:failed[str(e)]+=1;continue
        complete+=1;events=row['events']
        for j,e in enumerate(events):
            from .state import State
            state=dict(e['before']);state['ot_completed']=tuple(state['ot_completed']);s=State(**state)
            stopped=j+1<len(events) and events[j+1]['action']['kind']=='timeout'
            add('simulation',s,e['action']['kind'],e['action']['elapsed'],stopped)
            meta=e.get('clock_coupling') or {}
            if (s.period in (2,4) and s.clock<=300 and e['action']['kind'] in ('run','pass_complete')
                and e['after']['phase']=='scrimmage' and e['after']['possession']==s.possession
                and meta.get('source_followed_timeout') and not stopped):
                phantom['source_flagged_no_call_plays']+=1
                if not meta.get('runoff_replaced'):phantom['unreplaced_source_stops']+=1

    def report(groups):
        result={}
        for k,c in groups.items():
            if c['n']:result[k]=dict(c,mean_elapsed=c['elapsed']/c['n'],stopped_mean=c['stopped_elapsed']/c['stopped_n'] if c['stopped_n'] else None)
        total=sum((c for c in groups.values()),Counter());return dict(groups=result,total=dict(total,mean_elapsed=total['elapsed']/total['n'] if total['n'] else None,stopped_mean=total['stopped_elapsed']/total['stopped_n'] if total['stopped_n'] else None))
    reweighted=sum(c['n']*counters['source'][k]['elapsed']/counters['source'][k]['n'] for k,c in counters['simulation'].items() if counters['source'][k]['n'])
    matched=sum(c['n'] for k,c in counters['simulation'].items() if counters['source'][k]['n'])
    return dict(model_id=model['model_id'],source_sha256=hashlib.sha256(raw).hexdigest(),model_sha256=batch['artifact_sha256'],seed=batch['seed'],prefix_runs=runs,completed=complete,failures=dict(failed),phantom_stop_diagnostic=dict(phantom,passed=complete==runs and not phantom['unreplaced_source_stops']),excluded=dict(excluded),source=report(counters['source']),simulation=report(counters['simulation']),source_mean_reweighted_to_simulated_half_band_lead_kind_mix=reweighted/matched if matched else None,matched_simulated_plays=matched,diagnostic_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),scope='Same-seed trace prefix, not new ensemble or validation. Raw empirical event gaps, not verified physical play durations. Conditional aggregates do not identify causal clock policy.')
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--folder',required=True);p.add_argument('--source',required=True);p.add_argument('--runs',type=int,default=1000);a=p.parse_args();print(json.dumps(audit(a.folder,a.source,a.runs),indent=2))

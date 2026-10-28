"""Seeded research game runner, ensemble summaries, and reproducible typical replay.

No sportsbook calls, database writes, current-player identities or model promotion.
"""
import argparse
from collections import Counter
from dataclasses import asdict,replace
from datetime import datetime,timezone
import gzip,hashlib,json,math,time
from pathlib import Path
from .state import State,Action,transition
from .model import Sampler,fit
from .workload import Allocator,validate_context

PROTOCOL='vq-game-research-baseline-2026-10-27'
def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()
def distribution(values):
    if not values:return None
    ordered=sorted(values);n=len(values)
    def q(p):
        rank=p*(n-1);lo=math.floor(rank);hi=math.ceil(rank)
        return ordered[lo]+(ordered[hi]-ordered[lo])*(rank-lo)
    bins=Counter(values)
    return dict(n=n,mean=sum(values)/n,quantiles={f'p{int(p*100)}':q(p) for p in (.05,.1,.25,.5,.75,.9,.95)},bins=[dict(lo=k,hi=k,count=v) for k,v in sorted(bins.items())])

def game(model,seed,*,both_possessions=True,max_events=1200,trace=False,workload_context=None,prepared_tables=None):
    sampler=Sampler(model,seed,prepared_tables);receiver=sampler.rng.choice(('home','away'))
    s=State(possession='away' if receiver=='home' else 'home',phase='kickoff',down=None,distance=None,yardline=65,second_half_receiver='away' if receiver=='home' else 'home',ot_both_possessions=both_possessions)
    allocator=Allocator(workload_context,seed ^ 0x51A7) if workload_context else None
    queued_timeout=None;decision_read_state=None
    events=[];kinds=Counter();rejected=Counter();scoring=Counter();diagnostics=Counter()
    for sequence in range(max_events):
        if s.phase=='final':return dict(seed=seed,home=s.home_score,away=s.away_score,event_count=sequence,scoring=dict(scoring),diagnostics=dict(diagnostics),kinds=dict(kinds),fallbacks=dict(sampler.fallbacks),rejected_templates=dict(rejected),events=events,workload=allocator.result() if allocator else None)
        coupling=None
        if queued_timeout is not None:
            if decision_read_state!=s:raise ValueError('queued timeout state mismatch')
            a=queued_timeout;queued_timeout=None;decision_read_state=None
        elif s.phase=='overtime_required':a=Action('start_overtime',receiving_side=sampler.rng.choice(('home','away')))
        elif s.clock==0 and s.phase!='try':a=Action('end_period')
        else:
            # Invalid source-template/state combinations are retried, never silent repair of scores.
            for _ in range(100):
                a=sampler.draw(s,allow_timeout=decision_read_state!=s)
                try:transition(s,a);break
                except ValueError as e:rejected[str(e)]+=1
            else:raise ValueError('no legal empirical transition after 100 attempts')
        decision_read_state=None
        if a.kind in ('run','pass_complete'):
            original=a
            a,queued_timeout,decision_read_state=sampler.couple_stop(s,a)
            if decision_read_state is not None:coupling=dict(original_elapsed=original.elapsed,committed_elapsed=a.elapsed,timeout_queued=queued_timeout is not None)
        event=transition(s,a);kinds[a.kind]+=1
        late=s.phase=='scrimmage' and s.period in (2,4) and s.clock<=30 and s.yardline<=35
        if a.kind in ('field_goal','blocked_field_goal'):
            diagnostics['fg_attempts']+=1
            if late:diagnostics['late_fg_attempts']+=1
        if late and a.kind not in ('timeout','end_period'):diagnostics['late_decisions']+=1
        delta=event.after.home_score+event.after.away_score-s.home_score-s.away_score
        if delta==6:scoring['touchdowns']+=1
        if a.kind=='field_goal' and delta==3:scoring['field_goals']+=1
        participants=allocator.apply(event) if allocator else []
        if trace:events.append(dict(sequence=sequence,before=asdict(s),action=asdict(a),after=asdict(event.after),participants=participants,clock_coupling=coupling))
        s=event.after
    raise ValueError('event limit: game incomplete')

def run_batch(model,n,seed,*,both_possessions=True,workload_context=None):
    if type(n) is not int or not 1<=n<=50000:raise ValueError('requested runs must be 1..50000')
    if type(seed) is not int:raise ValueError('integer seed required')
    if workload_context:validate_context(workload_context)
    started=time.perf_counter();prepared_tables=Sampler(model,seed).tables;rows=[];failures=Counter();rejections=Counter();kinds=Counter();censoring=Counter()
    for i in range(n):
        try:
            row=game(model,seed+i,both_possessions=both_possessions,workload_context=workload_context,prepared_tables=prepared_tables);rows.append(row)
            rejections.update(row['rejected_templates']);kinds.update(row['kinds'])
            censoring.update({k:v for k,v in row['fallbacks'].items() if isinstance(k,str)})
        except ValueError as e:failures[str(e)]+=1
    actual=len(rows)
    if not actual:raise ValueError('All simulations failed: '+str(dict(failures)))
    home=[r['home'] for r in rows];away=[r['away'] for r in rows];margins=[h-a for h,a in zip(home,away)];totals=[h+a for h,a in zip(home,away)]
    med_h=distribution(home)['quantiles']['p50'];med_a=distribution(away)['quantiles']['p50']
    # Fixed BEFORE evaluation: L1 team-score distance to marginal medians, earliest seed tie-break.
    typical=min(rows,key=lambda r:(abs(r['home']-med_h)+abs(r['away']-med_a),r['seed']))
    replay=game(model,typical['seed'],both_possessions=both_possessions,trace=True,workload_context=workload_context,prepared_tables=prepared_tables)
    model_hash=hashlib.sha256(canonical(model)).hexdigest()
    manifest=dict(model_id=model['model_id'],artifact_sha256=model_hash,protocol_id=PROTOCOL,seed=seed,runs=n,both_possessions=both_possessions,source_hashes=[s['sha256'] for s in model['sources']],workload_context=workload_context)
    return dict(schema_version='vq-game-batch/0.1',mode='research_baseline',status='SHADOW_ONLY',generated_at=datetime.now(timezone.utc).isoformat(),model_id=model['model_id'],artifact_sha256=model_hash,input_hash=hashlib.sha256(canonical(manifest)).hexdigest(),protocol_id=PROTOCOL,runs=dict(requested=n,actual=actual,failed=n-actual),seed=seed,runtime_seconds=time.perf_counter()-started,sources=model['sources'],research_metrics={name:distribution([r['scoring'].get(name,0) if name in ('touchdowns','field_goals') else r['kinds'].get('punt',0)+r['kinds'].get('punt_blocked',0) if name=='punts' else r['kinds'].get('timeout',0) if name=='timeouts' else r['diagnostics'].get(name,0) for r in rows]) for name in ('touchdowns','field_goals','punts','timeouts','fg_attempts','late_fg_attempts','late_decisions')},ensemble=dict(home_score=distribution(home),away_score=distribution(away),margin=distribution(margins),total=distribution(totals),home_win=dict(count=sum(h>a for h,a in zip(home,away)),n=actual),away_win=dict(count=sum(a>h for h,a in zip(home,away)),n=actual),tie=dict(count=sum(a==h for h,a in zip(home,away)),n=actual)),replay=dict(seed=typical['seed'],selection=dict(method='minimum_l1_team_score_medians',description='Smallest absolute home/away score distance to ensemble medians; lowest seed breaks ties.',distance=abs(typical['home']-med_h)+abs(typical['away']-med_a)),events=replay['events']),coverage=dict(failures=dict(failures),illegal_template_rejections=dict(rejections),sampled_kinds=dict(kinds),censoring=dict(censoring)),players=([dict(player_id=p["id"],name=p["name"],team=p["team"],supported=False,unsupported_reason="Scenario allocation only; targets/compound credited stats incomplete and uncalibrated",stats={stat:distribution([next(q for q in r["workload"]["players"] if q["id"]==p["id"])["stats"][stat] for r in rows]) for stat in p["stats"]}) for p in rows[0]["workload"]["players"]] if workload_context else []),blockers=['UNCALIBRATED_LEAGUE_BASELINE','NOT_A_CURRENT_MATCHUP_FORECAST','NO_CURRENT_ROSTER_OR_AVAILABILITY','PLAYER_WORKLOAD_NOT_YET_SUPPORTED','HISTORICAL_KICKOFF_DISTRIBUTION','COMPOUND_LIVE_BALL_PENALTIES_EXCLUDED']+(['INCOMPLETE_SIMULATION_COVERAGE'] if actual<n else [])+(['UNSUPPORTED_CENSORING'] if censoring.get('unsupported_censoring') else []))

def main():
    p=argparse.ArgumentParser();p.add_argument('--train',nargs='+',type=Path);p.add_argument('--model',type=Path,required=True);p.add_argument('--output',type=Path);p.add_argument('--runs',type=int,default=1000);p.add_argument('--seed',type=int,default=1701);p.add_argument('--workload-context',type=Path);p.add_argument('--opening-td-sudden-death',action='store_true');a=p.parse_args()
    if a.train:
        model=fit(a.train);a.model.parent.mkdir(parents=True,exist_ok=True);a.model.write_bytes(canonical(model));print(json.dumps(dict(training=model['coverage'],artifact_sha256=hashlib.sha256(canonical(model)).hexdigest())),flush=True)
    else:
        raw=a.model.read_bytes();model=json.loads(gzip.decompress(raw) if raw[:2]==b'\x1f\x8b' else raw)
    if a.output:
        result=run_batch(model,a.runs,a.seed,both_possessions=not a.opening_td_sudden_death,workload_context=json.loads(a.workload_context.read_text()) if a.workload_context else None);a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(result,indent=2,allow_nan=False)+'\n');print(json.dumps({k:result[k] for k in ('runs','runtime_seconds','artifact_sha256')}),flush=True)
if __name__=='__main__':main()

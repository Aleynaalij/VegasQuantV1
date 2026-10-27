"""Empirical league-level play sampler. Research baseline, not a calibrated pick model."""
from collections import Counter,defaultdict
import csv,gzip,hashlib,io,json,math,random
from dataclasses import asdict, replace
from pathlib import Path
from .state import State,Action,other

MODEL_ID='vq-empirical-game/0.1.1'
def integer(value):
    f=float(value)
    if not math.isfinite(f) or f!=int(f):raise ValueError('invalid integer')
    return int(f)
def bucket(s):
    return (s.phase,s.down or 0,'short' if (s.distance or 0)<=3 else 'medium' if (s.distance or 0)<=10 else 'long','red' if s.yardline<=20 else 'mid' if s.yardline<=60 else 'back','late' if s.period in (2,4,5) and s.clock<=120 else 'normal','ahead' if getattr(s,s.possession+'_score')>getattr(s,other(s.possession)+'_score') else 'behind' if getattr(s,s.possession+'_score')<getattr(s,other(s.possession)+'_score') else 'tied')
def contexts(s):
    b=bucket(s)
    return ['|'.join(map(str,b[:n])) for n in (6,4,3,2,1)]
def source_state(r):
    side='home' if r['posteam']==r['home_team'] else 'away'
    kind=r['play_type']
    phase='try' if kind=='extra_point' or r.get('two_point_attempt')=='1' else 'kickoff' if kind=='kickoff' else 'scrimmage'
    return State(period=integer(r['qtr']),clock=integer(r['quarter_seconds_remaining']),possession=side,yardline=integer(r['yardline_100']) if phase=='scrimmage' else 65,down=integer(r['down']) if phase=='scrimmage' else None,distance=integer(r['ydstogo']) if phase=='scrimmage' else None,home_score=integer(r['posteam_score'] if side=='home' else r['defteam_score']),away_score=integer(r['defteam_score'] if side=='home' else r['posteam_score']),phase=phase)

def fit(paths):
    counts=Counter();buckets=defaultdict(list);sources=[];templates=[];ids={};seen_sources=set();seen_games=set()
    for path in paths:
        data=Path(path).read_bytes();raw=gzip.decompress(data) if data[:2]==b'\x1f\x8b' else data
        rows=list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))
        if any(r['season']!='2022' for r in rows):raise ValueError('Fit restricted to frozen 2022 training season')
        digest=hashlib.sha256(data).hexdigest()
        game_ids={r['game_id'] for r in rows}
        if digest in seen_sources or game_ids & seen_games:raise ValueError('duplicate training source/game')
        seen_sources.add(digest);seen_games.update(game_ids)
        sources.append(dict(file=Path(path).name,sha256=hashlib.sha256(data).hexdigest(),source_url='https://github.com/nflverse/nflverse-data/releases/download/pbp/'+Path(path).name))
        for i,r in enumerate(rows[:-1]):
            counts['rows']+=1
            try:
                if r.get('season_type')!='REG':raise ValueError('not regular season')
                s=source_state(r)
                if s.period>4:raise ValueError('regulation fit only')
                nxt=rows[i+1]
                if nxt['game_id']!=r['game_id']:raise ValueError('game boundary')
                elapsed=s.clock-integer(nxt['quarter_seconds_remaining']) if nxt['qtr']==r['qtr'] else 0
                if not 0<=elapsed<=60:raise ValueError('clock gap')
                kind=r['play_type'];a={};y=integer(r.get('yards_gained') or 0)
                if s.phase=='try':
                    a=dict(kind='two_point' if r.get('two_point_attempt')=='1' else 'extra_point',elapsed=0,made=(r.get('two_point_conv_result')=='success') if r.get('two_point_attempt')=='1' else r.get('extra_point_result')=='good')
                elif s.phase=='kickoff':
                    if r.get('touchdown')=='1':a=dict(kind='kick_return_touchdown',elapsed=elapsed)
                    else:
                        following=next((t for t in rows[i+1:i+10] if t['game_id']==r['game_id'] and t['posteam'] and t.get('down') and t.get('yardline_100')),None)
                        if following is None:raise ValueError('kickoff landing missing')
                        a=dict(kind='kickoff',elapsed=elapsed,receiver_yardline=integer(following['yardline_100']))
                        if following['posteam']==r['posteam']:a['receiving_side']='same'
                elif kind=='no_play' and r.get('penalty')=='1':
                    if nxt['posteam']!=r['posteam'] or nxt['qtr']!=r['qtr']:raise ValueError('compound penalty')
                    gain=s.yardline-integer(nxt['yardline_100']);nd=integer(nxt['down'])
                    auto=r.get('first_down_penalty')=='1';loss=nd==s.down+1
                    if nd not in (s.down,s.down+1) and not(auto and nd==1):raise ValueError('compound down enforcement')
                    a=dict(kind='penalty',elapsed=elapsed,yards=gain,automatic_first=auto,loss_of_down=loss)
                elif r.get('penalty')=='1':raise ValueError('live ball penalty')
                elif r.get('touchdown')=='1' and r.get('td_team') and r['td_team']!=r['posteam']:a=dict(kind='defensive_touchdown',elapsed=max(1,elapsed))
                elif kind in ('run','pass','qb_kneel','qb_spike'):
                    if elapsed<1:raise ValueError('missing snap elapsed')
                    if r.get('interception')=='1' or r.get('fumble_lost')=='1':
                        # Include observed return yardage in possession spot, not player credited yards.
                        if nxt['posteam']!=r['defteam'] or not nxt.get('yardline_100'):raise ValueError('turnover spot missing')
                        net=s.yardline-(100-integer(nxt['yardline_100']))
                        a=dict(kind='interception' if r.get('interception')=='1' else 'fumble_lost',elapsed=elapsed,spot=net)
                    elif r.get('fumble')=='1':
                        if nxt['posteam']!=r['posteam']:raise ValueError('fumble spot missing')
                        a=dict(kind='fumble_recovered',elapsed=elapsed,yards=s.yardline-integer(nxt['yardline_100']))
                    else:
                        action_kind={'run':'run','qb_kneel':'kneel','qb_spike':'spike'}.get(kind)
                        if action_kind is None:action_kind='sack' if r.get('sack')=='1' else 'pass_complete' if r.get('complete_pass')=='1' else 'pass_incomplete'
                        a=dict(kind=action_kind,elapsed=elapsed,yards=y if action_kind not in ('spike','pass_incomplete') else 0)
                elif kind=='punt' or (kind=='field_goal' and r.get('field_goal_result')=='blocked'):
                    if not nxt.get('yardline_100') or nxt['posteam'] not in (r['posteam'],r['defteam']):raise ValueError('kick spot missing')
                    same=nxt['posteam']==r['posteam'];landing=integer(nxt['yardline_100']) if same else 100-integer(nxt['yardline_100'])
                    a=dict(kind='punt_blocked' if r.get('punt_blocked')=='1' else 'blocked_field_goal' if kind=='field_goal' else 'punt',elapsed=elapsed,spot=s.yardline-landing)
                    if same:a['receiving_side']='same'
                elif kind=='field_goal':a=dict(kind='field_goal',elapsed=elapsed,made=r.get('field_goal_result')=='made')
                else:raise ValueError('unsupported source event')
                key=json.dumps(a,sort_keys=True,separators=(',',':'))
                if key not in ids:ids[key]=len(templates);templates.append(a)
                for ctx in contexts(s):buckets[ctx].append(ids[key])
                counts['accepted']+=1;counts['kind:'+a['kind']]+=1
            except (ValueError,TypeError,KeyError) as e:counts['excluded:'+str(e)]+=1
    if not templates:raise ValueError('No training templates')
    model=dict(model_id=MODEL_ID,status='SHADOW_ONLY',sources=sources,training_seasons=[2022],templates=templates,buckets={k:{str(i):n for i,n in Counter(v).items()} for k,v in sorted(buckets.items())},coverage=dict(counts),minimum_context=30,limitations=['League-level baseline; no current team strength','No current roster or availability inference','No fitted current player workload','Clock gaps reflect historical pre-snap timing','Live-ball compound penalties remain excluded','No probability calibration or edge approval'])
    return model

class Sampler:
    def __init__(self,model,seed,tables=None):
        if model['model_id']!=MODEL_ID:raise ValueError('unsupported model')
        self.model=model;self.rng=random.Random(seed);self.tables=tables if tables is not None else {};self.fallbacks=Counter()
        if tables is not None:return
        for ctx,entries in model['buckets'].items():
            keys=sorted(entries,key=int);weights=[entries[k] for k in keys]
            self.tables[ctx]=(keys,weights,sum(weights))
    def draw(self,s):
        if s.phase=='safety_kick':s=replace(s,phase='kickoff')
        for ctx in contexts(s):
            table=self.tables.get(ctx)
            if table and (table[2]>=self.model['minimum_context'] or ctx==s.phase):break
        else:raise ValueError('no empirical phase support: '+s.phase)
        self.fallbacks[len(ctx.split('|'))]+=1
        key=self.rng.choices(table[0],weights=table[1],k=1)[0];data=dict(self.model['templates'][int(key)])
        data['elapsed']=min(data.get('elapsed',0),s.clock)
        if data.get('receiving_side')=='same':data['receiving_side']=s.possession
        if 'spot' in data:
            # Template spot stores observed net progress; map it to today's field position.
            spot=s.yardline-data['spot'];data['spot']=max(0,min(99,spot))
        if data['kind'] in ('run','pass_complete','sack','kneel','fumble_recovered'):
            data['yards']=max(s.yardline-100,min(s.yardline,data['yards']))
        if s.phase=='safety_kick':data['kind']='kickoff'
        return Action(**data)

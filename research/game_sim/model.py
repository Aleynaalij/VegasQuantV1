"""Empirical league-level play sampler. Research baseline, not a calibrated pick model."""
from collections import Counter,defaultdict
import csv,gzip,hashlib,io,json,math,random
from dataclasses import asdict, replace
from pathlib import Path
from .state import State,Action,other

MODEL_ID='vq-empirical-game/0.2.6'
def integer(value):
    f=float(value)
    if not math.isfinite(f) or f!=int(f):raise ValueError('invalid integer')
    return int(f)
def bucket(s):
    distance=s.distance or 0
    distance_bin=str(distance) if distance<=3 else '4-6' if distance<=6 else '7-10' if distance<=10 else '11+'
    field_bin=next(str(edge) for edge in (5,10,20,40,60,80,100) if s.yardline<=edge)
    if s.phase=='scrimmage' and distance==s.yardline:field_bin+=':goal'
    return (s.phase,s.down or 0,distance_bin,field_bin,('last10' if s.clock<=10 else 'last30' if s.clock<=30 else 'last120' if s.clock<=120 else 'last300' if s.period in (4,5) and s.clock<=300 else 'normal') if s.period in (2,4,5) else 'normal','ahead' if getattr(s,s.possession+'_score')>getattr(s,other(s.possession)+'_score') else 'behind' if getattr(s,s.possession+'_score')<getattr(s,other(s.possession)+'_score') else 'tied')

def zero_timeout_contexts(s):
    phase,_,_,field,clock,coarse=bucket(s)
    if phase!='scrimmage' or clock=='normal':return []
    half_clock=clock+('@h1' if s.period==2 else '@h2')
    return ['|'.join((phase,c,'non-timeout-only',field.split(':')[0],coarse)) for c in (half_clock,clock)]


def context_options(s):
    phase,down,distance,field,clock,coarse=bucket(s)
    field=field if phase=='scrimmage' else '_'
    if clock!='normal':
        margin=getattr(s,s.possession+'_score')-getattr(s,other(s.possession)+'_score')
        size=abs(margin)
        fine=coarse+('1-3' if size<=3 else '4-8' if size<=8 else '9+') if margin else coarse
        half_clock=clock+('@h1' if s.period==2 else '@h2')
        flags=(('oTO:y' if getattr(s,s.possession+'_timeouts') else 'oTO:n'),('dTO:y' if getattr(s,other(s.possession)+'_timeouts') else 'dTO:n')) if phase=='scrimmage' else ()
        prefix=(phase,half_clock)+flags
        key=prefix+(field,fine,str(down),distance)
        floors=list(dict.fromkeys('|'.join(prefix+(zone,coarse)) for zone in (field,field.split(':')[0])))
        primary=list(dict.fromkeys(['|'.join(key[:n]) for n in (len(key),len(key)-1,len(key)-2)]+floors))
        pooled=list(dict.fromkeys('|'.join((phase,clock)+flags+(zone,coarse)) for zone in (field,field.split(':')[0])))
        windows=[]
        if phase=='scrimmage':
            if s.clock<=120:
                for window in (['last30window','last120window'] if s.clock<=10 else ['last120window']):
                    windows.append('|'.join((phase,window+('@h1' if s.period==2 else '@h2'))+flags+(field.split(':')[0],coarse)))
                windows.append('|'.join((phase,'last120window')+flags+(field.split(':')[0],coarse)))
            windows.append('|'.join((phase,'last300window'+('@h1' if s.period==2 else '@h2'))+flags+(field.split(':')[0],coarse)))
            windows.append('|'.join((phase,'last300window')+flags+(field.split(':')[0],coarse)))
        return primary,floors,pooled+windows+(zero_timeout_contexts(s) if not s.home_timeouts and not s.away_timeouts else [])
    key=(phase,clock,field,str(down),distance,coarse)
    primary=list(dict.fromkeys(['|'.join(key[:n]) for n in (6,5,4,3)]+['|'.join((phase,clock,field.split(':')[0]))]))
    return primary,primary[-1:],[]


def contexts(s):
    primary,_,pooled=context_options(s)
    result=primary+pooled
    if s.phase=='scrimmage' and s.period in (2,4,5) and s.clock<=30:
        _,_,_,field,_,coarse=bucket(s)
        flags=('oTO:y' if getattr(s,s.possession+'_timeouts') else 'oTO:n','dTO:y' if getattr(s,other(s.possession)+'_timeouts') else 'dTO:n')
        result.append('|'.join((s.phase,'last30window'+('@h1' if s.period==2 else '@h2'))+flags+(field.split(':')[0],coarse)))
    if s.phase=='scrimmage' and s.period in (2,4,5) and s.clock<=300:
        _,_,_,field,_,coarse=bucket(s)
        flags=('oTO:y' if getattr(s,s.possession+'_timeouts') else 'oTO:n','dTO:y' if getattr(s,other(s.possession)+'_timeouts') else 'dTO:n')
        for clock in ('last300window'+('@h1' if s.period==2 else '@h2'),'last300window'):
            result.append('|'.join((s.phase,clock)+flags+(field.split(':')[0],coarse)))
    return list(dict.fromkeys(result))


def censored_gain(curve,origin,target,rng):
    """A latent simulated gain drawn from a source-estimated survival distribution."""
    if not curve or not 0<origin<target<100:return None
    values=curve['survival'][origin:target+1]
    if any(v is None or not math.isfinite(v) or v<0 for v in values) or values[0]<=0:return None
    mass=[max(0,values[i]-values[i+1]) for i in range(target-origin)]
    mass.append(values[-1])
    if not math.isclose(sum(mass),values[0],rel_tol=1e-9,abs_tol=1e-12):return None
    return rng.choices(list(range(origin,target+1)),weights=mass,k=1)[0]

def source_state(r):
    side='home' if r['posteam']==r['home_team'] else 'away'
    kind=r['play_type']
    phase='try' if kind=='extra_point' or r.get('two_point_attempt')=='1' else 'kickoff' if kind=='kickoff' else 'scrimmage'
    # nflverse kickoff posteam is the receiver; the kernel stores the kicker.
    home_score=integer(r['posteam_score'] if side=='home' else r['defteam_score'])
    away_score=integer(r['defteam_score'] if side=='home' else r['posteam_score'])
    possession=other(side) if phase=='kickoff' else side
    budgets={}
    if phase=='scrimmage':
        offense=integer(r.get('posteam_timeouts_remaining',''));defense=integer(r.get('defteam_timeouts_remaining',''))
        if not 0<=offense<=3 or not 0<=defense<=3:raise ValueError('invalid source timeout budget')
        budgets={side+'_timeouts':offense,other(side)+'_timeouts':defense}
    return State(**budgets,period=integer(r['qtr']),clock=integer(r['quarter_seconds_remaining']),possession=possession,yardline=integer(r['yardline_100']) if phase=='scrimmage' else 65,down=integer(r['down']) if phase=='scrimmage' else None,distance=integer(r['ydstogo']) if phase=='scrimmage' else None,home_score=home_score,away_score=away_score,phase=phase)


def enforced_penalty(row):
    if row.get('penalty')!='1':return False
    if row.get('play_type')=='no_play':return True
    try:value=float(row.get('penalty_yards') or 0)
    except ValueError:raise ValueError('invalid penalty enforcement yards')
    if not math.isfinite(value):raise ValueError('invalid penalty enforcement yards')
    return value!=0

def survival_table(observations):
    survival=[None]*100;support=[None]*100;ceiling=1.0
    uncensored=Counter()
    for origin,gain,td in observations:
        if not td:uncensored[gain]+=1
    for g in range(1,100):
        risk=[gain for origin,gain,td in observations if origin>=g]
        successes=sum(gain>=g for gain in risk)
        support[g]=dict(eligible=len(risk),successes=successes)
        if risk:
            ceiling=min(ceiling,successes/len(risk));survival[g]=ceiling
    return dict(survival=survival,support=support,uncensored={str(k):v for k,v in sorted(uncensored.items())})

def fit(paths):
    observations=defaultdict(list);counts=Counter();buckets=defaultdict(list);sources=[];templates=[];ids={};seen_sources=set();seen_games=set()
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
                timeout=r.get('timeout')=='1'
                if timeout:
                    context=next((t for t in rows[i+1:i+9] if t['game_id']==r['game_id'] and t['qtr']==r['qtr'] and t.get('posteam') and t.get('down') and t.get('yardline_100')),None)
                    if context is None or context['quarter_seconds_remaining']!=r['quarter_seconds_remaining']:raise ValueError('ambiguous timeout state')
                    s=source_state(context)
                    if r.get('timeout_team') not in (context['posteam'],context['defteam']):raise ValueError('unknown timeout caller')
                    caller='home' if r['timeout_team']==r['home_team'] else 'away'
                    post={side:integer(r.get(side+'_timeouts_remaining','')) for side in ('home','away')}
                    if any(not 0<=n<=3 for n in post.values()) or post[caller]>=3:raise ValueError('invalid post-timeout source budget')
                    post[caller]+=1
                    s=replace(s,**{side+'_timeouts':n for side,n in post.items()})
                else:s=source_state(r)
                if s.period>4:raise ValueError('regulation fit only')
                nxt=rows[i+1]
                if nxt['game_id']!=r['game_id']:raise ValueError('game boundary')
                elapsed=s.clock-integer(nxt['quarter_seconds_remaining']) if nxt['qtr']==r['qtr'] else 0
                if not 0<=elapsed<=60:raise ValueError('clock gap')
                kind=r['play_type'];a={};y=integer(r.get('yards_gained') or 0)
                if timeout:
                    a=dict(kind='timeout',elapsed=0,timeout_side='offense' if r['timeout_team']==context['posteam'] else 'defense')
                elif s.phase=='try':
                    a=dict(kind='two_point' if r.get('two_point_attempt')=='1' else 'extra_point',elapsed=0,made=(r.get('two_point_conv_result')=='success') if r.get('two_point_attempt')=='1' else r.get('extra_point_result')=='good')
                elif s.phase=='kickoff':
                    if r.get('touchdown')=='1':a=dict(kind='kick_return_touchdown',elapsed=elapsed)
                    else:
                        following=next((t for t in rows[i+1:i+10] if t['game_id']==r['game_id'] and t['posteam'] and t.get('down') and t.get('yardline_100')),None)
                        if following is None:raise ValueError('kickoff landing missing')
                        a=dict(kind='kickoff',elapsed=elapsed,receiver_yardline=integer(following['yardline_100']))
                        if following['posteam']==r['defteam']:a['receiving_side']='same'
                elif enforced_penalty(r):
                    if nxt['posteam']!=r['posteam'] or nxt['qtr']!=r['qtr']:raise ValueError('compound penalty')
                    if nxt.get('posteam_score')!=r.get('posteam_score') or nxt.get('defteam_score')!=r.get('defteam_score'):raise ValueError('scoring penalty combination')
                    gain=s.yardline-integer(nxt['yardline_100']);nd=integer(nxt['down'])
                    # A source first down by yardage is not an automatic-first foul.
                    auto=r.get('first_down_penalty')=='1' and gain<s.distance;loss=nd==s.down+1
                    if nd not in (s.down,s.down+1) and not((auto or gain>=s.distance) and nd==1):raise ValueError('compound down enforcement')
                    a=dict(kind='penalty',elapsed=elapsed,yards=gain,automatic_first=auto,loss_of_down=loss)
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
                if a['kind'] in ('run','pass_complete'):
                    td=r.get('touchdown')=='1'
                    observations[a['kind']].append((s.yardline,a['yards'],td))
                    if td:a['td_from']=s.yardline
                if r.get('penalty')=='1' and not enforced_penalty(r):counts['flag_not_enforced_ordinary']+=1
                key=json.dumps(a,sort_keys=True,separators=(',',':'))
                if key not in ids:ids[key]=len(templates);templates.append(a)
                fit_contexts=contexts(s)+(zero_timeout_contexts(s) if a['kind']!='timeout' else [])
                for ctx in dict.fromkeys(fit_contexts):buckets[ctx].append(ids[key])
                counts['accepted']+=1;counts['kind:'+a['kind']]+=1
                if enforced_penalty(r) and kind!='no_play':counts['normalized_live_ball_penalty']+=1
            except (ValueError,TypeError,KeyError) as e:counts['excluded:'+str(e)]+=1
    if not templates:raise ValueError('No training templates')
    model=dict(model_id=MODEL_ID,status='SHADOW_ONLY',sources=sources,training_seasons=[2022],templates=templates,buckets={k:{str(i):n for i,n in Counter(v).items()} for k,v in sorted(buckets.items())},coverage=dict(counts),minimum_context=30,censoring={kind:survival_table(obs) for kind,obs in sorted(observations.items())},limitations=['League-level baseline; no current team strength','No current roster or availability inference','No fitted current player workload','Clock gaps reflect historical pre-snap timing','Live-ball compound penalties remain excluded','Pooled survival correction assumes comparable field-position gain distributions','No probability calibration or edge approval'])
    return model

class Sampler:
    def __init__(self,model,seed,tables=None):
        if model['model_id']!=MODEL_ID:raise ValueError('unsupported model; use its versioned implementation')
        self.model=model;self.rng=random.Random(seed);self.tables=tables if tables is not None else {};self.fallbacks=Counter()
        if tables is not None:return
        for ctx,entries in model['buckets'].items():
            keys=sorted(entries,key=int);weights=[entries[k] for k in keys]
            self.tables[ctx]=(keys,weights,sum(weights))
    def draw(self,s):
        if s.phase=='safety_kick':s=replace(s,phase='kickoff')
        primary,floors,pooled=context_options(s)
        def timeout_caller(template):
            return s.possession if template.get('timeout_side')=='offense' else other(s.possession)
        def eligible(table):
            if s.home_timeouts and s.away_timeouts:return table
            entries=[(k,w) for k,w in zip(table[0],table[1]) if self.model['templates'][int(k)]['kind']!='timeout' or getattr(s,timeout_caller(self.model['templates'][int(k)])+'_timeouts')>0]
            return ([k for k,w in entries],[w for k,w in entries],sum(w for k,w in entries))
        chosen=None;attempted={}
        def supported(ctx):
            if ctx in attempted:return attempted[ctx]
            table=self.tables.get(ctx)
            filtered=eligible(table) if table else None
            if filtered and not filtered[2]:
                self.fallbacks['budget_exhausted_contexts']+=1
                filtered=None
            attempted[ctx]=filtered
            return filtered
        for ctx in primary:
            table=self.tables.get(ctx)
            if table and table[2]>=self.model['minimum_context'] and supported(ctx):
                chosen=(ctx,table,supported(ctx));break
        if chosen is None:
            for ctx in floors+pooled:
                table=self.tables.get(ctx)
                if table and supported(ctx):
                    chosen=(ctx,table,supported(ctx));break
        if chosen is None:raise ValueError('no empirical context with budget-eligible actions: '+s.phase)
        ctx,source_table,table=chosen
        self.fallbacks[len(ctx.split('|'))]+=1
        if source_table[2]<self.model['minimum_context']:self.fallbacks['thin_context_support']+=1
        if bucket(s)[4]!='normal':
            self.fallbacks['clock_window_fallback' if 'window' in ctx else 'clock_preserved_samples']+=1
            if 'last300window' in ctx:self.fallbacks['last300_window_fallback']+=1
            if 'non-timeout-only' in ctx:self.fallbacks['zero_budget_pooled_action_fallback']+=1
            self.fallbacks['half_pooled_fallback' if '@h' not in ctx else 'half_preserved_samples']+=1
        key=self.rng.choices(table[0],weights=table[1],k=1)[0];data=dict(self.model['templates'][int(key)])
        if data['kind']=='timeout':data['timeout_side']=timeout_caller(data)
        origin=data.pop('td_from',None)
        if origin is not None and s.yardline>origin:
            curve=self.model.get('censoring',{}).get(data['kind'])
            gain=censored_gain(curve,origin,s.yardline,self.rng)
            if gain is None:self.fallbacks['unsupported_censoring']+=1
            else:
                data['yards']=gain
                self.fallbacks['censoring_restored_td' if gain==s.yardline else 'censoring_non_td']+=1
        data['elapsed']=min(data.get('elapsed',0),s.clock)
        if data.get('receiving_side')=='same':data['receiving_side']=s.possession
        if 'spot' in data:
            # Template spot stores observed net progress; map it to today's field position.
            spot=s.yardline-data['spot'];data['spot']=max(0,min(99,spot))
        if data['kind'] in ('run','pass_complete','sack','kneel','fumble_recovered'):
            data['yards']=max(s.yardline-100,min(s.yardline,data['yards']))
        if s.phase=='safety_kick':data['kind']='kickoff'
        return Action(**data)

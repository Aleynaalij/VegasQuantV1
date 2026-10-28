"""Empirical league-level play sampler. Research baseline, not a calibrated pick model."""
from collections import Counter,defaultdict
import csv,gzip,hashlib,io,json,math,random
from dataclasses import asdict, replace
from pathlib import Path
from .state import State,Action,other,transition

MODEL_ID='vq-empirical-game/0.2.10'
def integer(value):
    f=float(value)
    if not math.isfinite(f) or f!=int(f):raise ValueError('invalid integer')
    return int(f)
def bucket(s):
    distance=s.distance or 0
    distance_bin=str(distance) if distance<=3 else '4-6' if distance<=6 else '7-10' if distance<=10 else '11+'
    field_bin=next(str(edge) for edge in (5,10,20,40,60,80,100) if s.yardline<=edge)
    if s.phase=='scrimmage' and distance==s.yardline:field_bin+=':goal'
    return (s.phase,s.down or 0,distance_bin,field_bin,('last10' if s.clock<=10 else 'last30' if s.clock<=30 else 'last120' if s.clock<=120 else 'normal') if s.period in (2,4,5) else 'normal','ahead' if getattr(s,s.possession+'_score')>getattr(s,other(s.possession)+'_score') else 'behind' if getattr(s,s.possession+'_score')<getattr(s,other(s.possession)+'_score') else 'tied')

def context_options(s):
    phase,down,distance,field,clock,coarse=bucket(s)
    field=field if phase=='scrimmage' else '_'
    if clock!='normal':
        margin=getattr(s,s.possession+'_score')-getattr(s,other(s.possession)+'_score')
        size=abs(margin)
        fine=coarse+('1-3' if size<=3 else '4-8' if size<=8 else '9+') if margin else coarse
        half_clock=clock+('@h1' if s.period==2 else '@h2')
        key=(phase,half_clock,field,fine,str(down),distance)
        floors=list(dict.fromkeys('|'.join((phase,half_clock,zone,coarse)) for zone in (field,field.split(':')[0])))
        primary=list(dict.fromkeys(['|'.join(key[:n]) for n in (6,5,4)]+floors))
        pooled=list(dict.fromkeys('|'.join((phase,clock,zone,coarse)) for zone in (field,field.split(':')[0])))
        return primary,floors,pooled
    key=(phase,clock,field,str(down),distance,coarse)
    primary=list(dict.fromkeys(['|'.join(key[:n]) for n in (6,5,4,3)]+['|'.join((phase,clock,field.split(':')[0]))]))
    return primary,primary[-1:],[]


def contexts(s):
    primary,_,pooled=context_options(s)
    return list(dict.fromkeys(primary+pooled))


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

COMPOUND_PLAY_TYPES={'run','pass','punt','kickoff','field_goal','qb_kneel','qb_spike','extra_point'}

def training_events(rows):
    """Keep source indices: expanding events must not change observed next rows."""
    for i,row in enumerate(rows[:-1]):
        compound=row.get('timeout')=='1' and row.get('play_type') in COMPOUND_PLAY_TYPES
        yield i,row,'play' if compound else 'original'
        if compound:yield i,row,'compound_timeout'

def pre_timeout_budgets(row):
    caller_team=row.get('timeout_team')
    teams={row.get('home_team'),row.get('away_team'),row.get('posteam'),row.get('defteam')}-{None,''}
    if caller_team not in teams:raise ValueError('unknown timeout caller')
    caller='home' if caller_team==row['home_team'] else 'away'
    post={side:integer(row.get(side+'_timeouts_remaining','')) for side in ('home','away')}
    if any(not 0<=n<=3 for n in post.values()) or post[caller]>=3:raise ValueError('invalid post-timeout source budget')
    post[caller]+=1
    return {side+'_timeouts':n for side,n in post.items()}


def timeout_contexts(s,role):
    if role not in ('offense','defense'):raise ValueError('invalid timeout role')
    margin=getattr(s,s.possession+'_score')-getattr(s,other(s.possession)+'_score')
    coarse='ahead' if margin>0 else 'behind' if margin<0 else 'tied'
    fine=coarse+('1-3' if abs(margin)<=3 else '4-8' if abs(margin)<=8 else '9+') if margin else coarse
    late=s.period in (2,4,5)
    band=('last10' if s.clock<=10 else 'last30' if s.clock<=30 else 'last120' if s.clock<=120 else 'last300' if s.period in (4,5) and s.clock<=300 else None) if late else None
    band=band+('@h1' if s.period==2 else '@h2') if band else 'normal@q'+str(min(4,s.period))
    field=str(max(0,min(4,(s.yardline-1)//20)))
    return list(dict.fromkeys(['|'.join((band,role,fine,field)),'|'.join((band,role,fine)),'|'.join((band,role,coarse)),'|'.join((band,role))]))


def recovered_timeout_state(rows,i,r):
    context=next((t for t in rows[i+1:i+9] if t['game_id']==r['game_id'] and t['qtr']==r['qtr'] and t.get('posteam') and t.get('down') and t.get('yardline_100')),None)
    if context is None:raise ValueError('ambiguous timeout state')
    gap=integer(r['quarter_seconds_remaining'])-integer(context['quarter_seconds_remaining'])
    compound=r.get('play_type') in COMPOUND_PLAY_TYPES
    if (compound and not 0<=gap<=60) or (not compound and gap!=0):raise ValueError('ambiguous timeout state')
    s=source_state(context)
    if r.get('timeout_team') not in (context['posteam'],context['defteam']):raise ValueError('unknown timeout caller')
    s=replace(s,**pre_timeout_budgets(r))
    return s,'offense' if r['timeout_team']==context['posteam'] else 'defense'


def fit_timeouts(rows,tables,coverage):
    for i,r,event in training_events(rows):
        if r.get('season_type')!='REG':continue
        timeout=r.get('timeout')=='1' and event!='play'
        if not timeout and r.get('play_type') not in ('run','pass','qb_kneel','qb_spike','punt','field_goal'):continue
        try:
            if timeout:s,caller=recovered_timeout_state(rows,i,r)
            else:s=source_state(r);caller=None
            if s.period>4:raise ValueError('regulation fit only')
            if s.phase!='scrimmage':continue
            coverage['timeout_opportunities' if timeout else 'snap_opportunities']+=1
            for role,side in (('offense',s.possession),('defense',other(s.possession))):
                if getattr(s,side+'_timeouts')==0:continue
                coverage['eligible:'+role]+=1
                for key in timeout_contexts(s,role):
                    tables[key]['opportunities']+=1
                    tables[key]['timeouts']+=int(timeout and role==caller)
        except (ValueError,TypeError,KeyError) as e:coverage['excluded:'+str(e)]+=1


def stop_contexts(s,kind):
    if s.period not in (2,4,5) or s.clock>300 or s.phase!='scrimmage':return []
    band=('last10' if s.clock<=10 else 'last30' if s.clock<=30 else 'last120' if s.clock<=120 else 'last300')+('@h1' if s.period==2 else '@h2')
    lead=bucket(s)[-1];field=str(max(0,min(4,(s.yardline-1)//20)))
    return ['|'.join((band,kind,field)),'|'.join((band,kind,lead)),'|'.join((band,kind))]


def fit(paths):
    observations=defaultdict(list);counts=Counter();buckets=defaultdict(list);sources=[];templates=[];ids={};seen_sources=set();seen_games=set();timeout_tables=defaultdict(Counter);timeout_coverage=Counter();stop_tables=defaultdict(Counter);stop_coverage=Counter()
    for path in paths:
        data=Path(path).read_bytes();raw=gzip.decompress(data) if data[:2]==b'\x1f\x8b' else data
        rows=list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))
        if any(r['season']!='2022' for r in rows):raise ValueError('Fit restricted to frozen 2022 training season')
        digest=hashlib.sha256(data).hexdigest()
        game_ids={r['game_id'] for r in rows}
        if digest in seen_sources or game_ids & seen_games:raise ValueError('duplicate training source/game')
        seen_sources.add(digest);seen_games.update(game_ids)
        sources.append(dict(file=Path(path).name,sha256=hashlib.sha256(data).hexdigest(),source_url='https://github.com/nflverse/nflverse-data/releases/download/pbp/'+Path(path).name))
        fit_timeouts(rows,timeout_tables,timeout_coverage)
        for i,r,event in training_events(rows):
            counts['event_attempts']+=1
            if event!='compound_timeout':counts['rows']+=1
            if event=='play':counts['compound_source_rows']+=1
            try:
                if r.get('season_type')!='REG':raise ValueError('not regular season')
                timeout=r.get('timeout')=='1' and event!='play'
                if timeout:
                    s,caller_role=recovered_timeout_state(rows,i,r)
                else:
                    s=source_state(r)
                    if event=='play' and s.phase=='scrimmage':
                        # A malformed timeout attachment must not discard the play.
                        try:s=replace(s,**pre_timeout_budgets(r))
                        except (ValueError,TypeError,KeyError):counts['compound_play_budget_unresolved']+=1
                if s.period>4:raise ValueError('regulation fit only')
                nxt=rows[i+1]
                if nxt['game_id']!=r['game_id']:raise ValueError('game boundary')
                elapsed=0 if timeout else s.clock-integer(nxt['quarter_seconds_remaining']) if nxt['qtr']==r['qtr'] else 0
                if not 0<=elapsed<=60:raise ValueError('clock gap')
                kind=r['play_type'];a={};y=integer(r.get('yards_gained') or 0)
                if timeout:
                    a=dict(kind='timeout',elapsed=0,timeout_side=caller_role)
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
                    followed=r.get('timeout')=='1' or (nxt.get('timeout')=='1' and nxt.get('play_type')=='no_play')
                    a['source_followed_timeout']=followed
                    for key in stop_contexts(s,a['kind']) if followed else []:
                        stop_tables[key][a['elapsed']]+=1
                    if stop_contexts(s,a['kind']):
                        stop_coverage['eligible_plays']+=1
                        if followed:stop_coverage['timeout_followed_plays']+=1
                if a['kind'] in ('run','pass_complete'):
                    td=r.get('touchdown')=='1'
                    observations[a['kind']].append((s.yardline,a['yards'],td))
                    if td:a['td_from']=s.yardline
                if r.get('penalty')=='1' and not enforced_penalty(r):counts['flag_not_enforced_ordinary']+=1
                key=json.dumps(a,sort_keys=True,separators=(',',':'))
                if key not in ids:ids[key]=len(templates);templates.append(a)
                fit_contexts=contexts(s) if a['kind']!='timeout' else []
                for ctx in dict.fromkeys(fit_contexts):buckets[ctx].append(ids[key])
                counts['accepted']+=1;counts['kind:'+a['kind']]+=1
                if event!='original':counts['accepted:'+event]+=1
                if enforced_penalty(r) and kind!='no_play':counts['normalized_live_ball_penalty']+=1
            except (ValueError,TypeError,KeyError) as e:
                counts['excluded:'+str(e)]+=1
                if event!='original':counts['excluded:'+event+':'+str(e)]+=1
    if not templates:raise ValueError('No training templates')
    model=dict(model_id=MODEL_ID,status='SHADOW_ONLY',sources=sources,training_seasons=[2022],templates=templates,buckets={k:{str(i):n for i,n in Counter(v).items()} for k,v in sorted(buckets.items())},coverage=dict(counts),stop_clock=dict(tables={k:{str(dt):n for dt,n in sorted(v.items())} for k,v in sorted(stop_tables.items())},coverage=dict(stop_coverage),minimum_context=30),timeout_model=dict(tables={k:dict(v) for k,v in sorted(timeout_tables.items())},coverage=dict(timeout_coverage),minimum_context=30),minimum_context=30,censoring={kind:survival_table(obs) for kind,obs in sorted(observations.items())},limitations=['League-level baseline; no current team strength','No current roster or availability inference','No fitted current player workload','Clock gaps reflect historical pre-snap timing','Live-ball compound penalties remain excluded','Pooled survival correction assumes comparable field-position gain distributions','No probability calibration or edge approval'])
    return model

class Sampler:
    def __init__(self,model,seed,tables=None):
        if model['model_id']!=MODEL_ID:raise ValueError('unsupported model; use its versioned implementation')
        self.model=model;self.rng=random.Random(seed);self.tables=tables if tables is not None else {};self.fallbacks=Counter()
        if tables is not None:return
        for ctx,entries in model['buckets'].items():
            keys=sorted(entries,key=int);weights=[entries[k] for k in keys]
            self.tables[ctx]=(keys,weights,sum(weights))
    def timeout_probability(self,s,role):
        model=self.model['timeout_model']
        for depth,key in enumerate(timeout_contexts(s,role)):
            cell=model['tables'].get(key)
            if cell and cell['opportunities']>=model['minimum_context']:
                calls=cell.get('timeouts',0);n=cell['opportunities']
                if not 0<=calls<=n:raise ValueError('invalid timeout counts')
                self.fallbacks['timeout_context_depth:'+str(depth)]+=1
                return calls/n
        self.fallbacks['unsupported_timeout_context']+=1
        raise ValueError('no empirical timeout opportunity context: '+role)

    def timeout_decision(self,s):
        if s.phase!='scrimmage' or s.clock<=0 or not self.model.get('timeout_model'):return None
        po=self.timeout_probability(s,'offense') if getattr(s,s.possession+'_timeouts') else 0.0
        pd=self.timeout_probability(s,'defense') if getattr(s,other(s.possession)+'_timeouts') else 0.0
        if po+pd>1:
            self.fallbacks['unsupported_competing_timeout_context']+=1
            raise ValueError('inconsistent competing timeout probabilities')
        u=self.rng.random()
        if u<po+pd:
            role='offense' if u<po else 'defense'
            self.fallbacks['separate_timeout:'+role]+=1
            return Action('timeout',elapsed=0,timeout_side=s.possession if role=='offense' else other(s.possession))
        return None

    def couple_stop(self,s,a):
        """Returns committed action, queued timeout, state whose decision was read."""
        model=self.model.get('stop_clock')
        if not model or a.kind not in ('run','pass_complete') or not stop_contexts(s,a.kind):return a,None,None
        projected=transition(s,replace(a,elapsed=min(a.elapsed,max(1,s.clock-1)))).after
        if projected.phase!='scrimmage' or projected.possession!=s.possession or (projected.home_score,projected.away_score)!=(s.home_score,s.away_score):return a,None,None
        if not (s.home_timeouts or s.away_timeouts):return a,None,None
        keys=stop_contexts(s,a.kind);chosen=None
        for key in keys:
            table=model['tables'].get(key,{})
            legal=[(int(dt),n) for dt,n in table.items() if 0<int(dt)<=a.elapsed and int(dt)<s.clock]
            if legal and (sum(table.values())>=model['minimum_context'] or key==keys[-1]):
                chosen=(key,table,legal);break
        self.fallbacks['stop_clock_candidates']+=1
        if chosen is None:
            self.fallbacks['missing_eligible_stop_duration']+=1
            return a,None,None
        key,table,legal=chosen
        if sum(table.values())<model['minimum_context']:self.fallbacks['thin_stop_duration_context']+=1
        dt=self.rng.choices([v for v,n in legal],weights=[n for v,n in legal],k=1)[0]
        stopped=replace(a,elapsed=dt);after=transition(s,stopped).after
        called=self.timeout_decision(after)
        if called:
            self.fallbacks['coupled_stops']+=1
            self.fallbacks['avoided_runoff_seconds']+=a.elapsed-dt
            return stopped,called,after
        return a,None,transition(s,a).after

    def draw(self,s,*,allow_timeout=True):
        if s.phase=='safety_kick':s=replace(s,phase='kickoff')
        if allow_timeout:
            called=self.timeout_decision(s)
            if called:return called
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
            self.fallbacks['clock_preserved_samples']+=1
            self.fallbacks['half_pooled_fallback' if '@h' not in ctx else 'half_preserved_samples']+=1
        key=self.rng.choices(table[0],weights=table[1],k=1)[0];data=dict(self.model['templates'][int(key)])
        if data['kind']=='timeout':data['timeout_side']=timeout_caller(data)
        self.last_source_followed_timeout=data.pop('source_followed_timeout',None)
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

"""Explicit source-backed workload scenarios; never infer current availability.

An input scenario is an assumption supplied by a researcher. Its source manifest
and review status do not independently establish that the sources prove fitness.
"""
from collections import Counter
from datetime import datetime
import math,random,re

STATS=('passing_yards','pass_attempts','completions','passing_touchdowns','interceptions','rushing_yards','carries','rushing_touchdowns','receiving_yards','targets','receptions','receiving_touchdowns','sacks_taken')
def stamp(s):
    t=datetime.fromisoformat(s.replace('Z','+00:00'))
    if t.tzinfo is None:raise ValueError('timezone required')
    return t

def validate_context(context):
    cutoff=stamp(context['cutoff']);seen=set()
    if context.get('mode')!='scenario':raise ValueError('workload allocation is scenario-only')
    sources=context.get('sources',[])
    if not sources:raise ValueError('source manifest required')
    for s in sources:
        if not s['source_url'].startswith('https://') or not re.fullmatch('[0-9a-f]{64}',s['sha256']):raise ValueError('invalid source provenance')
        if stamp(s['retrieved_at'])>cutoff:raise ValueError('source after scenario cutoff')
    for side in ('home','away'):
        players=context['teams'][side]
        if not players:raise ValueError('empty roster scenario')
        for p in players:
            if not p['id'] or p['id'] in seen or not p['name']:raise ValueError('duplicate/missing identity')
            seen.add(p['id'])
            if p.get('availability')!='reviewed_active':raise ValueError('unknown/out availability blocks allocation')
            for role in ('passer_weight','carry_weight','target_weight'):
                w=p.get(role)
                if type(w) not in (int,float) or not math.isfinite(w) or w<0:raise ValueError('explicit finite workload weights required')
        for role in ('passer_weight','carry_weight','target_weight'):
            if sum(p[role] for p in players)<=0:raise ValueError('unsupported role: '+role)
    return context

class Allocator:
    def __init__(self,context,seed):
        self.context=validate_context(context);self.rng=random.Random(seed);self.missing=Counter()
        self.stats={p['id']:dict(id=p['id'],name=p['name'],team=side,stats=Counter()) for side in ('home','away') for p in context['teams'][side]}
    def player(self,side,role):
        rows=self.context['teams'][side]
        return self.rng.choices(rows,weights=[p[role+'_weight'] for p in rows],k=1)[0]['id']
    def add(self,p,stat,n):self.stats[p]['stats'][stat]+=n
    def apply(self,event):
        a=event.action;s=event.before;n=event.after;side=s.possession;participants=[]
        touchdown=getattr(n,side+'_score')-getattr(s,side+'_score')==6
        if a.kind in ('run','kneel'):
            p=self.player(side,'carry' if a.kind=='run' else 'passer');self.add(p,'carries',1);self.add(p,'rushing_yards',a.yards)
            if touchdown:self.add(p,'rushing_touchdowns',1)
            participants.append(dict(role='rusher',player_id=p,name=self.stats[p]['name']))
        elif a.kind in ('pass_complete','pass_incomplete','spike','interception','sack'):
            p=self.player(side,'passer');participants.append(dict(role='passer',player_id=p,name=self.stats[p]['name']))
            if a.kind=='sack':self.add(p,'sacks_taken',1)
            else:self.add(p,'pass_attempts',1)
            if a.kind=='interception':self.add(p,'interceptions',1)
            if a.kind=='pass_complete':
                q=self.player(side,'target');participants.append(dict(role='target',player_id=q,name=self.stats[q]['name']))
                for stat,value in (('targets',1),('receptions',1),('receiving_yards',a.yards)):self.add(q,stat,value)
                for stat,value in (('completions',1),('passing_yards',a.yards)):self.add(p,stat,value)
                if touchdown:self.add(p,'passing_touchdowns',1);self.add(q,'receiving_touchdowns',1)
            elif a.kind in ('pass_incomplete','interception'):
                # Throwaway vs target is not supplied in the normalized action: leave missing.
                self.missing['incomplete_or_intercepted_target_identity']+=1
        elif a.kind in ('fumble_recovered','fumble_lost','defensive_touchdown'):
            self.missing['compound_credited_stats:'+a.kind]+=1
        return participants
    def result(self):
        rows=[]
        for p in self.stats.values():rows.append(dict(id=p['id'],name=p['name'],team=p['team'],stats={k:p['stats'][k] for k in STATS}))
        return dict(players=rows,missing=dict(self.missing),scope='Scenario allocation for supported ordinary plays; targets/compound credited stats explicitly incomplete',supported=False)

"""Deterministic regulation state kernel. No fitted probabilities or forecasting claims.

Caller supplies observed/sampled actions. Overtime, penalties, kick returns/blocks,
onside kicks, defensive scoring returns and clock-management policy are unsupported.
"""
from dataclasses import dataclass, replace
from typing import Literal

Side=Literal['home','away']
Phase=Literal['scrimmage','try','kickoff','safety_kick','final','overtime_required']

def other(side:Side)->Side:return 'away' if side=='home' else 'home'

@dataclass(frozen=True)
class State:
    period:int=1
    clock:int=900
    possession:Side='home'
    yardline:int=75  # yards to offense's scoring goal
    down:int|None=1
    distance:int|None=10
    home_score:int=0
    away_score:int=0
    phase:Phase='scrimmage'
    second_half_receiver:Side='away'

    def __post_init__(self):
        for name in ('period','clock','yardline','home_score','away_score'):
            if type(getattr(self,name)) is not int:raise ValueError(f'{name} must be integer')
        if self.period not in range(1,5) or not 0<=self.clock<=900:raise ValueError('invalid period/clock')
        if self.possession not in ('home','away') or self.second_half_receiver not in ('home','away'):raise ValueError('invalid team')
        if self.phase not in ('scrimmage','try','kickoff','safety_kick','final','overtime_required'):raise ValueError('invalid phase')
        if not 0<=self.yardline<=100 or min(self.home_score,self.away_score)<0:raise ValueError('invalid field/score')
        if self.phase=='scrimmage':
            if type(self.down) is not int or self.down not in range(1,5) or type(self.distance) is not int or not 1<=self.distance<=self.yardline or not 1<=self.yardline<=99:raise ValueError('invalid scrimmage situation')
        elif self.down is not None or self.distance is not None:raise ValueError('no down/distance outside scrimmage')
        if self.phase in ('final','overtime_required') and (self.period!=4 or self.clock!=0):raise ValueError('terminal state before regulation ends')

@dataclass(frozen=True)
class Action:
    kind:str
    elapsed:int=0
    yards:int=0
    made:bool|None=None
    spot:int|None=None  # turnover/punt dead-ball spot, original offense yards to goal
    receiver_yardline:int|None=None  # explicit next possession spot for kickoffs

@dataclass(frozen=True)
class Event:
    before:State
    action:Action
    after:State


def new_series(s:State, side:Side, yardline:int)->State:
    if type(yardline) is not int or not 1<=yardline<=99:raise ValueError('invalid new series spot')
    return replace(s,possession=side,yardline=yardline,down=1,distance=min(10,yardline),phase='scrimmage')

def points(s:State,side:Side,n:int,phase:Phase)->State:
    name=f'{side}_score'
    return replace(s,**{name:getattr(s,name)+n},phase=phase,down=None,distance=None)

def terminal(s:State)->State:
    phase='overtime_required' if s.home_score==s.away_score else 'final'
    return replace(s,phase=phase,down=None,distance=None)


def transition(s:State,a:Action)->Event:
    if s.phase in ('final','overtime_required'):raise ValueError('terminal state')
    if type(a.elapsed) is not int or not 0<=a.elapsed<=s.clock or type(a.yards) is not int:raise ValueError('invalid elapsed/yards')
    if a.kind=='end_period':
        if s.clock!=0 or a.elapsed or a.yards or s.phase=='try':raise ValueError('period not ready to advance')
        if s.period==4:return Event(s,a,terminal(s))
        if s.period==2:
            # New half: no previous possession or pending first-half kickoff carries over.
            n=replace(s,period=3,clock=900,possession=other(s.second_half_receiver),phase='kickoff',down=None,distance=None,yardline=65)
        else:n=replace(s,period=s.period+1,clock=900)
        return Event(s,a,n)
    if s.clock==0 and s.phase!='try':raise ValueError('advance the period first')
    n=replace(s,clock=s.clock-a.elapsed)
    if s.phase=='try':
        if a.elapsed or a.kind not in ('extra_point','two_point') or type(a.made) is not bool:raise ValueError('invalid conversion')
        n=points(n,s.possession,(1 if a.kind=='extra_point' else 2) if a.made else 0,'kickoff')
        n=replace(n,yardline=65)
    elif s.phase in ('kickoff','safety_kick'):
        if a.kind!='kickoff' or a.receiver_yardline is None:raise ValueError('explicit kickoff landing position required')
        n=new_series(n,other(s.possession),a.receiver_yardline)
    elif a.kind in ('run','pass_complete','sack','kneel','pass_incomplete','spike'):
        if a.elapsed<=0:raise ValueError('scrimmage action must consume clock')
        if a.kind in ('pass_incomplete','spike') and a.yards:raise ValueError('incomplete/spike cannot gain yards')
        if a.kind in ('sack','kneel') and a.yards>0:raise ValueError('sack/kneel cannot gain yards')
        if not s.yardline-100<=a.yards<=s.yardline:raise ValueError('yards beyond field')
        remaining=s.yardline-a.yards
        if remaining==0:
            if a.kind not in ('run','pass_complete'):raise ValueError('invalid offensive touchdown')
            n=points(n,s.possession,6,'try');n=replace(n,yardline=0)
        elif remaining==100:
            n=points(n,other(s.possession),2,'safety_kick');n=replace(n,yardline=80)
        elif a.yards>=s.distance:n=new_series(n,s.possession,remaining)
        elif s.down==4:n=new_series(n,other(s.possession),100-remaining)
        else:n=replace(n,yardline=remaining,down=s.down+1,distance=s.distance-a.yards)
    elif a.kind in ('interception','fumble_lost','punt'):
        if type(a.spot) is not int or not 0<=a.spot<=100:raise ValueError('explicit dead-ball spot required')
        if a.spot==0:n=new_series(n,other(s.possession),80) # touchback; no return scoring support
        elif a.spot==100:raise ValueError('defensive return scores unsupported')
        else:n=new_series(n,other(s.possession),100-a.spot)
    elif a.kind=='field_goal':
        if type(a.made) is not bool or s.yardline>80:raise ValueError('invalid field goal')
        if a.made:n=replace(points(n,s.possession,3,'kickoff'),yardline=65)
        else:n=new_series(n,other(s.possession),min(80,100-s.yardline-7))
    else:raise ValueError(f'unsupported action: {a.kind}')
    # At regulation expiry, a touchdown still permits a supplied conversion. No OT fabricated.
    if n.period==4 and n.clock==0 and n.phase!='try':n=terminal(n)
    return Event(s,a,n)

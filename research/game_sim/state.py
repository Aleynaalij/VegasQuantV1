"""Deterministic regulation state kernel. No fitted probabilities or forecasting claims.

Caller supplies observed/sampled normalized actions. Includes regular-season OT,
accepted dead-ball penalties and returns; compound enforcement/clock policy are not inferred.
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
    ot_completed:tuple=()
    ot_both_possessions:bool=True
    home_timeouts:int=3
    away_timeouts:int=3

    def __post_init__(self):
        for name in ('period','clock','yardline','home_score','away_score'):
            if type(getattr(self,name)) is not int:raise ValueError(f'{name} must be integer')
        if self.period not in range(1,6) or not 0<=self.clock<=900:raise ValueError('invalid period/clock')
        if self.possession not in ('home','away') or self.second_half_receiver not in ('home','away'):raise ValueError('invalid team')
        if self.phase not in ('scrimmage','try','kickoff','safety_kick','final','overtime_required'):raise ValueError('invalid phase')
        if not 0<=self.yardline<=100 or min(self.home_score,self.away_score)<0:raise ValueError('invalid field/score')
        if self.phase=='scrimmage':
            if type(self.down) is not int or self.down not in range(1,5) or type(self.distance) is not int or not 1<=self.distance<=self.yardline or not 1<=self.yardline<=99:raise ValueError('invalid scrimmage situation')
        elif self.down is not None or self.distance is not None:raise ValueError('no down/distance outside scrimmage')
        if self.phase=='overtime_required' and (self.period!=4 or self.clock!=0):raise ValueError('invalid OT boundary')
        if self.phase=='final' and not ((self.period==4 and self.clock==0) or self.period==5):raise ValueError('terminal state before regulation ends')
        if self.period==5 and self.clock>600:raise ValueError('regular-season overtime exceeds ten minutes')
        if any(side not in ('home','away') for side in self.ot_completed) or len(set(self.ot_completed))!=len(self.ot_completed):raise ValueError('invalid completed OT possessions')
        if any(type(t) is not int or not 0<=t<=3 for t in (self.home_timeouts,self.away_timeouts)):raise ValueError('invalid timeouts')

@dataclass(frozen=True)
class Action:
    kind:str
    elapsed:int=0
    yards:int=0
    made:bool|None=None
    spot:int|None=None  # turnover/punt dead-ball spot, original offense yards to goal
    receiving_side:Side|None=None
    automatic_first:bool=False
    loss_of_down:bool=False
    timeout_side:Side|None=None
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
    phase='overtime_required' if s.period==4 and s.home_score==s.away_score else 'final'
    return replace(s,phase=phase,down=None,distance=None)


def transition(s:State,a:Action)->Event:
    if a.receiving_side not in (None,'home','away') or type(a.automatic_first) is not bool or type(a.loss_of_down) is not bool:raise ValueError('invalid action flags')
    if a.kind=='start_overtime':
        if s.phase!='overtime_required' or a.receiving_side not in ('home','away') or a.elapsed:raise ValueError('invalid overtime start')
        return Event(s,a,replace(s,period=5,clock=600,phase='kickoff',possession=other(a.receiving_side),yardline=65,down=None,distance=None,ot_completed=(),home_timeouts=2,away_timeouts=2))
    if s.phase in ('final','overtime_required'):raise ValueError('terminal state')
    if type(a.elapsed) is not int or not 0<=a.elapsed<=s.clock or type(a.yards) is not int:raise ValueError('invalid elapsed/yards')
    if a.kind=='end_period':
        if s.clock!=0 or a.elapsed or a.yards or s.phase=='try':raise ValueError('period not ready to advance')
        if s.period>=4:return Event(s,a,terminal(s))
        if s.period==2:
            # New half: no previous possession or pending first-half kickoff carries over.
            n=replace(s,period=3,clock=900,home_timeouts=3,away_timeouts=3,possession=other(s.second_half_receiver),phase='kickoff',down=None,distance=None,yardline=65)
        else:n=replace(s,period=s.period+1,clock=900)
        return Event(s,a,n)
    if s.clock==0 and s.phase!='try':raise ValueError('advance the period first')
    n=replace(s,clock=s.clock-a.elapsed)
    if a.kind=='timeout':
        if a.timeout_side not in ('home','away') or a.elapsed or a.yards:raise ValueError('invalid timeout')
        key=f'{a.timeout_side}_timeouts'
        if getattr(s,key)==0:raise ValueError('no timeouts remaining')
        return Event(s,a,replace(s,**{key:getattr(s,key)-1}))
    if s.phase=='try':
        if a.elapsed or a.kind not in ('extra_point','two_point') or type(a.made) is not bool:raise ValueError('invalid conversion')
        n=points(n,s.possession,(1 if a.kind=='extra_point' else 2) if a.made else 0,'kickoff')
        n=replace(n,yardline=65)
    elif s.phase in ('kickoff','safety_kick'):
        if a.kind=='kick_return_touchdown':
            receiver=a.receiving_side or other(s.possession)
            n=replace(points(n,receiver,6,'try'),possession=receiver,yardline=0)
        elif a.kind=='kickoff' and a.receiver_yardline is not None:
            n=new_series(n,a.receiving_side or other(s.possession),a.receiver_yardline)
        else:raise ValueError('explicit kickoff outcome required')
    elif a.kind=='kick_return_touchdown':
        raise ValueError('kick return touchdown requires kickoff phase')
    elif a.kind=='penalty':
        if a.automatic_first and a.loss_of_down:raise ValueError('conflicting penalty down rules')
        # Normalized accepted dead-ball/no-play enforcement only; live-ball combinations are separate inputs.
        y=a.yards
        if y>=s.yardline:y=max(0,s.yardline//2)
        if -y>=100-s.yardline:y=-((100-s.yardline)//2)
        spot=s.yardline-y
        if a.automatic_first:n=new_series(n,s.possession,spot)
        elif a.loss_of_down and s.down==4:n=new_series(n,other(s.possession),100-spot)
        else:n=replace(n,yardline=spot,down=s.down+int(a.loss_of_down),distance=max(1,s.distance-y))
    elif a.kind=='defensive_touchdown':
        n=replace(points(n,other(s.possession),6,'try'),possession=other(s.possession),yardline=0)
    elif a.kind in ('run','pass_complete','sack','kneel','pass_incomplete','spike','fumble_recovered'):
        if a.elapsed<=0:raise ValueError('scrimmage action must consume clock')
        if a.kind in ('pass_incomplete','spike') and a.yards:raise ValueError('incomplete/spike cannot gain yards')
        if a.kind in ('sack','kneel') and a.yards>0:raise ValueError('sack/kneel cannot gain yards')
        if not s.yardline-100<=a.yards<=s.yardline:raise ValueError('yards beyond field')
        remaining=s.yardline-a.yards
        if remaining==0:
            if a.kind not in ('run','pass_complete','fumble_recovered'):raise ValueError('invalid offensive touchdown')
            n=points(n,s.possession,6,'try');n=replace(n,yardline=0)
        elif remaining==100:
            n=points(n,other(s.possession),2,'safety_kick');n=replace(n,yardline=80)
        elif a.yards>=s.distance:n=new_series(n,s.possession,remaining)
        elif s.down==4:n=new_series(n,other(s.possession),100-remaining)
        else:n=replace(n,yardline=remaining,down=s.down+1,distance=s.distance-a.yards)
    elif a.kind in ('interception','fumble_lost','punt','punt_blocked','blocked_field_goal'):
        if type(a.spot) is not int or not 0<=a.spot<=100:raise ValueError('explicit dead-ball spot required')
        if a.spot==0:n=new_series(n,other(s.possession),80) # touchback; no return scoring support
        elif a.spot==100:raise ValueError('defensive return scores unsupported')
        else:n=new_series(n,a.receiving_side or other(s.possession),100-a.spot if (a.receiving_side or other(s.possession))!=s.possession else a.spot)
    elif a.kind=='field_goal':
        if type(a.made) is not bool or s.yardline>80:raise ValueError('invalid field goal')
        if a.made:n=replace(points(n,s.possession,3,'kickoff'),yardline=65)
        else:n=new_series(n,other(s.possession),min(80,100-s.yardline-7))
    else:raise ValueError(f'unsupported action: {a.kind}')
    # At regulation expiry, a touchdown still permits a supplied conversion. No OT fabricated.
    if n.period==5:
        completed=list(s.ot_completed)
        ends_drive=(n.possession!=s.possession and s.phase=='scrimmage') or (n.phase in ('try','kickoff','safety_kick') and s.phase=='scrimmage')
        finished_side=s.possession if ends_drive else n.possession if s.phase in ('kickoff','safety_kick') and n.phase=='try' else None
        if finished_side and finished_side not in completed:completed.append(finished_side)
        n=replace(n,ot_completed=tuple(completed))
        defensive_score=s.phase=='scrimmage' and ((n.home_score>s.home_score and s.possession=='away') or (n.away_score>s.away_score and s.possession=='home'))
        opening_td=n.phase=='try' and len(completed)==1 and not s.ot_both_possessions
        if defensive_score or opening_td or (len(completed)==2 and n.home_score!=n.away_score and (n.phase!='try' or getattr(n,f'{n.possession}_score')>getattr(n,f'{other(n.possession)}_score'))) or (n.clock==0 and n.phase!='try'):
            n=replace(n,phase='final',down=None,distance=None)
    if n.period==4 and n.clock==0 and n.phase!='try':n=terminal(n)
    return Event(s,a,n)

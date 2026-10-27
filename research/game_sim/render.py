"""Lossless research replay handoff. Does not impersonate a current matchup.

Requires renderer contract extension; deliberately NOT the demo-only 0.1 payload.
"""
import argparse,json
from pathlib import Path

def render(batch):
    if batch['schema_version']!='vq-game-batch/0.1' or batch['runs']['failed']:raise ValueError('complete research batch required')
    events=[]
    for e in batch['replay']['events']:
        b=e['before'];a=e['action'];n=e['after'];side=b['possession']
        def x(y):return 100-y if side=='home' else y
        start=x(b['yardline']);end=x(n['yardline'] if side==n['possession'] else 100-n['yardline'])
        if a['kind'] in ('run','pass_complete','sack','kneel','fumble_recovered'):end=x(b['yardline']-a['yards'])
        if a['kind'] in ('extra_point','two_point'):start=x(15 if a['kind']=='extra_point' else 2);end=x(0)
        if a['kind']=='field_goal':
            start=x(min(100,b['yardline']+7))
            if a['made']:end=x(0)
        if a['kind']=='defensive_touchdown':end=0 if side=='home' else 100
        if a['kind']=='kick_return_touchdown':end=0 if side=='home' else 100
        events.append(dict(sequence=e['sequence'],period_before=b['period'],period_after=n['period'],clock_before_s=b['clock'],clock_after_s=n['clock'],possession=side,down=b['down'],distance=b['distance'],yardline_100=b['yardline'],ball_start_x=start,ball_end_x=end,play_type=a['kind'],yards=a['yards'],participants=e.get('participants',[]),score_before=dict(home=b['home_score'],away=b['away_score']),score_after=dict(home=n['home_score'],away=n['away_score']),before=b,after=n))
    return dict(schema_version='vq-game-research-render/0.2',mode='research_baseline',is_current_matchup=False,title='2022 empirical league baseline — not a matchup forecast',generated_at=batch['generated_at'],source_manifest=batch['sources'],model_id=batch['model_id'],artifact_sha256=batch['artifact_sha256'],input_hash=batch['input_hash'],runs=batch['runs'],blockers=batch['blockers'],teams={'home':{'id':'baseline-home','abbr':'BASEA','name':'League baseline A'},'away':{'id':'baseline-away','abbr':'BASEB','name':'League baseline B'}},replay=batch['replay']['selection'],events=events,ensemble=batch['ensemble'],players=batch['players'],field_coordinates='Home-relative 0..100; no player XY tracking. Period transitions have explicit before/after clocks.')
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--batch',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();a.output.write_text(json.dumps(render(json.loads(a.batch.read_text())),indent=2)+'\n')

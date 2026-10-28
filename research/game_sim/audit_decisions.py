"""Read-only source-state sampling diagnostic; not independent validation."""
import argparse
from collections import Counter
import csv,gzip,hashlib,json
from pathlib import Path
from .model import Sampler,source_state


def audit(model_path, source_path, seed=1701):
    model_raw=Path(model_path).read_bytes()
    model=json.loads(gzip.decompress(model_raw) if model_raw[:2]==b'\x1f\x8b' else model_raw)
    source_raw=Path(source_path).read_bytes()
    source=gzip.decompress(source_raw) if source_raw[:2]==b'\x1f\x8b' else source_raw
    sampler=Sampler(model,seed);counts=Counter();excluded=Counter();kneels={name:Counter() for name in ('leading_q4_last120','trailing_q4_last120','trailing_1_3_q4_last10','leading_4_8_q4_last120','leading_9plus_q4_last120','tied_q4_last120')}
    for r in csv.DictReader(source.decode('utf-8-sig').splitlines()):
        if r['season_type']!='REG' or r['qtr'] not in ('1','2','3','4'):continue
        try:s=source_state(r)
        except (ValueError,KeyError,TypeError) as e:
            excluded[str(e)]+=1;continue
        if s.phase!='scrimmage':continue
        a=sampler.draw(s);counts['states']+=1
        counts['source_fg']+=r['play_type']=='field_goal'
        counts['sample_fg']+=a.kind in ('field_goal','blocked_field_goal')
        if s.period in (2,4) and s.clock<=30 and s.yardline<=35:
            counts['late_states']+=1
            counts['late_source_fg']+=r['play_type']=='field_goal'
            counts['late_sample_fg']+=a.kind in ('field_goal','blocked_field_goal')
        if s.period==4 and s.clock<=120:
            margin=getattr(s,s.possession+'_score')-getattr(s,('away' if s.possession=='home' else 'home')+'_score')
            groups=[]
            if margin>0:groups.append('leading_q4_last120')
            if margin<0:groups.append('trailing_q4_last120')
            if 4<=margin<=8:groups.append('leading_4_8_q4_last120')
            if margin>=9:groups.append('leading_9plus_q4_last120')
            if margin==0:groups.append('tied_q4_last120')
            if -3<=margin<0 and s.clock<=10:groups.append('trailing_1_3_q4_last10')
            for group in groups:
                item=kneels[group];item['states']+=1
                item['source_kneels']+=r['play_type']=='qb_kneel'
                item['sample_kneels']+=a.kind=='kneel'
        counts['sample_punt_before_fourth']+=a.kind in ('punt','punt_blocked') and s.down!=4
        # Diagnostic only: long kicks are allowed; no hard distance exclusion.
        counts['sample_fg_beyond_62_yards']+=a.kind in ('field_goal','blocked_field_goal') and s.yardline>45
    return dict(model_id=model['model_id'],seed=seed,counts=dict(counts),excluded=dict(excluded),
        kneel_diagnostics={name:dict(item,source_share=item['source_kneels']/item['states'] if item['states'] else None,sampled_share=item['sample_kneels']/item['states'] if item['states'] else None) for name,item in kneels.items()},
        fallbacks=dict(sampler.fallbacks),model_file_sha256=hashlib.sha256(model_raw).hexdigest(),
        source_sha256=hashlib.sha256(source_raw).hexdigest(),
        scope='One sampled action at each valid historical state; source-state fit diagnostic, not held-out accuracy or executable recommendations')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--model',required=True);p.add_argument('--source',required=True);p.add_argument('--seed',type=int,default=1701)
    a=p.parse_args();print(json.dumps(audit(a.model,a.source,a.seed),indent=2))

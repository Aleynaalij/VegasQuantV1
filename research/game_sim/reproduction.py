"""Frozen in-sample reproduction diagnostics. Never a model approval."""
import argparse,csv,gzip,hashlib,io,json,math,statistics
from collections import defaultdict
from pathlib import Path
from .model import Sampler,fit
from .batch import canonical,game
from .evaluate import scores


def check(path,n=10000,seed=1701):
    finals,digest=scores(path)
    data=Path(path).read_bytes()
    source={g:dict(total=sum(pair),touchdowns=0,field_goals=0,punts=0) for g,pair in finals.items()}
    for r in csv.DictReader(io.StringIO(gzip.decompress(data).decode('utf-8-sig'))):
        if r['game_id'] not in source:continue
        row=source[r['game_id']]
        row['touchdowns']+=int(r.get('touchdown')=='1')
        row['field_goals']+=int(r.get('field_goal_result')=='made')
        row['punts']+=int(r.get('play_type')=='punt')
    model=fit([path]);tables=Sampler(model,seed).tables
    sim=[];failures=[]
    for i in range(n):
        try:
            r=game(model,seed+i,both_possessions=False,prepared_tables=tables)
            sim.append(dict(total=r['home']+r['away'],touchdowns=r['scoring'].get('touchdowns',0),field_goals=r['scoring'].get('field_goals',0),punts=r['kinds'].get('punt',0)+r['kinds'].get('punt_blocked',0)))
        except ValueError as e:failures.append(str(e))
    metrics={}
    for key in ('total','touchdowns','field_goals','punts'):
        actual=[r[key] for r in source.values()];pred=[r[key] for r in sim]
        tolerance=3*math.sqrt(statistics.variance(actual)/len(actual)+statistics.variance(pred)/len(pred))
        difference=statistics.mean(pred)-statistics.mean(actual)
        metrics[key]=dict(source_mean=statistics.mean(actual),simulated_mean=statistics.mean(pred),difference=difference,tolerance_3se=tolerance,passed=abs(difference)<=tolerance)
    return model,dict(protocol='baseline-correction-2026-10-27',source_sha256=digest,model_id=model['model_id'],model_sha256=hashlib.sha256(canonical(model)).hexdigest(),source_games=len(source),requested=n,completed=len(sim),failures=failures,seed=seed,metrics=metrics,passed=not failures and all(m['passed'] for m in metrics.values()),scope='IN_SAMPLE_ONLY; not predictive calibration or approval')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--output',required=True);a=p.parse_args()
    model,result=check(a.source);Path(a.output).write_text(json.dumps(result,indent=2)+'\n');Path(a.output+'.model.gz').write_bytes(gzip.compress(canonical(model),mtime=0));print(json.dumps(result),flush=True)

"""Retrospective calibration diagnostics; never promotes or publishes a model."""
import argparse,csv,gzip,hashlib,io,json,random
from pathlib import Path
from .batch import distribution

def scores(path):
    b=Path(path).read_bytes();rows=csv.DictReader(io.StringIO((gzip.decompress(b) if b[:2]==b'\x1f\x8b' else b).decode('utf-8-sig')));games={};last_rows={}
    for r in rows:
        if r['season_type']!='REG':continue
        home=float(r['home_score']);away=float(r['away_score'])
        if not(home.is_integer() and away.is_integer() and home>=0 and away>=0):raise ValueError('invalid final score')
        last_rows[r['game_id']]=r
        pair=(int(home),int(away));old=games.setdefault(r['game_id'],pair)
        if old!=pair:raise ValueError('conflicting final source score')
    if any(r.get('desc','').strip()!='END GAME' for r in last_rows.values()):raise ValueError('unfinished source game remains pending')
    return games,hashlib.sha256(b).hexdigest()

def crps(d,y):
    n=d['n'];bins=d['bins']
    first=sum(abs(b['lo']-y)*b['count'] for b in bins)/n
    pair=sum(abs(a['lo']-b['lo'])*a['count']*b['count'] for a in bins for b in bins)/(n*n)
    return first-.5*pair

def evaluate(batch,training_path,calibration_path,bootstrap=1000):
    train,th=scores(training_path);cal,ch=scores(calibration_path)
    if set(train)&set(cal):raise ValueError('training/evaluation game overlap')
    if batch['runs']['failed']:raise ValueError('incomplete batch cannot be scored as complete')
    baselines={k:distribution([h-a if k=='margin' else h+a for h,a in train.values()]) for k in ('margin','total')}
    rows=[];win_n=0;brier_sum=0
    winp=batch['ensemble']['home_win']['count']/batch['runs']['actual']
    for game_id,(h,a) in sorted(cal.items()):
        row=dict(game_id=game_id)
        for market,y in (('margin',h-a),('total',h+a)):
            d=batch['ensemble'][market];model=crps(d,y);base=crps(baselines[market],y)
            row[market]=dict(crps=model,baseline_crps=base,difference=model-base,inside80=d['quantiles']['p10']<=y<=d['quantiles']['p90'],width80=d['quantiles']['p90']-d['quantiles']['p10'])
        if h!=a:win_n+=1;brier_sum+=(winp-int(h>a))**2
        rows.append(row)
    rng=random.Random(1701);summary={}
    for market in ('margin','total'):
        vals=[r[market]['difference'] for r in rows];boots=sorted(sum(rng.choices(vals,k=len(vals)))/len(vals) for _ in range(bootstrap))
        summary[market]=dict(n_games=len(rows),mean_crps=sum(r[market]['crps'] for r in rows)/len(rows),baseline_mean_crps=sum(r[market]['baseline_crps'] for r in rows)/len(rows),difference=sum(vals)/len(vals),game_bootstrap95=[boots[int(.025*(bootstrap-1))],boots[int(.975*(bootstrap-1))]],coverage80=sum(r[market]['inside80'] for r in rows)/len(rows),width80=rows[0][market]['width80'])
    return dict(protocol_id=batch['protocol_id'],model_artifact_sha256=batch['artifact_sha256'],evaluation_kind='2023 retrospective calibration diagnostics; not untouched holdout or prospective evidence',training_sha256=th,calibration_sha256=ch,training_games=len(train),calibration_games=len(cal),summary=summary,home_win_brier=dict(n=win_n,ties_excluded=len(cal)-win_n,brier=brier_sum/win_n if win_n else None),market_benchmark='Not scored: no independently verified contemporaneous price/distribution mapping supplied',rows=rows,status='SHADOW_ONLY',adopted=False)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--batch',type=Path,required=True);p.add_argument('--training',type=Path,required=True);p.add_argument('--calibration',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();r=evaluate(json.loads(a.batch.read_text()),a.training,a.calibration);a.output.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r['summary']))

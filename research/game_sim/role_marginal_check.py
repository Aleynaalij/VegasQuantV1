"""Source check for the normal@all~role cells (ROLE_MARGINAL_PROTOCOL.md). Descriptive only.

Usage: PYTHONPATH=. python3 research/game_sim/role_marginal_check.py <play_by_play_2022.csv.gz>
"""
import csv,gzip,io,json,sys
from collections import Counter
import research.game_sim.timeout_cells as tc
cap={}
orig=tc.residual_cells
def spy(ops,family,full_keys=None):
    cap[family]=ops;return orig(ops,family,full_keys)
tc.residual_cells=spy
rows=list(csv.DictReader(io.StringIO(gzip.decompress(open(sys.argv[1],'rb').read()).decode('utf-8-sig'))))
running,stopped,cov=tc.tabulate_rows(rows)
c=Counter()
for path,outcome,meta in cap['stopped']:
    if meta and meta[0].startswith('normal@q'):
        c[(meta[1],outcome)]+=1
out={f'{e}|{o}':n for (e,o),n in sorted(c.items())}
both_n=sum(n for (e,o),n in c.items() if e=='both')
print(json.dumps(dict(normal_band_stopped_opportunities_by_eligibility_and_outcome=out,
  both_eligible_n=both_n,both_eligible_offense_calls=c[('both','offense')],both_eligible_defense_calls=c[('both','defense')],
  fitted_role_both=dict(stopped['normal@all~role|both']),fitted_role_offense=dict(stopped['normal@all~role|offense']),fitted_role_defense=dict(stopped['normal@all~role|defense'])),indent=1))

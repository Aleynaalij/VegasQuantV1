"""Read-back of the TEAM_LAYER_PROTOCOL section-0 pin against the package (provenance only).

Usage: PYTHONPATH=. python3 research/game_sim/pin_readback.py <pin_commit> <play_by_play_2022.csv.gz>
"""
import gzip,hashlib,json,re,subprocess,sys
from research.game_sim.batch import canonical
pin,src=sys.argv[1],sys.argv[2]
sh=lambda *a:subprocess.run(a,capture_output=True,text=True,check=True).stdout
proto=sh('git','show',f'{pin}:research/game_sim/TEAM_LAYER_PROTOCOL.md')
sec=proto.split('### Pinned base')[1].split('\n## 1.')[0]
A='research/game_sim/artifacts/v0.2.24/'
m=json.loads(sh('git','show',f'{pin}:{A}manifest.json'))
out={}
pinned_impl=dict(re.findall(r'^\| `([^`]+)` \| `([0-9a-f]{64})` \|$',sec,re.M))
out['implementation_map_matches_manifest']=pinned_impl==m['implementation_sha256']
out['implementation_entries']=len(pinned_impl)
rt=json.loads(gzip.decompress(open(A+'runtime-source.json.gz','rb').read()))['sources']
out['implementation_map_matches_archived_runtime']=all(hashlib.sha256(rt[k].encode()).hexdigest()==v for k,v in pinned_impl.items())
out['model_sha256_pinned']=re.search(r'`model_sha256`:\*\* `([0-9a-f]{64})`',sec).group(1)
out['model_sha256_manifest']=m['model_sha256']
raw=open(A+'model.json.gz','rb').read()
out['model_file_canonical_sha256']=hashlib.sha256(canonical(json.loads(gzip.decompress(raw)))).hexdigest()
out['model_matches']=out['model_sha256_pinned']==m['model_sha256']==out['model_file_canonical_sha256']
out['source_sha256_pinned']=re.search(r'SHA256 `([0-9a-f]{64})`',sec).group(1)
out['source_sha256_manifest']=m['sources'][0]['sha256']
out['source_file_sha256']=hashlib.sha256(open(src,'rb').read()).hexdigest()
out['source_matches']=out['source_sha256_pinned']==out['source_sha256_manifest']==out['source_file_sha256']
files_ok={}
for f,h in m['files'].items():
    files_ok[f]=hashlib.sha256(open(A+f,'rb').read()).hexdigest()==h['sha256']
out['package_files_match_manifest']=files_ok
out['package_unchanged_since_df43331']=sh('git','diff','--stat','df433313d27ee685e3dc5ed2e39e1486f13f07af',pin,'--',A)==''
out['v0_2_23_packages_unchanged_since_67ce290']=sh('git','diff','--stat','67ce290c21b35467bb28a79ccd9b43b4c5128683',pin,'--','research/game_sim/artifacts/v0.2.23','research/game_sim/artifacts/v0.2.23-accounting')==''
for name,c in (('build','ad175550a3dc805dc335d163d731113a17135b38'),('package','df433313d27ee685e3dc5ed2e39e1486f13f07af'),('reviewed_head','05a0c79a8a2af4d183b3686ad2c77e9c6f997c0e')):
    out[f'{name}_commit_in_pin_ancestry']=subprocess.run(['git','merge-base','--is-ancestor',c,pin]).returncode==0
    out[f'{name}_commit_listed']=c in sec
out['pin_commit_changes_only']=sh('git','diff','--name-only',f'{pin}~1',pin).split()
out['flags']={k:m[k] for k in ('approval','current_matchup_supported','team_player_coupling_enabled')}
out['all_match']=all(v for k,v in out.items() if isinstance(v,bool)) and all(files_ok.values())
out.update(pin_commit=pin,scope='PROVENANCE_READBACK_ONLY')
print(json.dumps(out,indent=1))

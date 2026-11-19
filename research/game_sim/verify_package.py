"""Verify a complete immutable research package, not a model approval mechanism."""
import argparse,gzip,hashlib,json
from pathlib import Path
from .batch import canonical
from .integrated import validate_trace

def verify(folder,source=None):
    root=Path(folder);m=json.loads((root/'manifest.json').read_text());payload={}
    for name,expected in m['files'].items():
        raw=(root/name).read_bytes()
        if hashlib.sha256(raw).hexdigest()!=expected['sha256']:raise ValueError('artifact hash mismatch: '+name)
        body=gzip.decompress(raw)
        if hashlib.sha256(body).hexdigest()!=expected['canonical_sha256']:raise ValueError('canonical artifact hash mismatch: '+name)
        payload[name]=json.loads(body)
    batch=payload['batch.json.gz'];model=payload['model.json.gz'];gate=payload['gate.json.gz'];cal=payload['calibration.json.gz']
    if hashlib.sha256(canonical(model)).hexdigest()!=m['model_sha256'] or batch['artifact_sha256']!=m['model_sha256']:raise ValueError('model manifest mismatch')
    source_hash=gate['source_sha256']
    if source_hash!=model['sources'][0]['sha256']:raise ValueError('declared training source mismatch')
    if source is not None and hashlib.sha256(Path(source).read_bytes()).hexdigest()!=source_hash:raise ValueError('training source mismatch')
    replay=validate_trace(batch['replay']['events'])
    runtime=payload.get('runtime-source.json.gz',{}).get('sources',{})
    for name,h in m['implementation_sha256'].items():
        raw=runtime.get(name)
        if raw is None or hashlib.sha256(raw.encode()).hexdigest()!=h:raise ValueError('archived implementation mismatch: '+name)
    failures=[k for k,v in {**gate['metrics'],**gate['diagnostics']}.items() if not v['passed']]
    if batch['runs']['failed']:failures.append('incomplete_ensemble')
    if gate['unsupported_censoring_samples']:failures.append('unsupported_gain_model')
    base_passed=not failures
    blockers=['No validated team/player outcome coupling','No untouched later-season end-to-end validation','No sourced current roster/role scenario supplied','No model approval; member publication remains disabled']
    if failures:blockers.append('Failed base diagnostics: '+','.join(failures))
    if cal.get('summary') and any(v['difference']>=0 for v in cal['summary'].values()):blockers.append('2023 inspected calibration does not establish superiority over historical baseline')
    return dict(model_id=m['model_id'],integrity_verified=True,files_verified=len(payload),implementation_hashes=len(m['implementation_sha256']),source_hash=source_hash,source_hash_verified=source is not None,runs=batch['runs'],replay=replay,base_checks_passed=base_passed,failed_checks=failures,diagnostics=gate['diagnostics'],support=batch['coverage']['censoring'],calibration=cal.get('summary'),release_ready=False,blockers=blockers,scope='Research integrity and adequacy summary only; never approves a model or changes platform state')
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--folder',required=True);p.add_argument('--source');a=p.parse_args();print(json.dumps(verify(a.folder,a.source),indent=2))

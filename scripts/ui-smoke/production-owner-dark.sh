#!/usr/bin/env bash
set -euo pipefail
# Build first with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321.
# This is a local, signed-out dark-render check; no provider credentials.
work=$(mktemp -d)
server=
cleanup() {
  if [[ -n "$server" ]]; then kill "$server" 2>/dev/null || true; wait "$server" 2>/dev/null || true; fi
  rm -rf -- "$work"
}
trap cleanup EXIT
VERCEL_ENV=production HOME2_PRODUCTION=off LIVE_SCORES_DISABLED=1 \
  node node_modules/next/dist/bin/next start --hostname 127.0.0.1 -p 3218 >"$work/server.log" 2>&1 &
server=$!
python - <<'PY'
import json,time,urllib.request,urllib.error
base='http://127.0.0.1:3218'
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args):return None
op=urllib.request.build_opener(NoRedirect())
for i in range(40):
    try:
        urllib.request.urlopen(base+'/about',timeout=1).close();break
    except Exception:
        if i==39:raise
        time.sleep(.25)
for path in ['/?HOME2_PRODUCTION=owners','/community?owner=true']:
    r=op.open(urllib.request.Request(base+path,headers={'Cookie':'home2=owners; owner=true'}),timeout=20)
    body=r.read().decode()
    # The existing age boundary hides page children during server rendering;
    # verify the hydrated classic components in the browser below.
    assert r.status==200 and 'id="home2-title"' not in body
    print('PASS signed-out route:',path)
try:
    op.open(urllib.request.Request(base+'/api/consumer/owner-preview?enabled=true',data=b'{"enabled":true}',method='POST',headers={'Origin':base,'Cookie':'home2=owners'}),timeout=10)
    raise AssertionError('dark endpoint enabled')
except urllib.error.HTTPError as e:
    assert e.code==404 and json.loads(e.read())=={'enabled':False}
    assert e.headers.get('Cache-Control')=='private, no-store'
    print('PASS dark endpoint: 404/private/no-store')
for path,destination in [('/?game=fixture&x=1','/nfl?game=fixture&x=1#home-games'),('/community?saved=fixture','/parlays?saved=fixture#my-parlay-fixture')]:
    try:
        r=op.open(base+path,timeout=20)
        # Next can stream Community's server redirect through the age boundary.
        assert destination in r.read().decode(),'legacy streamed redirect missing'
        print('PASS legacy streamed redirect:',path)
    except urllib.error.HTTPError as e:
        assert e.code in (303,307,308)
        assert e.headers['Location'].endswith(destination),e.headers['Location']
        print('PASS legacy redirect:',path)
PY
node scripts/ui-smoke/production-owner-dark.mjs

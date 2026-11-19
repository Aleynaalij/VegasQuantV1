#!/usr/bin/env bash
set -euo pipefail
work=$(mktemp -d)
server=
backend=
cleanup() {
 if [[ -n "$server" ]]; then kill "$server" 2>/dev/null || true; fi
 if [[ -n "$backend" ]]; then kill "$backend" 2>/dev/null || true; fi
 rm -rf -- "$work"
}
trap cleanup EXIT
node scripts/ui-smoke/atlas-consumer-feature-backend.mjs >"$work/backend.log" 2>&1 &
backend=$!
for _ in {1..60}; do
 if grep -q SYNTHETIC_FEATURE_BACKEND_READY "$work/backend.log"; then break; fi
 if ! kill -0 "$backend" 2>/dev/null; then cat "$work/backend.log";exit 1;fi
 sleep 1
done
grep -q SYNTHETIC_FEATURE_BACKEND_READY "$work/backend.log"
export NODE_OPTIONS="--import=$PWD/scripts/ui-smoke/atlas-consumer-feature-fetch.mjs"
export NEXT_TELEMETRY_DISABLED=1
export NEXT_PUBLIC_SUPABASE_URL=https://caynldluziwrzmvuslzg.supabase.co
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_fixture
export VERCEL=1 VERCEL_ENV=preview VERCEL_URL=atlas-fixture.vercel.app
export VERCEL_TARGET_ENV=atlas-private-access VQ_PRIVATE_ACCESS_PROJECT_REF=caynldluziwrzmvuslzg
export STAGING_DISCOVERY_ENABLED=true STAGING_DISCOVERY_FIXTURES=false CONSUMER_UI_ENABLED=true
export VQ_STAGE_RESEARCH_CONTRACT=vq-stage-session-v1 VQ_STAGE_FEATURE_CONTRACT=vq-stage-features-v1 VQ_STAGE_BUILD_PROFILE=combined
export STAGING_DISCOVERY_PROJECT="$VQ_PRIVATE_ACCESS_PROJECT_REF" STAGING_DISCOVERY_LINKED_PUBLICATIONS=false
export VQ_PUBLICATION_PREVIEW_LIVE_ENABLED=false BILLING_ENABLED=false AGE_VERIFICATION_ENABLED=false LIVE_SCORES_DISABLED=1
npm run build >"$work/build.log" 2>&1 || { cat "$work/build.log";exit 1; }
node node_modules/next/dist/bin/next start --hostname 127.0.0.1 -p 3217 >"$work/server.log" 2>&1 &
server=$!
for _ in {1..40}; do
 if curl -s -o /dev/null http://127.0.0.1:3217/; then break; fi
 if ! kill -0 "$server" 2>/dev/null;then cat "$work/server.log";exit 1;fi
 sleep 1
done
node scripts/ui-smoke/atlas-consumer-features.mjs

#!/usr/bin/env bash
set -euo pipefail

# Run from a clean integration worktree. This probe is never committed or deployed.
probe=src/app/api/atlas-combined-build-probe
test ! -e "$probe"
work=$(mktemp -d)
server=
cleanup() {
  if [[ -n "$server" ]]; then kill "$server" 2>/dev/null || true; fi
  rm -rf -- "$probe" "$work"
}
trap cleanup EXIT
mkdir "$probe"
printf '%s\n' 'export function GET() { return new Response(null, { status: 204 }); }' >"$probe/route.combined.ts"

cp scripts/ui-smoke/atlas-base-fetch.mjs "$work/fetch.mjs"

export NODE_OPTIONS="--import=$work/fetch.mjs"
export NEXT_TELEMETRY_DISABLED=1
export NEXT_PUBLIC_SUPABASE_URL=https://caynldluziwrzmvuslzg.supabase.co
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_fixture
export VERCEL=1 VERCEL_ENV=preview VERCEL_URL=atlas-fixture.vercel.app
export VERCEL_TARGET_ENV=atlas-private-access VQ_PRIVATE_ACCESS_PROJECT_REF=caynldluziwrzmvuslzg
export STAGING_DISCOVERY_ENABLED=true STAGING_DISCOVERY_FIXTURES=true CONSUMER_UI_ENABLED=true
export STAGING_DISCOVERY_PROJECT="$VQ_PRIVATE_ACCESS_PROJECT_REF" STAGING_DISCOVERY_LINKED_PUBLICATIONS=false
export VQ_PUBLICATION_PREVIEW_LIVE_ENABLED=false BILLING_ENABLED=false AGE_VERIFICATION_ENABLED=false LIVE_SCORES_DISABLED=1

verify_mode() {
  npm run build >"$work/build.log" 2>&1 || { cat "$work/build.log"; return 1; }
  node --input-type=module - "$1" <<'EOF'
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const mode = process.argv[2];
const paths = Object.keys(JSON.parse(readFileSync(".next/server/app-paths-manifest.json", "utf8")));
const readers = ["/staging/discovery/read/dealer/route", "/staging/discovery/read/research/route", "/staging/discovery/session/route", "/staging/discovery/data/route", "/staging/discovery/read/matchup-sheet/[id]/route"];
for (const path of readers) assert.equal(paths.includes(path), mode === "combined", path);
const gateRoutes = ["/staging/private-access/route", "/staging/private-access/records/route", "/api/staging/private-access/route"];
const normalRoutes = ["/nba/props/page", "/page", "/community/page", "/research/page", "/staging/discovery/page", "/staging/discovery/rooms/[sport]/[id]/page", "/api/notifications/dispatch/route", "/api/stripe/webhook/route", "/api/nba/threes-card/[day]/route"];
for (const path of gateRoutes) assert.equal(paths.includes(path), mode === "gate" || mode === "combined", path);
for (const path of normalRoutes) assert.equal(paths.includes(path), mode !== "gate", path);
assert.equal(paths.includes("/api/atlas-combined-build-probe/route"), mode === "combined");
console.log(`${mode}: route manifest verified`);
EOF
}

serve() {
  node node_modules/next/dist/bin/next start --hostname 127.0.0.1 -p 3217 >"$work/server.log" 2>&1 &
  server=$!
  for _ in {1..30}; do
    if curl -s -o /dev/null http://127.0.0.1:3217/; then return; fi
    if ! kill -0 "$server" 2>/dev/null; then break; fi
    sleep 1
  done
  cat "$work/server.log"
  return 1
}

stop() {
  kill "$server"
  wait "$server" || true
  server=
}

expect() {
  local actual expected=$1 path=$2
  shift 2
  actual=$(curl -sS --path-as-is -o /dev/null -w '%{http_code}' "$@" "http://127.0.0.1:3217$path")
  if [[ "$actual" != "$expected" ]]; then
    printf '%s expected %s, got %s\n' "$path" "$expected" "$actual" >&2
    return 1
  fi
  printf '%s %s\n' "$actual" "$path"
}

export VQ_STAGE_BUILD_PROFILE=combined
if env -u NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY npm run build >"$work/denial.log" 2>&1; then
  printf 'Combined build unexpectedly accepted a missing key\n' >&2
  exit 1
fi
grep -Fq 'Invalid or incomplete isolated staging build configuration' "$work/denial.log" || {
  cat "$work/denial.log"
  exit 1
}
verify_mode combined
serve
owner='__Host-vq-private-access=fixture.owner.token'
expect 200 /staging/private-access
expect 401 /staging/discovery/session
expect 200 /staging/discovery/session --cookie "__Host-vq-private-access=fixture.owner.token"
expect 403 /staging/discovery/session --cookie "__Host-vq-private-access=fixture.member.token"
expect 401 /api/staging/private-access
expect 401 /staging/discovery/read/dealer
expect 403 /staging/discovery/read/dealer --cookie "__Host-vq-private-access=fixture.member.token"
expect 200 /staging/discovery/read/dealer --cookie "__Host-vq-private-access=fixture.owner.token"
expect 200 /staging/discovery/read/research --cookie "__Host-vq-private-access=fixture.owner.token"
expect 400 "/staging/discovery/read/research?url=https://vegasquant.app" --cookie "__Host-vq-private-access=fixture.owner.token"
expect 303 /community
expect 403 /community --cookie '__Host-vq-private-access=fixture.member.token'
for path in / /community /research /nba/props /staging/discovery /staging/discovery/rooms/nba/fixture-nba /membership /notifications /slots /vegas-fear /privacy /terms /faq /responsible-play /about /methodology /support /support/report /account/recovery /account/verify-age; do
  expect 200 "$path" --cookie "$owner"
done
expect 308 '/?game=legacy' --cookie "$owner"
for path in /api/checkout /api/stripe/webhook /api/notifications/dispatch /api/nba/threes-card/2026-11-17; do
  expect 404 "$path" --cookie "$owner"
done
expect 405 /community --cookie "$owner" -X POST
stop
if [[ "${ATLAS_BROWSER_ACCEPTANCE:-0}" == "1" ]]; then
  export STAGING_DISCOVERY_FIXTURES=false VQ_STAGE_RESEARCH_CONTRACT=vq-stage-session-v1
  serve
  node scripts/ui-smoke/atlas-connected-home.mjs
  stop
  export STAGING_DISCOVERY_FIXTURES=true
  unset VQ_STAGE_RESEARCH_CONTRACT
fi

export STAGING_DISCOVERY_ENABLED=false
serve
expect 404 /staging/discovery --cookie "$owner"
expect 200 /community --cookie "$owner"
expect 200 /research --cookie "$owner"
expect 308 '/?game=legacy' --cookie "$owner"
stop

VQ_STAGE_BUILD_PROFILE=gate verify_mode gate
VERCEL_ENV=production verify_mode standard
(
  unset VERCEL VERCEL_TARGET_ENV VQ_PRIVATE_ACCESS_PROJECT_REF
  export CI=true VQ_STAGE_BUILD_PROFILE=consumer-fixture STAGING_DISCOVERY_PROJECT=synthetic
  export NEXT_PUBLIC_SUPABASE_URL=https://synthetic.supabase.co
  export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=synthetic-public-fixture
  verify_mode consumer-fixture
)

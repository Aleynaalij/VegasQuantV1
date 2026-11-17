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

cat >"$work/fetch.mjs" <<'EOF'
const transport = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.hostname === "127.0.0.1") return transport(input, options);
  if (url.origin === process.env.NEXT_PUBLIC_SUPABASE_URL &&
      url.pathname === "/rest/v1/rpc/vq_private_access_stage_authorized") {
    const authorization = new Headers(options?.headers).get("authorization");
    return Promise.resolve(Response.json(authorization === "Bearer fixture.owner.token"));
  }
  return Promise.reject(new Error("External fetch disabled in the staging acceptance test"));
};
EOF

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
const gateRoutes = ["/staging/private-access/route", "/staging/private-access/records/route", "/api/staging/private-access/route"];
const normalRoutes = ["/page", "/community/page", "/research/page", "/staging/discovery/page", "/staging/discovery/rooms/[sport]/[id]/page", "/api/notifications/dispatch/route", "/api/stripe/webhook/route", "/api/nba/threes-card/[day]/route"];
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
rg -q 'Invalid or incomplete isolated staging build configuration' "$work/denial.log"
verify_mode combined
serve
owner='__Host-vq-private-access=fixture.owner.token'
expect 200 /staging/private-access
expect 401 /api/staging/private-access
expect 303 /community
expect 403 /community --cookie '__Host-vq-private-access=fixture.member.token'
for path in / /community /research /staging/discovery /staging/discovery/rooms/nba/fixture-nba; do
  expect 200 "$path" --cookie "$owner"
done
expect 308 '/?game=legacy' --cookie "$owner"
for path in /api/checkout /api/stripe/webhook /api/notifications/dispatch /api/nba/threes-card/2026-11-17; do
  expect 404 "$path" --cookie "$owner"
done
expect 405 /community --cookie "$owner" -X POST
stop

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

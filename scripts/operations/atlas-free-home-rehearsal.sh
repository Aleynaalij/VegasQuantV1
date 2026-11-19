#!/usr/bin/env bash
set -euo pipefail
bin=${ATLAS_REPLAY_PG_BIN:?Set the native PostgreSQL 17 binary directory}
driver=${ATLAS_REPLAY_PG_MODULE:?Set the temporary pg driver path}
output=${1:?Pass the local evidence output directory}
cluster=$(mktemp -d /tmp/atlas-prepare-pg.XXXXXX)
server=
cleanup() {
 if [[ -n "$server" ]]; then "$bin/pg_ctl" -D "$cluster" stop -m fast -w >/dev/null 2>&1 || kill "$server" 2>/dev/null || true; fi
 rm -rf -- "$cluster"
}
trap cleanup EXIT
"$bin/initdb" -D "$cluster" -A trust -U postgres --no-locale --encoding=UTF8 >/dev/null
"$bin/postgres" -D "$cluster" -h 127.0.0.1 -p 55439 -k '' -c timezone=UTC -c max_connections=10 >"$cluster/server.log" 2>&1 &
server=$!
ATLAS_PREPARATION_CLUSTER="$cluster" node scripts/operations/atlas-free-home-rehearsal.mjs --out "$output"

#!/usr/bin/env bash
set -euo pipefail
bin=${ATLAS_REPLAY_PG_BIN:?Set the native PostgreSQL 17 binary directory}
driver=${ATLAS_REPLAY_PG_MODULE:?Set the temporary pg driver path}
output=${1:?Pass the local evidence output directory}
cluster=$(mktemp -d /tmp/atlas-pg-run.XXXXXX)
server=
cleanup() {
 if [[ -n "$server" ]]; then "$bin/pg_ctl" -D "$cluster" stop -m fast -w >/dev/null 2>&1 || kill "$server" 2>/dev/null || true; fi
 rm -rf -- "$cluster"
}
trap cleanup EXIT
"$bin/initdb" -D "$cluster" -A trust -U postgres --no-locale --encoding=UTF8 >/dev/null
"$bin/postgres" -D "$cluster" -h 127.0.0.1 -p 55439 -k '' -c timezone=UTC -c max_connections=10 >"$cluster/server.log" 2>&1 &
server=$!
node --input-type=module - "$driver" "$cluster" <<'JS'
import {pathToFileURL} from 'node:url';
const {default:pg}=await import(pathToFileURL(process.argv[2]));
let client,connected=false;
for(let i=0;i<30;i++){
 client=new pg.Client({host:'127.0.0.1',port:55439,user:'postgres',database:'postgres'});
 try{await client.connect();connected=true;break;}catch{await client.end().catch(()=>{});await new Promise(r=>setTimeout(r,100));}
}
if(!connected)throw Error('Local PostgreSQL did not start');
const actual=(await client.query("select current_setting('data_directory') dir")).rows[0].dir;
if(actual!==process.argv[3])throw Error('Connected server is not the cluster created by this harness');
await client.query('create database atlas_schema_replay');await client.end();
JS
node scripts/operations/atlas-schema-local-replay.mjs --out "$output"

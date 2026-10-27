// Simulator pregame capture journal (#132): service-only, before-kickoff, append-only, admin-read.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema private; grant usage on schema private to anon, authenticated, service_role;
create function private.immutable() returns trigger language plpgsql as $$ begin raise exception 'immutable'; end $$;
create function private.is_admin() returns boolean language sql as $$ select current_setting('app.admin', true) = 'yes' $$;
create table public.games(id uuid primary key, away_team text, home_team text, kickoff timestamptz, kickoff_tbd boolean default false);
insert into public.games values
 ('00000000-0000-0000-0000-000000000001','Seattle Seahawks','Denver Broncos', now() + interval '2 days', false),
 ('00000000-0000-0000-0000-000000000002','Buffalo Bills','Los Angeles Rams', now() - interval '1 hour', false),
 ('00000000-0000-0000-0000-000000000003','Dallas Cowboys','New York Giants', now() + interval '3 days', true);
`);
await db.exec(
  readFileSync(
    "supabase/migrations/20261027165100_sim_pregame_runs.sql",
    "utf8",
  ),
);
const hex = (c) => c.repeat(64);
await db.query(
  `insert into private.sim_model_registrations(model_id, artifact_sha256, protocol_id) values ('sim-baseline-0', $1, 'sim-protocol-draft')`,
  [hex("a")],
);

const dist = (n, center) => ({
  n,
  mean: center,
  quantiles: {
    p5: center - 10,
    p25: center - 4,
    p50: center,
    p75: center + 4,
    p95: center + 10,
  },
  bins: [
    { lo: center - 20, hi: center, count: n / 2 },
    { lo: center, hi: center + 20, count: n / 2 },
  ],
});
const now = Date.now();
const capture = (over = {}) => ({
  schema_version: "vq-sim-capture/0.1",
  run_key: "sea-den-2026w9-baseline",
  game_id: "00000000-0000-0000-0000-000000000001",
  model_id: "sim-baseline-0",
  artifact_sha256: hex("a"),
  protocol_id: "sim-protocol-draft",
  mode: "pregame",
  generated_at: new Date(now - 60000).toISOString(),
  historical_cutoff: new Date(now - 3600000).toISOString(),
  seed: "42",
  requested_runs: 1000,
  actual_runs: 1000,
  inputs: {
    sources: [
      {
        url: "https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2025.parquet",
        sha256: hex("b"),
        category: "play_by_play",
        source_updated_at: null,
        retrieved_at: new Date(now - 7200000).toISOString(),
        usable_through: new Date(now - 7200000).toISOString(),
      },
    ],
  },
  output: {
    margin: dist(1000, 3),
    total: dist(1000, 44),
    home_score: dist(1000, 24),
    away_score: dist(1000, 21),
    wins: { home: 560, away: 430, tie: 10 },
  },
  blockers: ["INJURY_REPORT_NOT_YET_RELEASED"],
  replay_manifest: { method: "nearest_to_ensemble_medians", seed: "42" },
  ...over,
});
const record = async (run, role = "service_role") => {
  await db.exec(`set role ${role}`);
  try {
    return (
      await db.query("select public.record_sim_pregame_run($1) id", [run])
    ).rows[0].id;
  } finally {
    await db.exec("reset role");
  }
};
const rejects = async (run, pattern, role) => {
  let message = "";
  try {
    await record(run, role);
  } catch (e) {
    message = `${e.message} ${e.detail || ""}`;
  }
  assert.match(message, pattern);
};

// A valid capture is stored with server digests and the authoritative kickoff.
const id = await record(capture());
const row = (
  await db.query("select * from private.sim_pregame_runs where id = $1", [id])
).rows[0];
assert.match(row.input_sha256, /^[0-9a-f]{64}$/);
assert.match(row.output_sha256, /^[0-9a-f]{64}$/);
const kickoff = (
  await db.query("select kickoff from public.games where id = $1", [
    row.game_id,
  ])
).rows[0].kickoff;
assert.equal(row.kickoff_at_capture.getTime(), kickoff.getTime());

// Idempotent replay returns the original; a conflicting replay fails.
assert.equal(await record(capture()), id);
await rejects(capture({ seed: "43" }), /different content/);

// Only the service role records; members and anonymous callers can't.
await rejects(
  capture({ run_key: "member-try" }),
  /permission denied/,
  "authenticated",
);
await rejects(capture({ run_key: "anon-try" }), /permission denied/, "anon");

// Timing: no capture after kickoff, for TBD games, or with sources fetched after generation.
await rejects(
  capture({ run_key: "late", game_id: "00000000-0000-0000-0000-000000000002" }),
  /kicked off/,
);
await rejects(
  capture({ run_key: "tbd", game_id: "00000000-0000-0000-0000-000000000003" }),
  /not scheduled/,
);
await rejects(
  capture({
    run_key: "future",
    generated_at: new Date(now + 3600000).toISOString(),
  }),
  /generated_at in the future/,
);
await rejects(
  capture({
    run_key: "cutoff",
    historical_cutoff: new Date(now).toISOString(),
    generated_at: new Date(now - 60000).toISOString(),
  }),
  /historical_cutoff after generated_at/,
);
const late = capture({ run_key: "late-source" });
late.inputs.sources[0].retrieved_at = new Date(now).toISOString();
await rejects(late, /source retrieved after generated_at/);
const insecure = capture({ run_key: "http" });
insecure.inputs.sources[0].url = "http://example.com/pbp.csv";
insecure.inputs.sources[0].sha256 = "ABC";
await rejects(insecure, /https.*sha256|sha256.*https/);

// Distributions must reconcile with actual_runs; quantiles ordered; wins sum.
const bad = capture({ run_key: "bad-dist", actual_runs: 900 });
await rejects(bad, /margin: n must equal actual_runs/);
const unordered = capture({ run_key: "unordered" });
unordered.output.total.quantiles.p75 = 1;
await rejects(unordered, /total: quantiles out of order/);
const wins = capture({ run_key: "wins" });
wins.output.wins.tie = 11;
await rejects(wins, /wins home\/away\/tie/);
await rejects(
  capture({ run_key: "over", requested_runs: 500 }),
  /actual_runs must be between/,
);

// Only registered model/artifact/protocol triples can record; registration isn't approval.
await rejects(
  capture({ run_key: "unregistered", artifact_sha256: hex("c") }),
  /registered exactly/,
);

// Scenarios point at a pregame baseline of the same game.
const scenario = await record(
  capture({
    run_key: "sea-den-2026w9-no-qb",
    mode: "scenario",
    scenario_id: "qb-out",
    parent_run_id: id,
  }),
);
assert.ok(scenario);
await rejects(
  capture({
    run_key: "orphan",
    mode: "scenario",
    scenario_id: "x",
    parent_run_id: scenario,
  }),
  /scenario parent/,
);

// Rows are append-only.
let blocked = "";
try {
  await db.exec(`update private.sim_pregame_runs set seed = 'x'`);
} catch (e) {
  blocked = e.message;
}
assert.match(blocked, /immutable/);

// Admin-only read.
await db.exec("set role authenticated");
let denied = "";
try {
  await db.query("select * from public.admin_sim_pregame_runs(10)");
} catch (e) {
  denied = e.message;
}
assert.match(denied, /administrator/);
await db.exec("set app.admin = 'yes'");
const rows = (await db.query("select * from public.admin_sim_pregame_runs(10)"))
  .rows;
await db.exec("reset role");
assert.equal(rows.length, 2);
assert.equal(
  rows.find((r) => r.mode === "pregame").matchup,
  "Seattle Seahawks at Denver Broncos",
);
assert.equal(rows.find((r) => r.mode === "pregame").output.wins.home, 560);
console.log(
  "PASS sim pregame capture: service-only, before kickoff, provenance/timing/distribution checks, idempotent, append-only, admin read.",
);
await db.close();

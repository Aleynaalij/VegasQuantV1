import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
process.on("uncaughtException", (e) => {
  console.error(
    e.message,
    e.detail ?? "",
    e.where ?? "",
    e.position,
    e.internalPosition,
    e.internalQuery ?? "",
    e.query?.slice(
      Math.max(0, Number(e.position) - 160),
      Number(e.position) + 160,
    ),
  );
  process.exit(1);
});
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role; create schema private; create schema auth;
create function auth.role() returns text language sql as $$select 'service_role'::text$$;
create function private.is_admin() returns boolean language sql as $$select false$$;
create function private.immutable() returns trigger language plpgsql as $$begin raise exception 'immutable';end$$;
create table games(id uuid primary key,sport text,kickoff timestamptz,kickoff_tbd boolean,home_abbreviation text,away_abbreviation text);
create table source_observations(id uuid primary key,game_id uuid,kind text,observed_at timestamptz,recorded_at timestamptz,payload jsonb,source text default 'https://example.com/quote');
create table challenge_stages(id uuid primary key,game_id uuid);
create table analysis_versions(id uuid primary key,sections jsonb);
create table candidate_releases(id uuid primary key default gen_random_uuid(),stage_id uuid,candidates jsonb);
create table official_picks(id uuid primary key default gen_random_uuid(),game_id uuid,analysis_id uuid,selection text,book text,odds numeric,market text,recommended_line numeric,direction text,model_probability numeric);
create table edge_releases(id uuid primary key default gen_random_uuid(),official_pick_id uuid,items jsonb);
create table research_leg_results(leg_key text primary key);
create table research_feed_posts(id uuid primary key default gen_random_uuid(),game_id uuid,category text,result_leg_key text);
create view published_legs as select null::uuid game_id,null::text name,null::text market,null::text kind,null::uuid release_id,null::uuid official_pick_id,now() published_at where false;
`);
await db.exec(
  fs.readFileSync(
    new URL(
      "../../supabase/migrations/20261016130632_nfl_selection_gate.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
await db.exec(
  fs.readFileSync(
    new URL(
      "../../supabase/migrations/20261016132600_nfl_prospective_shadow_evidence.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
await db.exec(
  fs.readFileSync(
    new URL(
      "../../supabase/migrations/20261016170000_line_shopping_books.sql",
      import.meta.url,
    ),
    "utf8",
  ).replace(/create table public\.leg_book_prices[\s\S]*$/, ""),
);
const game = "00000000-0000-4000-8000-000000000001",
  quote = "00000000-0000-4000-8000-000000000002";
const stamp = new Date().toISOString();
await db.query(
  `insert into games values($1,'NFL',now()+interval '1 hour',false,'DEN','SEA')`,
  [game],
);
await db.query(
  `insert into source_observations(id,game_id,kind,observed_at,recorded_at,payload) values($2,$1,'odds',now(),now(),$3::jsonb)`,
  [
    game,
    quote,
    JSON.stringify({
      book: "FanDuel",
      market: "player_reception_yds_alternate",
      provider_updated_at: stamp,
      outcomes: [
        { description: "Test Player", name: "Over", point: 39.5, price: -200 },
      ],
    }),
  ],
);
const c = {
  game_id: game,
  name: "Test Player",
  market: "Full game · 40+ receiving yards",
  copy_text: "Test Player 40+ receiving yards",
  book: "FanDuel",
  odds: -200,
  quote_observed_at: stamp,
  quote_source_url: "https://example.com/quote",
  selection_gate: {
    version: "2026-10-16.r1",
    phase: "pregame",
    stat: "receiving_yards",
    direction: "at_least",
    threshold: 40,
    position: "WR",
    team: "SEA",
    history_window: "latest_consecutive_games",
    history_source_url: "https://example.com/logs",
    history: [60, 70, 80, 90, 30].map((value, i) => ({
      game_id: `historical-${i}`,
      value,
      played_at: `2026-09-${10 + i}T00:00:00Z`,
      source_url: "https://example.com/log",
    })),
    model_id: "fixture-approved",
    model_probability: 0.75,
    historical_cutoff: "2026-10-01T00:00:00Z",
    generated_at: stamp,
    forecast_source_url: "https://example.com/model",
    input_hashes: { test: "hash" },
    opportunity_case: "Supported routes and targets",
    failure_path: "Pressure and stalled drives",
    role_source_url: "https://example.com/role",
    availability_source_url: "https://example.com/active",
    availability_verified: true,
    game_script_review: "Leading and trailing scenarios reviewed",
    quote_observation_id: quote,
    initial_quote_observation_id: quote,
  },
};
const rules = (
  await db.query("select rules from private.nfl_selection_rule_versions")
).rows[0].rules;
async function errors(candidate = c) {
  return (
    await db.query(
      "select private.nfl_selection_errors($1::jsonb,$2::jsonb) e",
      [JSON.stringify(candidate), JSON.stringify(rules)],
    )
  ).rows[0].e;
}
const patch = (p = {}, s = {}) => ({
  ...structuredClone(c),
  ...p,
  selection_gate: { ...structuredClone(c.selection_gate), ...s },
});
assert.match(JSON.stringify(await errors()), /approved priced model/);
await db.exec(
  `insert into private.nfl_selection_model_approvals(model_id,markets,validation_url,approved_at) values('fixture-approved',array['receiving_yards','rushing_yards','receptions'],'https://example.com/validation',now()-interval '1 second')`,
);
assert.deepEqual(await errors(), []);
let checks = 2;
for (const [candidate, pattern] of [
  [patch({ odds: null }), /exact numeric American price/],
  [patch({ book: "" }), /collected sportsbook/],
  [patch({ book: "Bovada" }), /collected sportsbook/],
  [patch({ book: "DraftKings" }), /published sportsbook/],
  [patch({}, { history: c.selection_gate.history.slice(0, 4) }), /five latest/],
  [
    patch(
      {},
      {
        history: c.selection_gate.history.map((v, i) => ({
          ...v,
          value: i < 3 ? 60 : 0,
        })),
      },
    ),
    /five points/,
  ],
  [patch({ pick_of_day: true, odds: -850 }), /Pick of the Day/],
  [patch({}, { position: "TE" }), /tight ends/],
  [patch({}, { model_id: "v0.3-SHADOW_ONLY" }), /approved priced model/],
  [patch({}, { model_probability: 0.68 }), /three percentage/],
  [patch({}, { quote_observation_id: null }), /immutable exact-market/],
  [patch({ copy_text: "Other Player 40+ receiving yards" }), /Gambly copy/],
  [
    patch(
      {},
      { history: [...c.selection_gate.history, c.selection_gate.history[0]] },
    ),
    /unique/,
  ],
  [
    patch(
      {},
      {
        history: c.selection_gate.history.map((x) => ({
          ...x,
          played_at: "2099-01-01T00:00:00Z",
        })),
      },
    ),
    /before publication/,
  ],
  [patch({}, { availability_verified: false }), /availability/],
  [
    patch(
      {},
      {
        phase: "halftime",
        live_status: "STATUS_HALFTIME",
        live_observed_at: stamp,
        live_source_url: "https://example.com/live",
        team_lead: 11,
      },
    ),
    /leading by ten/,
  ],
  [
    patch(
      {},
      {
        phase: "halftime",
        stat: "rushing_yards",
        first_half_yards: 30,
        live_status: "STATUS_HALFTIME",
        live_observed_at: stamp,
        live_source_url: "https://example.com/live",
        team_lead: 0,
      },
    ),
    /thirty percent/,
  ],
  [
    patch({}, { phase: "halftime", direction: "under" }),
    /halftime requires overs/,
  ],
  [
    patch({}, { phase: "halftime", live_status: "STATUS_IN_PROGRESS" }),
    /halftime status/,
  ],
]) {
  assert.match(JSON.stringify(await errors(candidate)), pattern);
  checks++;
}
// Line shopping: a DraftKings price passes with DraftKings provenance, and cannot borrow another book's.
const dkQuote = "00000000-0000-4000-8000-0000000000d1";
await db.query(
  `insert into source_observations(id,game_id,kind,observed_at,recorded_at,payload) values($2,$1,'odds',now(),now(),$3::jsonb)`,
  [
    game,
    dkQuote,
    JSON.stringify({
      book: "DraftKings",
      market: "player_reception_yds_alternate",
      provider_updated_at: stamp,
      outcomes: [
        { description: "Test Player", name: "Over", point: 39.5, price: -190 },
      ],
    }),
  ],
);
const draftKings = patch(
  { book: "DraftKings", odds: -190 },
  { quote_observation_id: dkQuote, initial_quote_observation_id: dkQuote },
);
assert.deepEqual(await errors(draftKings), []);
checks++;
assert.match(
  JSON.stringify(await errors(patch({ book: "DraftKings", odds: -190 }, { quote_observation_id: dkQuote }))),
  /initial price observation/,
);
checks++;
await db.exec(`delete from source_observations where id='${dkQuote}'`);
// Early publication is a draft until the lock window.
await db.exec(`update games set kickoff=now()+interval '3 hours'`);
assert.match(JSON.stringify(await errors()), /two hours/);
checks++;
await db.exec(`update games set kickoff=now()+interval '1 hour'`);
// Opposing movement, missing player and newer snapshots cannot pass by stale quote reuse.
await db.query(
  `insert into source_observations(id,game_id,kind,observed_at,recorded_at,payload) values('00000000-0000-4000-8000-000000000003',$1,'odds',now()-interval '1 minute',now()-interval '1 minute',$2::jsonb)`,
  [
    game,
    JSON.stringify({
      book: "FanDuel",
      market: "player_reception_yds_alternate",
      outcomes: [
        { description: "Test Player", name: "Over", point: 39.5, price: -220 },
      ],
    }),
  ],
);
assert.match(
  JSON.stringify(
    await errors(
      patch(
        {},
        {
          initial_quote_observation_id: "00000000-0000-4000-8000-000000000003",
        },
      ),
    ),
  ),
  /fifteen cents/,
);
checks++;
await db.exec(
  "delete from source_observations where id='00000000-0000-4000-8000-000000000003'",
);
// Direct inserts enforce the same gate; rejected inserts leave no publication or success log.
await assert.rejects(
  db.query("insert into candidate_releases(candidates) values($1::jsonb)", [
    JSON.stringify([patch({ odds: null })]),
  ]),
  /NFL_SELECTION_GATE_BLOCKED/,
);
checks++;
assert.equal(
  (await db.query("select count(*)::int n from candidate_releases")).rows[0].n,
  0,
);
const preflight = (
  await db.query("select public.preflight_nfl_selection($1::jsonb) r", [
    JSON.stringify(patch({ odds: null })),
  ])
).rows[0].r;
assert.equal(preflight.passed, false);
assert.equal(preflight.publication_authorized, false);
checks++;
assert.equal(
  (
    await db.query(
      "select count(*)::int n from private.nfl_selection_gate_decisions where not accepted",
    )
  ).rows[0].n,
  1,
);
// A known-good fixture can pass; a second insert with a different id cannot duplicate it.
await db.query("insert into candidate_releases(candidates) values($1::jsonb)", [
  JSON.stringify([c]),
]);
checks++;
await assert.rejects(
  db.query("insert into candidate_releases(candidates) values($1::jsonb)", [
    JSON.stringify([c]),
  ]),
  /NFL_SELECTION_GATE_BLOCKED/,
);
checks++;
await assert.rejects(
  db.exec(
    `insert into research_feed_posts(game_id,category)values('${game}','Decision')`,
  ),
  /NFL_SELECTION_GATE_BLOCKED/,
);
checks++;
await db.exec(
  `insert into research_feed_posts(game_id,category)values('${game}','Injury watch')`,
);
await assert.rejects(
  db.query("insert into candidate_releases(candidates)values($1::jsonb)", [
    JSON.stringify([{ parlay: true, parlay_legs: [], leg_keys: [] }]),
  ]),
  /NFL_SELECTION_GATE_BLOCKED/,
);
checks++;
// Official entry path must provide evidence from its immutable analysis snapshot.
await assert.rejects(
  db.exec(
    `insert into official_picks(game_id,selection,book,odds)values('${game}','Full game · 40+ receiving yards','FanDuel',-200)`,
  ),
  /NFL_SELECTION_GATE_BLOCKED/,
);
checks++;
// Equivalent integer alternate markets dedupe regardless of Over/at-least presentation.
assert.equal(
  (
    await db.query(
      "select private.nfl_gate_identity($1,'Test Player','Full game · 40+ receiving yards')=private.nfl_gate_identity($1,'Test Player','Full game · Over 39.5 receiving yards') same",
      [game],
    )
  ).rows[0].same,
  true,
);
checks++;
// Bundle validation: matching three leaves passes; five, mismatched display, or missing review fails.
const bundleId = "00000000-0000-4000-8000-000000000010";
const players = ["Alpha", "Beta", "Gamma"];
const bundleQuote = "00000000-0000-4000-8000-000000000011";
await db.query(
  "insert into source_observations(id,game_id,kind,observed_at,recorded_at,payload) values($1,$2,'odds',now(),now(),$3::jsonb)",
  [
    bundleQuote,
    game,
    JSON.stringify({
      book: "FanDuel",
      market: "player_reception_yds_alternate",
      provider_updated_at: new Date().toISOString(),
      outcomes: players.map((description) => ({
        description,
        name: "Over",
        point: 39.5,
        price: -200,
      })),
    }),
  ],
);
const latest = (
  await db.query("select payload from source_observations where id=$1", [
    bundleQuote,
  ])
).rows[0].payload.provider_updated_at;
const leaves = players.map((name) =>
  patch(
    {
      name,
      copy_text: name + " 40+ receiving yards",
      parlay_group: bundleId,
      quote_observed_at: latest,
    },
    {
      quote_observation_id: bundleQuote,
      initial_quote_observation_id: bundleQuote,
    },
  ),
);
const bundle = {
  parlay: true,
  parlay_legs: leaves.map(({ name, market }) => ({ name, market })),
  leg_keys: leaves.map((_, i) => "candidate:" + bundleId + ":" + (i + 2)),
  correlation_review: "Shared passing risk reviewed",
  failure_scenarios: "Stalled offense defeats multiple legs",
};
await assert.rejects(
  db.query(
    "insert into candidate_releases(id,candidates)values($1,$2::jsonb)",
    [bundleId, JSON.stringify([{ ...bundle, parlay_legs: [] }, ...leaves])],
  ),
  /NFL_SELECTION_GATE_BLOCKED/,
);
checks++;
await db.query(
  "insert into candidate_releases(id,candidates)values($1,$2::jsonb)",
  [bundleId, JSON.stringify([bundle, ...leaves])],
);
checks++;
assert.equal(
  (
    await db.query(
      "select count(*)::int n from private.nfl_selection_gate_decisions where accepted",
    )
  ).rows[0].n,
  2,
);
// Shadow journal is durable research evidence, never a model approval or public release.
await db.query(
  "insert into private.nfl_shadow_model_manifests(model_id,artifact_sha256,artifact_url,status) values('fixture-shadow',$1,'https://example.com/artifact','SHADOW_ONLY')",
  ["a".repeat(64)],
);
const shadowTime = new Date().toISOString();
const shadow = {
  as_of: shadowTime,
  model_id: "fixture-shadow",
  status: "SHADOW_ONLY",
  input_sources: [
    { sha256: "b".repeat(64), source_url: "https://example.com/history" },
  ],
  coverage: { cards: 1, priced: 1 },
  cards: [
    {
      game_id: game,
      model_id: "fixture-shadow",
      player: "Test Player",
      market: "receiving",
      official_eligible: false,
      status: "WAIT",
      research_probability: 0.75,
      generated_as_of: shadowTime,
      history_through: [2026, 5],
      forecast_inputs: { test: 1 },
      blockers: ["No prospective validation"],
      quote: {
        source_observation_id: quote,
        sportsbook: "FanDuel",
        source_url: "https://example.com/quote",
        provider_market: "player_reception_yds_alternate",
        observed_at: stamp,
        direction: "over",
        line: 39.5,
        odds: -200,
      },
    },
  ],
};
const slate = [
  {
    id: game,
    kickoff: (
      await db.query("select kickoff from games where id=$1", [game])
    ).rows[0].kickoff.toISOString(),
  },
];
const record = async (x = shadow) =>
  (
    await db.query(
      "select private.record_nfl_shadow_scan($1::jsonb,$2::jsonb) r",
      [JSON.stringify(x), JSON.stringify(slate)],
    )
  ).rows[0].r;
const saved = await record();
assert.equal(saved.recorded_forecasts, 1);
assert.equal(saved.published, false);
assert.equal((await record()).replayed, true);
await assert.rejects(
  record({ ...shadow, coverage: { cards: 99 } }),
  /Conflicting replay/,
);
await assert.rejects(
  record({ ...shadow, as_of: "2026-01-01T00:00:00Z" }),
  /Fresh shadow scan/,
);
await assert.rejects(
  record({ ...shadow, status: "BETTABLE" }),
  /Fresh shadow scan/,
);
assert.equal(
  (
    await db.query(
      "select count(*)::int n from private.nfl_selection_model_approvals where model_id='fixture-shadow'",
    )
  ).rows[0].n,
  0,
);
await assert.rejects(
  db.exec("update private.nfl_shadow_scan_runs set scan='{}'"),
  /immutable/,
);
console.log(
  "Shadow journal: exact-source capture, dedupe, conflict rejection, stale/backfill rejection and immutability passed.",
);
console.log(
  `${checks} NFL gate checks passed (fixture model approval exists only in isolated test database).`,
);
await db.close();

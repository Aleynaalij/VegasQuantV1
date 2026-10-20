import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema private;
create function private.immutable() returns trigger language plpgsql as $$ begin raise exception 'immutable'; end $$;
create function private.has_membership() returns boolean language sql as $$ select current_setting('test.member',true)='yes' $$;
create function private.age_member_allowed() returns boolean language sql as $$ select current_setting('test.age',true)='yes' $$;
grant usage on schema private to anon,authenticated;
create table public.nba_games(id uuid primary key,season_type integer,tipoff_tbd boolean,tipoff timestamptz,status text);
create table public.nba_observations(id uuid primary key,game_id uuid,kind text,payload jsonb,observed_at timestamptz,recorded_at timestamptz,source text);
insert into nba_games values('00000000-0000-4000-8000-000000000001',2,false,now()+interval '1 day','STATUS_SCHEDULED');
insert into nba_observations values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','prop',
 '{"book":"FanDuel","market":"player_points","outcomes":[{"description":"Sample Player","name":"Over","point":20.5,"price":-110}]}',now()-interval '1 minute',now(),'https://example.com/quote');
`);
await db.exec(
  readFileSync(
    "supabase/migrations/20261020021929_nba_editorial_picks.sql",
    "utf8",
  ),
);
await db.exec(
  readFileSync(
    "supabase/migrations/20261020023605_nba_editorial_provenance_and_revisions.sql",
    "utf8",
  ),
);
const base = {
  publication_key: "test",
  game_id: "00000000-0000-4000-8000-000000000001",
  quote_observation_id: "00000000-0000-4000-8000-000000000002",
  player: "Sample Player",
  market: "player_points",
  direction: "Over",
  line: 20.5,
  odds: -110,
  book: "FanDuel",
  rationale: "Verified role and opportunity evidence for this synthetic test.",
  risk: "Minutes and shooting may change in this synthetic fixture.",
  unknowns: "Final lineup is not confirmed.",
  sources: [
    { url: "https://example.com/role", label: "Role" },
    { url: "https://example.com/injury", label: "Availability" },
  ],
  evidence: {
    historical_cutoff: new Date(Date.now() - 10000).toISOString(),
    input_sha256: "a".repeat(64),
    availability_review: "Observed participation",
    role_review: "Starter",
    generated_at: new Date(Date.now() - 5000).toISOString(),
    quote_observation_id: "00000000-0000-4000-8000-000000000002",
    source_files: ["role", "injury"].map((k) => ({
      url: "https://example.com/" + k,
      sha256: "a".repeat(64),
      retrieved_at: new Date(Date.now() - 5000).toISOString(),
    })),
  },
};
async function insert(p, validHash = true) {
  if (validHash) {
    const e = { ...p.evidence };
    delete e.input_sha256;
    delete e.input_hash_format;
    const hash = (
      await db.query(
        "select encode(sha256(convert_to($1::jsonb::text,'UTF8')),'hex') as h",
        [JSON.stringify(e)],
      )
    ).rows[0].h;
    p = { ...p, evidence: { ...e, input_sha256: hash } };
  }
  const keys = Object.keys(p),
    vals = keys.map((k) =>
      ["sources", "evidence"].includes(k) ? JSON.stringify(p[k]) : p[k],
    );
  return db.query(
    `insert into nba_editorial_picks(${keys.join(",")}) values(${keys.map((_, i) => "$" + (i + 1)).join(",")}) returning *`,
    vals,
  );
}
await assert.rejects(insert({ ...base, odds: -120 }), /exact recent/);
await assert.rejects(insert({ ...base, direction: "Under" }), /exact recent/);
await assert.rejects(
  insert({ ...base, evidence: { ...base.evidence, role_review: "" } }),
  /role and availability/,
);
await assert.rejects(
  insert({ ...base, analysis_kind: "OFFICIAL" }),
  /check constraint/,
);
const p = (await insert(base)).rows[0];
assert.equal(p.quote_source_url, "https://example.com/quote");
assert.equal(p.analysis_kind, "QUALITATIVE_EDITORIAL");
await assert.rejects(insert(base), /current publication/);
await assert.rejects(
  insert({ ...base, publication_key: "unlinked" }),
  /current publication/,
);
await assert.rejects(
  insert({
    ...base,
    publication_key: "missing-sources",
    supersedes_id: p.id,
    evidence: { ...base.evidence, source_files: [] },
  }),
  /complete timestamped source/,
);
await assert.rejects(
  insert({
    ...base,
    publication_key: "missing-hash",
    supersedes_id: p.id,
    evidence: {
      ...base.evidence,
      source_files: [
        { url: "https://example.com", retrieved_at: new Date().toISOString() },
        {
          url: "https://example.com/2",
          sha256: "b".repeat(64),
          retrieved_at: new Date().toISOString(),
        },
      ],
    },
  }),
  /source hash and retrieval/,
);
await assert.rejects(
  insert({ ...base, publication_key: "bad-hash", supersedes_id: p.id }, false),
  /evidence hash mismatch/,
);
const revision = (
  await insert({ ...base, publication_key: "revision", supersedes_id: p.id })
).rows[0];
await assert.rejects(
  insert({ ...base, publication_key: "branch", supersedes_id: p.id }),
  /current publication/,
);
const second = (
  await insert({
    ...base,
    publication_key: "revision-2",
    supersedes_id: revision.id,
  })
).rows[0];
assert.equal(second.supersedes_id, revision.id);
await assert.rejects(
  db.exec(`update nba_editorial_picks set odds=-120`),
  /immutable/,
);
await assert.rejects(db.exec(`delete from nba_editorial_picks`), /immutable/);
await db.exec("set role anon; set test.member='no';");
assert.equal(
  (await db.query("select * from nba_editorial_picks")).rows.length,
  0,
);
await assert.rejects(
  insert({ ...base, publication_key: "anon" }),
  /permission denied/,
);
await db.exec(
  "reset role; set role authenticated; set test.member='yes'; set test.age='no';",
);
assert.equal(
  (await db.query("select * from nba_editorial_picks")).rows.length,
  0,
);
await db.exec("set test.age='yes';");
assert.equal(
  (await db.query("select * from nba_editorial_picks")).rows.length,
  3,
);
await assert.rejects(
  insert({ ...base, publication_key: "member" }),
  /permission denied/,
);
await db.exec(
  "reset role; update nba_observations set observed_at=now()-interval '9 hours';",
);
await assert.rejects(
  insert({ ...base, publication_key: "stale" }),
  /exact recent/,
);
await db.exec("update nba_games set tipoff=now()-interval '1 minute';");
await assert.rejects(
  insert({ ...base, publication_key: "late" }),
  /upcoming regular-season/,
);
await db.close();

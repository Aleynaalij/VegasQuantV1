import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
// Codex's multisport harness, a Zone author, then the automated publication path.
const db = new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;create schema auth;
grant usage on schema private,auth to anon,authenticated,service_role;
create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function private.is_admin()returns boolean language sql as $$select false$$;
create function private.has_membership()returns boolean language sql as $$select true$$;
create function private.age_member_allowed()returns boolean language sql as $$select true$$;
create function private.immutable()returns trigger language plpgsql as $$begin raise exception 'immutable';end$$;
create table public.feed_runs(provider text,status text,details jsonb,created_at timestamptz default now());
create table public.community_posts(id uuid primary key default gen_random_uuid(),user_id uuid,sport text,kind text,title text,body text,legs jsonb,posted_as uuid default auth.uid());
create function private.age_eligible(uuid)returns boolean language sql as $$select true$$;
create table public.community_profiles(user_id uuid,username text,avatar text);
create table private.zone_automation(name text primary key,user_id uuid);
insert into auth.users values('00000000-0000-4000-8000-000000000042');insert into private.zone_automation values('nba_threes','00000000-0000-4000-8000-000000000042');`);
for (const f of [
  "20261031145407_multisport_backend.sql",
  "20261031152818_multisport_publishing_access.sql",
  "20261031173000_sports_automated_publication.sql",
])
  await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
await db.exec(
  "insert into public.community_profiles values('00000000-0000-4000-8000-000000000042','MikeQ','SYNTHETIC');",
);
await db.exec(
  readFileSync(
    "supabase/migrations/20261031182000_sports_publication_serialization.sql",
    "utf8",
  ),
);
const now = Date.now(),
  iso = (ms) => new Date(now + ms).toISOString();
const body = '{"fixture":true}',
  source = {
    url: "https://example.invalid/fixture",
    body,
    sha256: createHash("sha256").update(body).digest("hex"),
    retrieved_at: iso(0),
  };
const game = {
  sport: "nhl",
  provider_id: "123",
  slug: "sample",
  start_time: iso(3600000),
  start_time_tbd: false,
  completed: false,
  away: { id: "a", provider_id: "1", name: "Away Team" },
  home: { id: "b", provider_id: "2", name: "Home Team" },
  source: { ...source, body: undefined },
};
const rpc = async (n, p) =>
  (await db.query(`select public.${n}($1) r`, [p])).rows[0].r;
await rpc("ingest_sports", { sport: "nhl", source, games: [game] });
const id = (await db.query("select id from public.sports_games")).rows[0].id;
const m = {
  game_id: id,
  sport: "nhl",
  book: "FanDuel",
  market: "totals",
  period: "full_game",
  selection: "Over",
  player: null,
  athlete_id: null,
  side: null,
  direction: "Over",
  line: 6.5,
  odds: -130,
  observed_at: iso(-60000),
  expires_at: iso(1740000),
  settlement: "including_overtime_shootout",
  settlement_note: "Full game OT/SO",
  source: { ...source, body: undefined },
};
await rpc("ingest_sports", {
  sport: "nhl",
  source,
  markets: [m, { ...m, selection: "Under", direction: "Under", odds: 106 }],
});
const q = async (sel) =>
  (
    await db.query(
      `select id from public.sports_markets where payload->>'selection'=$1`,
      [sel],
    )
  ).rows[0].id;
const why = "Both teams have gone over in most recent games.",
  risk = "Small samples; an early lead can slow the pace.";
const pub = (mk, t = "Away at Home: Over 6.5") =>
  db.query("select private.sports_publish_automated($1,$2,$3,$4) r", [
    mk,
    t,
    why,
    risk,
  ]);
// Members and the API roles cannot call it.
for (const role of ["anon", "authenticated", "service_role"])
  assert.equal(
    (
      await db.query(
        `select has_function_privilege('${role}','private.sports_publish_automated(uuid,text,text,text)','execute') p`,
      )
    ).rows[0].p,
    false,
    role,
  );
const r = (await pub(await q("Over"))).rows[0].r;
assert.equal(
  r.line,
  "Over 6.5 goals (-130 at FanDuel, " + r.line.split(", ")[1],
);
const post = (await db.query("select * from public.community_posts")).rows[0];
assert.equal(post.user_id, "00000000-0000-4000-8000-000000000042");
assert.equal(post.posted_as, post.user_id);
assert.equal(post.sport, "nhl");
assert.ok(post.body.includes(String.fromCharCode(10)));
assert.equal(
  (
    await db.query(
      "select nullif(current_setting('request.jwt.claim.sub',true),'') actor",
    )
  ).rows[0].actor,
  null,
);
assert.ok(post.body.startsWith("Over 6.5 goals (-130 at FanDuel"));
assert.ok(post.body.includes("Risk: Small samples"));
assert.ok(!post.body.includes("example.invalid"));
const sel = (await db.query("select * from public.sports_selections")).rows[0];
assert.equal(sel.author_id, post.user_id);
// The other side of the same market, or a repeat, is refused; thin reasoning is refused.
await assert.rejects(pub(await q("Under")), /Already published/);
await assert.rejects(
  db.query("select private.sports_publish_automated($1,$2,$3,$4)", [
    await q("Over"),
    "Hi",
    "short",
    "short",
  ]),
  /Analysis and risk required|Already published/,
);
// Closed quotes and started games are refused.
await db.exec(
  `alter table public.sports_selections disable trigger user;delete from public.sports_selections;alter table public.sports_selections enable trigger user;`,
);
await db.exec(
  "update public.sports_games set start_time=now()-interval '1 minute'",
);
await assert.rejects(pub(await q("Under")), /Quote closed/);
console.log(
  "PASS sports automated publication: server-only, exact open quote, one per market, Zone post as the editorial author with a readable line",
);
await db.close();

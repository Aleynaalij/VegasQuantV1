import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
// Zone posts tied to their games: publisher posts are tagged by matchup text or recorded links, member
// posts never are, and the reader applies the Zone's gates.
const db = new PGlite();
const DEALER = "00000000-0000-4000-8000-0000000000d1";
const MEMBER = "00000000-0000-4000-8000-0000000000a1";
const G = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
await db.exec(`create role anon; create role authenticated; create role service_role;
create schema private; create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table private.zone_automation(name text primary key, user_id uuid);
insert into private.zone_automation values ('vq_dealer','${DEALER}');
create table private.blocked(target uuid);
create function private.age_member_allowed() returns boolean language sql stable as $$select auth.uid() is not null$$;
create function private.community_member_allowed(target uuid) returns boolean language sql stable security definer set search_path='' as
 $$select not exists(select 1 from private.blocked b where b.target=community_member_allowed.target)$$;
grant usage on schema private to authenticated; grant execute on all functions in schema private to authenticated;
create table public.community_posts(id uuid primary key default gen_random_uuid(), user_id uuid, sport text, kind text default 'talk', title text, body text, legs jsonb default '[]', photo_path text, card text, author_name text default 'TheDealer', created_at timestamptz default '2026-11-10 17:00+00');
create table public.community_reactions(post_id uuid, user_id uuid);
create table public.community_post_comments(post_id uuid, user_id uuid);
create table public.games(id uuid primary key, sport text, away_team text, home_team text, away_abbreviation text, home_abbreviation text, kickoff timestamptz);
insert into public.games values
 ('${G(1)}','nfl','Washington Commanders','New York Giants','WSH','NYG','2026-11-13 01:15+00'),
 ('${G(2)}','nfl','Los Angeles Rams','New York Jets','LAR','NYJ','2026-11-15 18:00+00'),
 ('${G(3)}','nfl','Cincinnati Bengals','Atlanta Falcons','CIN','ATL','2026-11-15 14:30+00'),
 ('${G(4)}','nfl','Dallas Cowboys','Philadelphia Eagles','DAL','PHI','2026-12-20 18:00+00');
create table public.nba_games(id uuid primary key, away_team text, home_team text, away_abbreviation text, home_abbreviation text, tipoff timestamptz);
insert into public.nba_games values
 ('${G(11)}','Boston Celtics','Philadelphia 76ers','BOS','PHI','2026-11-11 01:00+00'),
 ('${G(12)}','Orlando Magic','Sacramento Kings','ORL','SAC','2026-11-11 03:00+00'),
 ('${G(13)}','Oklahoma City Thunder','Portland Trail Blazers','OKC','POR','2026-11-12 03:00+00'),
 ('${G(14)}','Oklahoma City Thunder','Portland Trail Blazers','OKC','POR','2026-11-14 03:00+00'),
 ('${G(15)}','Philadelphia 76ers','Boston Celtics','PHI','BOS','2026-11-13 01:00+00');
create table public.nba_editorial_picks(id uuid default gen_random_uuid(), game_id uuid, player text, published_at timestamptz);
insert into public.nba_editorial_picks(game_id,player,published_at) values ('${G(11)}','Payton Pritchard','2026-11-10 14:12:22.928614+00');
create table public.sports_games(id uuid primary key, sport text, start_time timestamptz, payload jsonb);
insert into public.sports_games values
 ('${G(21)}','nhl','2026-11-11 03:00+00','{"away":{"name":"Nashville Predators","short_name":"Predators","abbreviation":"NSH"},"home":{"name":"Los Angeles Kings","short_name":"Kings","abbreviation":"LA"}}'),
 ('${G(22)}','nhl','2026-11-11 00:00+00','{"away":{"name":"New Jersey Devils","short_name":"Devils","abbreviation":"NJ"},"home":{"name":"Winnipeg Jets","short_name":"Jets","abbreviation":"WPG"}}'),
 ('${G(31)}','ncaab','2026-11-11 02:00+00','{"away":{"name":"Utah Tech Trailblazers","short_name":"Utah Tech","abbreviation":"UTU"},"home":{"name":"Utah State Aggies","short_name":"Utah State","abbreviation":"USU"}}'),
 ('${G(32)}','ncaab','2026-11-11 02:00+00','{"away":{"name":"Queens University Royals","short_name":"Queens","abbreviation":"QUC"},"home":{"name":"Utah Utes","short_name":"Utah","abbreviation":"UTAH"}}');
insert into public.community_posts(user_id,sport,title,body,created_at) values ('${DEALER}','nhl','Devils at Jets: New Jersey Devils moneyline','x','2026-11-10 19:00+00');`);
// The migration (and its backfill of an existing NHL post) must run before the NHL charts table exists.
await db.exec(fs.readFileSync("supabase/migrations/20261111010000_zone_post_games.sql", "utf8"));
assert.equal((await db.query("select count(*)::int n from private.zone_post_games where game_id=$1", [G(22)])).rows[0].n, 1, "backfill tags without the charts table");
await db.exec("create table private.nhl_chart_snapshots(id uuid default gen_random_uuid(), game_id uuid, post_id uuid)");

const post = async (sport, title, body, extra = {}) => {
  const r = await db.query(
    "insert into public.community_posts(user_id,sport,title,body,card,created_at) values ($1,$2,$3,$4,$5,coalesce($6::timestamptz,'2026-11-10 17:00+00')) returning id",
    [extra.user || DEALER, sport, title, body, extra.card || null, extra.at || null],
  );
  return r.rows[0].id;
};
const games = async (id) =>
  (await db.query("select game_id from private.zone_post_games where post_id=$1 order by game_id", [id])).rows.map((r) => r.game_id);

// 1. The owner's case: three Commanders @ Giants research posts, in the title forms actually published.
const sheet = await post("nfl", "NFL Matchup Cheat Sheet · Washington Commanders @ New York Giants",
  "Situation: the Giants won 19–11 at Philadelphia on Sunday, while Washington lost 20–13 to the Rams.");
assert.deepEqual(await games(sheet), [G(1)], "cheat sheet goes to its own game only, not the Rams' game");
assert.deepEqual(await games(await post("nfl", "Defense vs Position · Commanders @ Giants · Thursday Nov 12", "WASHINGTON ALLOWS")), [G(1)]);
// A slate card naming several games, and the abbreviation form.
assert.deepEqual(await games(await post("nfl", "Defense vs position 1 of 4 · SUN NOV 8",
  "Cincinnati Bengals @ Atlanta Falcons · SUN 9:30 AM ET\nBENGALS ALLOW\n\nLos Angeles Rams @ New York Jets · SUN")), [G(2), G(3)]);
assert.deepEqual(await games(await post("nfl", "WR matchups 1 of 2", "97 · Malik Nabers (NYG) vs WSH: green\n90 · X (DAL) vs PHI: green")), [G(1)],
  "abbreviation lines tag their game; a game outside the 8-day window is left out");
// 2. NBA: matchup title, same-instant editorial pick, 3-point slate card by day, two-word nickname.
assert.deepEqual(await games(await post("nba", "NBA Matchup Cheat Sheet · Boston Celtics @ Philadelphia 76ers", "x")), [G(11)]);
assert.deepEqual(await games(await post("nba", "Payton Pritchard Under 12.5 points", "Boston and Philadelphia both submitted.", { at: "2026-11-10 14:12:22.928614+00" })), [G(11)]);
assert.deepEqual(await games(await post("nba", "Payton Pritchard Under 12.5 points", "x", { at: "2026-11-10 15:00+00" })), [], "a pick with no recorded link is not guessed");
assert.deepEqual(await games(await post("nba", "3-point volume · Tue Nov 10", "1. Desmond Bane (ORL) 9.5 att\n6. Paul George (BOS) 8.1 att", { card: "nba-threes:2026-11-10", at: "2026-11-10 14:20+00" })), [G(11), G(12)]);
// Home-and-home inside the window: "vs" matches either order, but only the nearest game is tagged;
// naming the return game in its own order still reaches it.
assert.deepEqual(await games(await post("nba", "Celtics vs 76ers preview", "x")), [G(11)]);
assert.deepEqual(await games(await post("nba", "76ers vs Celtics preview", "x")), [G(11)]);
assert.deepEqual(await games(await post("nba", "Philadelphia 76ers @ Boston Celtics preview", "x")), [G(15)]);
assert.deepEqual(await games(await post("nba", "Thunder @ Trail Blazers preview", "x")), [G(13)],
  "two-word nickname; a repeat meeting two days later is not tagged too");
// 3. NHL: "at" form and the recorded charts link.
assert.deepEqual(await games(await post("nhl", "Predators at Kings: Nashville Predators moneyline", "x")), [G(21)]);
const charts = await post("nhl", "NHL Charts", "Nine visual research pages.");
await db.exec(`insert into private.nhl_chart_snapshots(game_id,post_id) values ('${G(22)}','${charts}'); update public.community_posts set body=body||' ' where id='${charts}'`);
assert.deepEqual(await games(charts), [G(22)], "re-tagged on edit, using the recorded link");
// 4. College names that nest: "Utah" must not claim "Utah State".
assert.deepEqual(await games(await post("ncaab", "Utah Tech at Utah State: Utah State -4.5", "x")), [G(31)]);
assert.deepEqual(await games(await post("ncaab", "Queens at Utah: Utah moneyline", "x")), [G(32)]);
// 5. Member posts are never tagged, and a wrong-sport post is not matched.
assert.deepEqual(await games(await post("nfl", "Commanders @ Giants thoughts", "x", { user: MEMBER })), []);
assert.deepEqual(await games(await post("nba", "Commanders @ Giants", "x")), []);

// 6. The reader: gated, newest first, counts included.
const read = async (uid, sport, game) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid}',false); set role authenticated;`);
  try {
    return (await db.query("select public.game_zone_posts($1,$2) r", [sport, game])).rows[0].r;
  } finally {
    await db.exec("reset role");
  }
};
await db.exec(`insert into public.community_reactions values ('${sheet}','${MEMBER}')`);
const rows = await read(MEMBER, "nfl", G(1));
assert.equal(rows.length, 3);
assert.equal(rows.find((r) => r.id === sheet).reactions, 1);
assert.ok(rows.every((r) => r.title && r.body && r.created_at));
assert.deepEqual(await read(MEMBER, "nba", G(1)), [], "sport must match the game");
assert.deepEqual(await read("", "nfl", G(1)), [], "signed out sees nothing");
await db.exec(`insert into private.blocked values ('${DEALER}')`);
assert.deepEqual(await read(MEMBER, "nfl", G(1)), [], "hidden authors are not shown");
await db.exec("delete from private.blocked; set role anon;");
await assert.rejects(db.query("select public.game_zone_posts('nfl',$1)", [G(1)]), /permission denied/);
await assert.rejects(db.query("select * from private.zone_post_games"), /permission denied/);
await db.exec("reset role");
console.log("Zone post games SQL checks passed.");

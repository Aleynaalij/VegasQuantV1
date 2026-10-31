import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite(),
  owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;
create table private.zone_automation(name text primary key,user_id uuid);
insert into private.zone_automation values('nba_threes','${owner}'),('sports_editorial','${owner}');
create table public.community_profiles(user_id uuid,username text);insert into public.community_profiles values('${owner}','MikeQ');
create table public.community_posts(id uuid primary key default gen_random_uuid(),user_id uuid,sport text,title text,body text,created_at timestamptz default now(),legs jsonb default '[]',card text constraint community_posts_card_check check(card is null or card like 'nba-threes:%'));
create table public.nba_editorial_picks(publication_key text,published_at timestamptz,rationale text,risk text,unknowns text);
create table public.sports_games(id uuid,sport text);create table public.sports_selections(author_id uuid,title text,published_at timestamptz,why text,risk text,game_id uuid);
insert into public.nba_editorial_picks values('fixture-nba','2026-10-31T15:00:00Z','Original analysis.','uncertainty.','Unknowns: missing reports.');
insert into public.community_posts(id,user_id,sport,title,body,created_at) values(md5('nba-editorial-zone:fixture-nba')::uuid,'${owner}','nba','Stored NBA selection',E'Skater Over 6.5 rebounds (+124)\n\nOriginal analysis.\n\nRisk: uncertainty.\n\nUnknowns: missing reports.', '2026-10-31T15:00:00Z');
insert into public.sports_games values('${other}','nhl');
insert into public.sports_selections values('${owner}','Stored NHL selection','2026-10-31T15:01:00Z','Original NHL analysis.','Original NHL risk.','${other}');
insert into public.community_posts(user_id,sport,title,body,created_at) values('${owner}','nhl','Stored NHL selection',E'Penguins moneyline (+100)\n\nOriginal NHL analysis.\n\nRisk: Original NHL risk.', '2026-10-31T15:01:00Z');
insert into public.community_posts(user_id,sport,title,body) values('${owner}','nfl','Community post','Cash it'),('${other}','nba','Member','My own notes');
insert into public.community_posts(user_id,sport,title,body,card) values('${owner}','nba','3-point volume','Research only','nba-threes:2026-10-31');
grant select,insert on public.community_posts to authenticated,service_role;
create function private.community_post_card_guard()returns trigger language plpgsql as $$begin return new;end $$;
create trigger community_post_card_guard before insert on public.community_posts for each row execute function private.community_post_card_guard();`);
const before = (
  await db.query(
    "select id,title,body,created_at from public.community_posts order by id",
  )
).rows;
const migration = readFileSync(
  "supabase/migrations/20261031190200_zone_automated_cards.sql",
  "utf8",
);
await db.exec(migration);
assert.deepEqual(
  (
    await db.query(
      "select id,title,body,created_at from public.community_posts order by id",
    )
  ).rows,
  before,
);
const rows = (await db.query("select * from public.community_posts")).rows;
assert.equal(rows.filter((x) => x.card === "vq-publication:v1").length, 2);
assert.deepEqual(rows.find((x) => x.sport === "nhl").legs, [
  "Penguins moneyline (+100)",
]);
assert.equal(rows.find((x) => x.body === "Cash it").card, null);
assert.equal(
  rows.find((x) => x.title === "3-point volume").card,
  "nba-threes:2026-10-31",
);
// No private-schema read is evaluated for normal authenticated inserts, including MikeQ.
await db.exec(
  `set role authenticated;insert into public.community_posts(user_id,sport,title,body) values('${owner}','nfl','Manual owner post','Manual text');`,
);
await assert.rejects(
  db.exec(
    `insert into public.community_posts(user_id,sport,title,body,card) values('${owner}','nfl','Fake automation','Fake','vq-publication:v1')`,
  ),
  /Vegas Quant only/,
);
await db.exec(`reset role`);
assert.equal(
  (
    await db.query(
      "select card from public.community_posts where title='Manual owner post'",
    )
  ).rows[0].card,
  null,
);
// Existing server-only publishers run as postgres even when called with a member database role.
await db.exec(`create function public.fixture_publisher()returns void language plpgsql security definer as $$begin
 insert into public.community_posts(user_id,sport,title,body,legs) values('${owner}','nfl','NFL published legs','Stored analysis','["Runner Over 55.5 yards (-110)"]');end $$;
 set role authenticated;select public.fixture_publisher();reset role;`);
const nfl = (
  await db.query(
    "select card,legs from public.community_posts where title='NFL published legs'",
  )
).rows[0];
assert.equal(nfl.card, "vq-publication:v1");
assert.deepEqual(nfl.legs, ["Runner Over 55.5 yards (-110)"]);
// A future journaled selection automatically gains its exact line; no new publishing API is exposed.
await db.exec(`begin;insert into public.sports_games values('00000000-0000-4000-8000-000000000003','ncaab');
 insert into public.sports_selections values('${owner}','College selection',now(),'College analysis.','College risk.','00000000-0000-4000-8000-000000000003');
 insert into public.community_posts(user_id,sport,title,body) values('${owner}','ncaab','College selection',E'College team +3.5 (-110)\n\nCollege analysis.\n\nRisk: College risk.');commit;`);
assert.deepEqual(
  (
    await db.query(
      "select legs from public.community_posts where sport='ncaab'",
    )
  ).rows[0].legs,
  ["College team +3.5 (-110)"],
);
await db.exec(
  `insert into public.community_posts(user_id,sport,title,body) values('${owner}','nba','Automated update','Data review only'),('${other}','nfl','Other server author','Notes');`,
);
assert.deepEqual(
  (
    await db.query(
      "select legs from public.community_posts where title='Automated update'",
    )
  ).rows[0].legs,
  [],
);
assert.equal(
  (
    await db.query(
      "select card from public.community_posts where title='Other server author'",
    )
  ).rows[0].card,
  null,
);
await assert.rejects(
  db.exec(
    `insert into public.community_posts(user_id,sport,title,body,card) values('${other}','nfl','Wrong identity','Notes','vq-publication:v1')`,
  ),
  /identity mismatch/,
);
await db.exec(`set role service_role`);
await assert.rejects(
  db.exec(
    `insert into public.community_posts(user_id,sport,title,body,card) values('${owner}','nfl','Service spoof','Notes','vq-publication:v1')`,
  ),
  /Vegas Quant only/,
);
await db.exec(`reset role`);
assert.equal(
  (
    await db.query(
      "select has_function_privilege('authenticated','private.zone_editorial_leg(uuid,uuid,text,text,text,timestamptz)','execute') ok",
    )
  ).rows[0].ok,
  false,
);
// REST authenticator sessions cannot turn a manual share RPC into an automated owner post.
await db.exec(`create role authenticator login;grant authenticated to authenticator;
 set session authorization authenticator;set role authenticated;select public.fixture_publisher();`);
assert.equal(
  (
    await db.query(
      "select count(*)::int n from public.community_posts where title='NFL published legs' and card is null",
    )
  ).rows[0].n,
  1,
);
await db.close();
console.log(
  "PASS automation provenance, private role guard, exact backfill, future sport cards and unchanged manual/threes posts",
);

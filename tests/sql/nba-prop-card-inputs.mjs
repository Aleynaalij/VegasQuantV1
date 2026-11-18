// NBA prop card inputs: shooting is recorded only when it adds up to the box score; usage and
// defense vs position come out of recorded games. Run: node tests/sql/nba-prop-card-inputs.mjs
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;
create function private.age_member_allowed()returns boolean language sql as $$select true$$;
create function private.immutable()returns trigger language plpgsql as $$begin raise exception 'immutable';end$$;
create table public.nba_games(id uuid primary key,provider_id text unique,away_team text,home_team text,tipoff timestamptz,season integer,season_type integer);
create table public.nba_game_results(game_id uuid primary key references public.nba_games(id));
create table public.nba_player_results(game_id uuid,athlete_id text,player text,team text,played boolean,minutes integer,points integer,rebounds integer,assists integer,threes integer,turnovers integer,position text,primary key(game_id,athlete_id));`);
await db.exec(
  fs.readFileSync(
    "supabase/migrations/20261117120000_nba_prop_card_inputs.sql",
    "utf8",
  ),
);
const G = (n) => `00000000-0000-4000-8000-0000000000a${n}`;
await db.exec(`insert into public.nba_games values
 ('${G(1)}','1','Boston Celtics','New York Knicks',now()-interval '3 days',2027,2),
 ('${G(2)}','2','Miami Heat','Boston Celtics',now()-interval '2 days',2027,2),
 ('${G(3)}','3','Miami Heat','New York Knicks',now()-interval '1 day',2027,2),
 ('${G(4)}','4','Boston Celtics','Miami Heat',now()+interval '1 day',2027,2);
insert into public.nba_game_results values('${G(1)}'),('${G(2)}'),('${G(3)}');
insert into public.nba_player_results values
 -- Game 1: BOS @ NYK. Two players a side.
 ('${G(1)}','1','Celtic Guard','Boston Celtics',true,40,30,4,6,4,4,'G'),('${G(1)}','2','Celtic Center','Boston Celtics',true,8,10,12,1,0,0,'C'),
 ('${G(1)}','3','Knick Guard','New York Knicks',true,36,20,3,8,2,2,'G'),('${G(1)}','4','Knick Bench','New York Knicks',false,null,0,0,0,0,0,'F'),
 -- Game 2: MIA @ BOS.
 ('${G(2)}','1','Celtic Guard','Boston Celtics',true,38,22,5,5,2,3,'G'),('${G(2)}','5','Heat Forward','Miami Heat',true,35,18,9,2,0,1,'F'),
 ('${G(2)}','6','Heat Guard','Miami Heat',true,30,12,2,7,2,2,'G'),
 -- Game 3: MIA @ NYK.
 ('${G(3)}','3','Knick Guard','New York Knicks',true,34,26,4,6,4,3,'G'),('${G(3)}','6','Heat Guard','Miami Heat',true,32,16,3,5,2,1,'G');`);
const rec = async (p) =>
  (
    await db.query(`select private.record_nba_shooting($1::jsonb) r`, [
      JSON.stringify(p),
    ])
  ).rows[0].r;
const s = (id, fgm, fga, ftm, fta) => ({ athlete_id: id, fgm, fga, ftm, fta });

// Unknown and unrecorded games, missing players, and shooting that does not add up to points are refused.
assert.equal(
  (await rec({ provider_id: "9", players: [] })).status,
  "UNKNOWN_GAME",
);
assert.equal((await rec({ provider_id: "4", players: [] })).status, "PENDING");
// Celtic Guard: 30 pts, 4 threes -> 2*fgm + 4 + ftm = 30. 11/22 FG and 4/5 FT adds up; 10 FG does not.
assert.deepEqual(
  await rec({
    provider_id: "1",
    players: [
      s("1", 10, 22, 4, 5),
      s("2", 5, 6, 0, 2),
      s("3", 8, 18, 2, 2),
      s("4", 0, 0, 0, 0),
    ],
  }),
  { status: "MISMATCH", players: 1 },
);
assert.equal(
  (
    await rec({
      provider_id: "1",
      players: [s("1", 11, 22, 4, 5), s("2", 5, 6, 0, 2), s("3", 8, 18, 2, 2)],
    })
  ).status,
  "MISMATCH",
); // bench player missing
assert.equal(
  (
    await rec({
      provider_id: "1",
      players: [
        s("1", 11, 22, 4, 5),
        s("2", 5, 6, 0, 2),
        s("3", 8, 18, 2, 2),
        s("4", 0, 1, 0, 0),
      ],
    })
  ).status,
  "MISMATCH",
); // DNP with an attempt
assert.equal(
  (
    await rec({
      provider_id: "1",
      players: [
        s("1", 11, 10, 4, 5),
        s("2", 5, 6, 0, 2),
        s("3", 8, 18, 2, 2),
        s("4", 0, 0, 0, 0),
      ],
    })
  ).status,
  "MISMATCH",
); // made > attempted
// A failed game waits 12 hours before it is offered again.
assert.deepEqual(
  (
    await db.query(
      `select provider_id from private.nba_shooting_missing(30) order by provider_id`,
    )
  ).rows.map((r) => r.provider_id),
  ["2", "3"],
);
assert.deepEqual(
  await rec({
    provider_id: "1",
    players: [
      s("1", 11, 22, 4, 5),
      s("2", 5, 6, 0, 2),
      s("3", 8, 18, 2, 2),
      s("4", 0, 0, 0, 0),
    ],
  }),
  { status: "RECORDED", players: 4 },
);
assert.equal((await rec({ provider_id: "1", players: [] })).status, "RECORDED");
await assert.rejects(
  db.exec(`update public.nba_player_shooting set fga=1`),
  /immutable/,
);
assert.equal(
  (await db.query(`select count(*)::int n from private.nba_shooting_checks`))
    .rows[0].n,
  0,
);

// Usage for game 1, Celtics: team minutes 48, possessions used (22+2.2+4)+(6+0.88+0)=35.08.
// Celtic Guard: 100*28.2*(48/5)/(40*35.08) = 19.3.
const usage = (
  await db.query(
    `select athlete_id, usage::float u from public.nba_player_usage(array['1','3']) order by athlete_id`,
  )
).rows;
assert.deepEqual(usage, [
  { athlete_id: "1", u: 19.3 },
  { athlete_id: "3", u: 20 },
]);
// Game 2 has no shooting yet, so it has no usage.
assert.equal(
  (
    await db.query(
      `select count(*)::int n from public.nba_player_usage(array['1']) where game_id='${G(2)}'`,
    )
  ).rows[0].n,
  0,
);

// Knick Guard is his team's only player in game 1 (the bench player did not play): 36 of 36 team minutes = 20%.
// Defense vs position, guards: Celtics allowed 20 (g1) + 12 (g2) = 16/game; Knicks 30 + 16 = 23; Heat 22 + 26 = 24.
// Lowest allowed ranks 1; non-guards are ranked separately.
const dvp = (
  await db.query(
    `select team, pos, games, points::float p, points_rank r from public.nba_defense_vs_position(2027) where pos='G' order by r`,
  )
).rows;
assert.deepEqual(
  dvp.map((r) => [r.team, r.games, r.p, r.r]),
  [
    ["Boston Celtics", 2, 16, 1],
    ["New York Knicks", 2, 23, 2],
    ["Miami Heat", 2, 24, 3],
  ],
);
const c = (
  await db.query(
    `select team, points::float p, rebounds::float r, points_rank pr from public.nba_defense_vs_position(2027) where pos='C'`,
  )
).rows;
assert.deepEqual(c, [{ team: "New York Knicks", p: 5, r: 6, pr: 1 }]);
console.log("nba-prop-card-inputs: ok");

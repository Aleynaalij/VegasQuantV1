import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const migration = (name) =>
  readFileSync(
    new URL(`../../supabase/migrations/${name}`, import.meta.url),
    "utf8",
  );
const forward = migration("20261103102100_nba_grade_input_validation.sql");
const propValues = {
  player_points: 30,
  player_rebounds: 5,
  player_assists: 2,
  player_threes: 1,
  player_points_rebounds_assists: 37,
  player_points_rebounds: 35,
  player_points_assists: 32,
  player_rebounds_assists: 7,
};

test("NBA grade validates caller input without changing settlement contracts", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema private; create schema cron; create schema vault; create schema net;
    create function private.immutable() returns trigger language plpgsql as $$ begin raise exception 'immutable'; end $$;
    create function private.has_membership() returns boolean language sql as $$ select true $$;
    create function private.age_member_allowed() returns boolean language sql as $$ select true $$;
    create table public.feed_runs(id serial, provider text, status text, details jsonb, created_at timestamptz default now());
    create table cron.job(jobname text primary key, schedule text, command text);
    create function cron.schedule(n text,s text,c text) returns bigint language sql as $$ insert into cron.job values(n,s,c) returning 1 $$;
    create function cron.unschedule(n text) returns boolean language sql as $$ delete from cron.job where jobname=n returning true $$;
  `);
  await db.exec(migration("20261018060000_nba_source_feed.sql"));
  await db.exec(migration("20261018070000_nba_results.sql"));
  const metadata = async () =>
    (
      await db.query(`select oid, proowner, proacl, prosecdef, provolatile, proconfig
    from pg_proc where oid='public.nba_grade(uuid,text,text,numeric,text)'::regprocedure`)
    ).rows;
  const originalMetadata = await metadata();
  await db.exec(`
    insert into public.nba_games(id, provider_id, slug, away_team, home_team, tipoff, source)
      values ('00000000-0000-0000-0000-000000000001','1','fixture-final','Fixture Away','Fixture Home','2026-01-01','https://example.test/1'),
             ('00000000-0000-0000-0000-000000000002','2','fixture-pending','Fixture Away','Fixture Home','2026-01-01','https://example.test/2');
    insert into public.nba_game_results(game_id, provider_id, away_score, home_score, overtime, fingerprint, source_url, source_hash, first_final_at)
      values ('00000000-0000-0000-0000-000000000001','1',102,100,true,repeat('a',64),'https://www.espn.com/nba/boxscore/_/gameId/1',repeat('b',64),'2026-01-01');
    insert into public.nba_player_results(game_id, athlete_id, player, team, side, played, minutes, points, rebounds, assists, threes, steals, blocks, turnovers)
      values ('00000000-0000-0000-0000-000000000001','1','Fixture Player','Fixture Away','away',true,30,30,5,2,1,1,0,2),
             ('00000000-0000-0000-0000-000000000001','2','Fixture DNP','Fixture Home','home',false,null,0,0,0,0,0,0,0),
             ('00000000-0000-0000-0000-000000000001','3','Ambiguous Player Jr.','Fixture Home','home',true,30,10,5,2,1,1,0,2),
             ('00000000-0000-0000-0000-000000000001','4','Ambiguous Player','Fixture Away','away',true,30,12,5,2,1,1,0,2);
  `);
  const finalId = "00000000-0000-0000-0000-000000000001";
  const pendingId = "00000000-0000-0000-0000-000000000002";
  const grade = async (
    market,
    side,
    point = null,
    player = null,
    game = finalId,
  ) =>
    (
      await db.query("select public.nba_grade($1,$2,$3,$4,$5) grade", [
        game,
        market,
        side,
        point,
        player,
      ])
    ).rows[0].grade;
  const snapshots = async () =>
    (
      await db.query(`select
    (select jsonb_agg(to_jsonb(r) order by game_id) from public.nba_game_results r) games,
    (select jsonb_agg(to_jsonb(r) order by game_id, athlete_id) from public.nba_player_results r) players,
    (select count(*) from private.nba_result_corrections) corrections`)
    ).rows;
  const originalResults = await snapshots();
  await db.exec(forward);

  await t.test(
    "forward replacement is repeatable and preserves function identity, grants and execution attributes",
    async () => {
      assert.deepEqual(await metadata(), originalMetadata);
      await db.exec(forward);
      assert.deepEqual(await metadata(), originalMetadata);
      const grants = (
        await db.query(`select
      has_function_privilege('anon','public.nba_grade(uuid,text,text,numeric,text)','execute') anon,
      has_function_privilege('authenticated','public.nba_grade(uuid,text,text,numeric,text)','execute') authenticated,
      has_function_privilege('service_role','public.nba_grade(uuid,text,text,numeric,text)','execute') service,
      has_table_privilege('anon','public.nba_game_results','update') can_update`)
      ).rows[0];
      assert.deepEqual(grants, {
        anon: true,
        authenticated: true,
        service: true,
        can_update: false,
      });
    },
  );

  await t.test(
    "NULL and unknown markets are rejected before pending or final grading",
    async () => {
      for (const game of [finalId, pendingId]) {
        for (const market of [null, "", "player_blocks", "TOTALS"]) {
          await assert.rejects(
            grade(market, "Over", 6.5, "Fixture Player", game),
            /Unsupported NBA market/,
          );
        }
      }
    },
  );

  await t.test(
    "NULL and invalid directions are rejected for every total/prop market",
    async () => {
      for (const game of [finalId, pendingId]) {
        for (const market of ["totals", ...Object.keys(propValues)]) {
          for (const side of [null, "", "over", "Unknown"]) {
            await assert.rejects(
              grade(market, side, 201.5, "Fixture Player", game),
              /Side must be Over or Under/,
            );
          }
        }
      }
      // An exact-line tie must not disguise a missing direction as PUSH.
      await assert.rejects(
        grade("totals", null, 202),
        /Side must be Over or Under/,
      );
      await assert.rejects(
        grade("player_points", null, 30, "Fixture Player"),
        /Side must be Over or Under/,
      );
    },
  );

  await t.test(
    "existing team, line, player and unknown-game validation remains intact",
    async () => {
      for (const market of ["h2h", "spreads"]) {
        for (const side of [null, "Other Team", "Over"]) {
          await assert.rejects(
            grade(market, side, 2),
            /Side must be one of the two teams/,
          );
        }
      }
      await assert.rejects(grade("totals", "Over"), /Line required/);
      await assert.rejects(grade("spreads", "Fixture Away"), /Line required/);
      await assert.rejects(
        grade("player_points", "Over", 30),
        /Player required/,
      );
      await assert.rejects(
        grade("player_points", "Over", 30, ""),
        /Player required/,
      );
      await assert.rejects(
        grade(
          "h2h",
          "Fixture Away",
          null,
          null,
          "00000000-0000-0000-0000-000000000003",
        ),
        /Unknown NBA game/,
      );
    },
  );

  await t.test(
    "valid public game and player grades retain both directions and pushes",
    async () => {
      await db.exec("set role anon");
      try {
        assert.equal(await grade("h2h", "Fixture Away"), "WIN");
        assert.equal(await grade("h2h", "Fixture Home"), "LOSS");
        assert.equal(await grade("spreads", "Fixture Home", 2.5), "WIN");
        assert.equal(await grade("spreads", "Fixture Away", -2), "PUSH");
        assert.equal(await grade("spreads", "Fixture Away", -2.5), "LOSS");
        for (const [market, value] of [
          ["totals", 202],
          ...Object.entries(propValues),
        ]) {
          for (const side of ["Over", "Under"]) {
            const delta = side === "Over" ? -0.5 : 0.5;
            assert.equal(
              await grade(market, side, value + delta, "Fixture Player"),
              "WIN",
            );
            assert.equal(
              await grade(market, side, value - delta, "Fixture Player"),
              "LOSS",
            );
            assert.equal(
              await grade(market, side, value, "Fixture Player"),
              "PUSH",
            );
          }
        }
        await assert.rejects(
          grade("totals", null, 201.5),
          /Side must be Over or Under/,
        );
      } finally {
        await db.exec("reset role");
      }
    },
  );

  await t.test(
    "pending, no-result, conflict, absent/ambiguous player and explicit DNP stay conservative",
    async () => {
      assert.equal(
        await grade("totals", "Over", 201.5, null, pendingId),
        "PENDING",
      );
      await db.query(
        "insert into public.nba_result_progress(game_id,status,reason) values ($1,'NO_RESULT','Synthetic postponed fixture')",
        [pendingId],
      );
      assert.equal(
        await grade("h2h", "Fixture Away", null, null, pendingId),
        "PENDING",
      );
      assert.equal(
        await grade("player_points", "Over", 0.5, "Fixture DNP"),
        "VOID",
      );
      assert.equal(
        await grade("player_points", "Over", 0.5, "Absent Player"),
        "REVIEW",
      );
      assert.equal(
        await grade("player_points", "Over", 10.5, "Ambiguous Player"),
        "REVIEW",
      );
      await db.query(
        "insert into public.nba_result_progress(game_id,status,reason) values ($1,'CONFLICT','Synthetic correction fixture')",
        [finalId],
      );
      assert.equal(await grade("totals", "Over", 201.5), "REVIEW");
      assert.equal(
        await grade("player_points", "Over", 0.5, "Fixture DNP"),
        "REVIEW",
      );
      await assert.rejects(
        grade("totals", null, 201.5),
        /Side must be Over or Under/,
      );
    },
  );

  await t.test(
    "all grading and forward replacements leave immutable records untouched",
    async () => {
      assert.deepEqual(await snapshots(), originalResults);
      await assert.rejects(
        db.exec("update public.nba_game_results set away_score=0"),
        /immutable/,
      );
      await assert.rejects(
        db.exec("delete from public.nba_player_results"),
        /immutable/,
      );
      assert.deepEqual(await snapshots(), originalResults);
    },
  );
});

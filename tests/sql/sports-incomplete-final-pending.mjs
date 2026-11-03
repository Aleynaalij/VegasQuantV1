import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";

const migration = (name) =>
  readFileSync(
    new URL(`../../supabase/migrations/${name}`, import.meta.url),
    "utf8",
  );
const forward = migration("20261103122858_sports_incomplete_final_pending.sql");
const sports = ["nhl", "ncaab"];
const gameMarkets = (sport) => [
  { market: "h2h", side: "away" },
  { market: "h2h", side: "home" },
  ...(sport === "nhl"
    ? [
        { market: "totals", line: 3, direction: "Over" },
        { market: "totals", line: 3, direction: "Under" },
      ]
    : [
        { market: "spreads", side: "away", line: -1 },
        { market: "spreads", side: "home", line: 1 },
      ]),
];

test("Incomplete persisted finals stay pending without weakening ingestion", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema private; create schema auth;
    grant usage on schema private,auth to anon,authenticated,service_role;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
    create function private.is_admin() returns boolean language sql as $$select current_setting('app.admin',true)='yes'$$;
    create function private.has_membership() returns boolean language sql as $$select current_setting('app.member',true)='yes'$$;
    create function private.age_member_allowed() returns boolean language sql as $$select current_setting('app.age',true)='yes'$$;
    create function private.immutable() returns trigger language plpgsql as $$begin raise exception 'immutable';end$$;
    create table public.feed_runs(provider text,status text,details jsonb,created_at timestamptz default now());
    create table public.community_posts(user_id uuid,sport text,kind text,title text,body text,legs text[]);
  `);
  for (const name of [
    "20261031145407_multisport_backend.sql",
    "20261031152818_multisport_publishing_access.sql",
    "20261031180100_sports_result_retractions.sql",
  ])
    await db.exec(migration(name));

  const metadata = async () =>
    (
      await db.query(`select oid, proowner, proacl, prosecdef, provolatile, proconfig,
        proargtypes, proargnames, prorettype
        from pg_proc where oid='public.sports_grade_market(uuid)'::regprocedure`)
    ).rows;
  const originalMetadata = await metadata();
  const originalWriter = (
    await db.query(
      "select pg_get_functiondef('private.record_sport_result(jsonb)'::regprocedure) definition",
    )
  ).rows;
  const body = '{"synthetic":"no real games, people or records"}';
  const source = {
    url: "https://example.invalid/incomplete-final-fixture",
    body,
    sha256: createHash("sha256").update(body).digest("hex"),
    retrieved_at: new Date().toISOString(),
  };
  const sourceId = (
    await db.query("select private.sports_source($1) id", [source])
  ).rows[0].id;
  const actor = randomUUID();
  await db.query("insert into auth.users values($1)", [actor]);
  let serial = 0;
  const rpc = async (name, input) =>
    (await db.query(`select public.${name}($1) result`, [input])).rows[0]
      .result;
  const seedGame = async (sport, payload, status = "FINAL", result = true) => {
    const id = randomUUID();
    const provider = String(++serial);
    await db.query(
      `insert into public.sports_games(id,sport,provider_id,slug,start_time,payload)
      values($1,$2,$3,$3,now()-interval '5 hours','{}')`,
      [id, sport, provider],
    );
    // Deliberately bypass the validated writer to test a defensive reader path.
    // These malformed persisted rows are synthetic, not a normal ingestion claim.
    if (result)
      await db.query(
        `insert into public.sports_results(game_id,source_id,fingerprint,payload)
        values($1,$2,$3,$4)`,
        [id, sourceId, `synthetic-${id}`, payload],
      );
    if (status !== null)
      await db.query(
        `insert into public.sports_result_progress(game_id,status,reason)
        values($1,$2,'Synthetic fixture')`,
        [id, status],
      );
    return { id, provider, sport };
  };
  const seedMarket = async (game, details, selection = false) => {
    const id = randomUUID();
    await db.query(
      `insert into public.sports_markets(id,game_id,source_id,fingerprint,observed_at,expires_at,payload)
      values($1,$2,$3,$4,now(),now()+interval '1 hour',$5)`,
      [
        id,
        game.id,
        sourceId,
        `synthetic-${id}`,
        { game_id: game.id, sport: game.sport, ...details },
      ],
    );
    if (selection)
      await db.query(
        `insert into public.sports_selections(game_id,market_id,title,why,risk,author_id,expires_at,sources)
        values($1,$2,'Synthetic selection','Fixture rationale','Fixture risk',$3,now(),'[]')`,
        [game.id, id, actor],
      );
    return id;
  };
  const incomplete = [];
  for (const sport of sports)
    for (const field of ["away_score", "home_score"])
      for (const mode of ["missing", "null"])
        for (const market of gameMarkets(sport)) {
          const payload = { away_score: 2, home_score: 1, players: [] };
          if (mode === "missing") delete payload[field];
          else payload[field] = null;
          const game = await seedGame(sport, payload);
          incomplete.push({
            id: await seedMarket(game, market, true),
            label: `${sport} ${field} ${mode} ${JSON.stringify(market)}`,
          });
        }

  const snapshot = async () =>
    (
      await db.query(`select
        (select jsonb_agg(to_jsonb(r) order by game_id) from public.sports_results r) results,
        (select jsonb_agg(to_jsonb(r) order by id) from public.sports_markets r) markets,
        (select jsonb_agg(to_jsonb(r) order by id) from public.sports_selections r) selections,
        (select jsonb_agg(to_jsonb(r) order by id) from private.sports_sources r) sources,
        (select jsonb_agg(to_jsonb(r) order by id) from private.sports_result_corrections r) corrections`)
    ).rows;
  const beforeMigration = await snapshot();
  await db.exec(forward);

  await t.test(
    "replacement preserves function identity, grants, settings, writer and stored evidence",
    async () => {
      assert.deepEqual(await metadata(), originalMetadata);
      assert.deepEqual(await snapshot(), beforeMigration);
      await db.exec(forward);
      assert.deepEqual(await metadata(), originalMetadata);
      assert.deepEqual(await snapshot(), beforeMigration);
      assert.deepEqual(
        (
          await db.query(
            "select pg_get_functiondef('private.record_sport_result(jsonb)'::regprocedure) definition",
          )
        ).rows,
        originalWriter,
      );
      for (const role of ["anon", "authenticated", "service_role"])
        assert.equal(
          (
            await db.query(
              "select has_function_privilege($1,'public.sports_grade_market(uuid)','execute') allowed",
              [role],
            )
          ).rows[0].allowed,
          true,
        );
      for (const role of ["anon", "authenticated"])
        assert.equal(
          (
            await db.query(
              "select has_table_privilege($1,'public.sports_results','insert') allowed",
              [role],
            )
          ).rows[0].allowed,
          false,
        );
    },
  );

  await t.test(
    "missing and JSON-null scores remain pending for both orientations of every game market",
    async () => {
      assert.equal(incomplete.length, 32);
      for (const fixture of incomplete)
        assert.equal(
          await rpc("sports_grade_market", fixture.id),
          "PENDING",
          fixture.label,
        );
    },
  );

  await t.test(
    "record aggregates count incomplete finals as pending instead of losses",
    async () => {
      for (const sport of sports)
        assert.deepEqual(await rpc("sports_records", sport), {
          selections: 16,
          win: 0,
          loss: 0,
          push: 0,
          void: 0,
          pending: 16,
        });
    },
  );

  await t.test(
    "valid zero scores, side orientation, totals direction and spread pushes are retained",
    async () => {
      for (const sport of sports) {
        const game = await seedGame(sport, {
          away_score: 2,
          home_score: 0,
          players: [],
        });
        const cases = [
          [{ market: "h2h", side: "away" }, "WIN"],
          [{ market: "h2h", side: "home" }, "LOSS"],
          ...(sport === "nhl"
            ? [
                [{ market: "totals", line: 1.5, direction: "Over" }, "WIN"],
                [{ market: "totals", line: 1.5, direction: "Under" }, "LOSS"],
                [{ market: "totals", line: 2, direction: "Over" }, "PUSH"],
                [{ market: "totals", line: 2, direction: "Under" }, "PUSH"],
              ]
            : [
                [{ market: "spreads", side: "away", line: -1.5 }, "WIN"],
                [{ market: "spreads", side: "home", line: 1.5 }, "LOSS"],
                [{ market: "spreads", side: "away", line: -2 }, "PUSH"],
                [{ market: "spreads", side: "home", line: 2 }, "PUSH"],
              ]),
        ];
        for (const [market, expected] of cases)
          assert.equal(
            await rpc("sports_grade_market", await seedMarket(game, market)),
            expected,
          );
        const zeroAway = await seedGame(sport, {
          away_score: 0,
          home_score: 2,
          players: [],
        });
        const winner = await seedMarket(zeroAway, {
          market: "h2h",
          side: "home",
        });
        assert.equal(await rpc("sports_grade_market", winner), "WIN");
        await db.exec("set role anon");
        try {
          assert.equal(await rpc("sports_grade_market", winner), "PENDING");
        } finally {
          await db.exec("reset role");
        }
        await db.exec(
          "set app.member='yes'; set app.age='yes'; set role authenticated",
        );
        try {
          assert.equal(await rpc("sports_grade_market", winner), "WIN");
        } finally {
          await db.exec("reset role; set app.member='no'; set app.age='no'");
        }
      }
    },
  );

  await t.test(
    "unrecorded, non-final and conflict outcomes remain pending",
    async () => {
      assert.equal(await rpc("sports_grade_market", randomUUID()), "PENDING");
      for (const sport of sports)
        for (const status of [
          null,
          "AWAITING_FINAL",
          "CONFIRMING",
          "CONFLICT",
          "NO_RESULT",
          "FINAL",
        ])
          for (const payload of [
            { away_score: 2, home_score: 1, players: [] },
            { home_score: 1, players: [] },
          ]) {
            const game = await seedGame(
              sport,
              payload,
              status,
              status !== "FINAL",
            );
            for (const market of gameMarkets(sport))
              assert.equal(
                await rpc(
                  "sports_grade_market",
                  await seedMarket(game, market),
                ),
                "PENDING",
              );
          }
    },
  );

  await t.test(
    "player statistics keep their independent pending, DNP and valid grading contracts",
    async () => {
      for (const market of [
        "player_points",
        "player_goals",
        "player_goal_scorer_anytime",
      ]) {
        const stat = market === "player_points" ? "points" : "goals";
        for (const [players, expected] of [
          [[], "PENDING"],
          [[{ athlete_id: "1", played: true }], "PENDING"],
          [[{ athlete_id: "1", played: true, [stat]: null }], "PENDING"],
          [[{ athlete_id: "1", played: false, [stat]: 0 }], "VOID"],
          [
            [
              {
                athlete_id: "1",
                played: true,
                participation_uncertain: true,
                [stat]: 2,
              },
            ],
            "PENDING",
          ],
          [
            [
              { athlete_id: "1", played: true, [stat]: 2 },
              { athlete_id: "1", played: true, [stat]: 2 },
            ],
            "PENDING",
          ],
          [[{ athlete_id: "1", played: true, [stat]: 2 }], "WIN"],
          [[{ athlete_id: "1", played: true, [stat]: 0 }], "LOSS"],
        ]) {
          // No game scores: valid player results retain their existing independent behavior.
          const game = await seedGame("nhl", { players });
          assert.equal(
            await rpc(
              "sports_grade_market",
              await seedMarket(game, {
                market,
                athlete_id: "1",
                direction: "Over",
                line: 1.5,
              }),
            ),
            expected,
          );
        }
        if (market !== "player_goal_scorer_anytime") {
          const game = await seedGame("nhl", {
            players: [{ athlete_id: "1", played: true, [stat]: 2 }],
          });
          for (const [line, expected] of [
            [2, "PUSH"],
            [2.5, "WIN"],
            [1.5, "LOSS"],
          ])
            assert.equal(
              await rpc(
                "sports_grade_market",
                await seedMarket(game, {
                  market,
                  athlete_id: "1",
                  direction: "Under",
                  line,
                }),
              ),
              expected,
            );
        }
      }
    },
  );

  await t.test(
    "the actual result writer still rejects every missing or JSON-null final score",
    async () => {
      for (const sport of sports) {
        const game = await seedGame(sport, {}, null, false);
        const good = {
          sport,
          provider_id: game.provider,
          completed: true,
          status: "STATUS_FINAL",
          away_score: 2,
          home_score: 1,
          shootout: false,
          source,
          players: [
            {
              athlete_id: "1",
              player: "Synthetic Away",
              side: "away",
              played: true,
              seconds: 1200,
              goals: 2,
              assists: 0,
              points: 2,
            },
            {
              athlete_id: "2",
              player: "Synthetic Home",
              side: "home",
              played: true,
              seconds: 1200,
              goals: 1,
              assists: 0,
              points: 1,
            },
          ],
        };
        for (const field of ["away_score", "home_score"])
          for (const mode of ["missing", "null"]) {
            const input = { ...good };
            if (mode === "missing") delete input[field];
            else input[field] = null;
            const before = await snapshot();
            await assert.rejects(
              rpc("record_sport_result", input),
              /Invalid final/,
            );
            assert.deepEqual(await snapshot(), before);
          }
        assert.equal(
          (await rpc("record_sport_result", good)).status,
          "CONFIRMING",
        );
        assert.equal(
          (
            await db.query(
              "select count(*)::int n from public.sports_results where game_id=$1",
              [game.id],
            )
          ).rows[0].n,
          0,
        );
      }
    },
  );

  await t.test(
    "derived grading never mutates result evidence, selections or original sources",
    async () => {
      const before = await snapshot();
      const markets = (await db.query("select id from public.sports_markets"))
        .rows;
      for (const { id } of markets) await rpc("sports_grade_market", id);
      for (const sport of sports) await rpc("sports_records", sport);
      assert.deepEqual(await snapshot(), before);
      for (const table of [
        "public.sports_results",
        "public.sports_markets",
        "public.sports_selections",
        "private.sports_sources",
      ])
        await assert.rejects(db.exec(`delete from ${table}`), /immutable/);
      assert.deepEqual(await snapshot(), before);
    },
  );
});

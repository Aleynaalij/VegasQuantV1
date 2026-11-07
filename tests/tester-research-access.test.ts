import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = (name: string) =>
  readFileSync(
    new URL(`../supabase/migrations/${name}`, import.meta.url),
    "utf8",
  );
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const batch = "review-testers";
const cutoff = new Date(Date.now() - 15 * 86400_000).toISOString();

test("sealed testers can read only bounded projected research using an eligible live session", async () => {
  const db = new PGlite();
  const first = async <T>(sql: string, args: unknown[] = []) =>
    (await db.query<{ value: T }>(sql, args)).rows[0].value;
  const role = async (
    n: number,
    session: string | null = id(n + 100),
    anonymous = false,
  ) => {
    await db.exec("reset role; set role authenticated");
    await db.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({
        sub: id(n),
        session_id: session,
        is_anonymous: anonymous,
      }),
    ]);
  };
  const status = (feature = "research") =>
    first<boolean>("select public.tester_feature_access($1) value", [feature]);
  const read = (
    sport: string,
    game: string,
    section: string,
    feature = "research",
    cursor: string | null = null,
    after: string | null = null,
  ) =>
    db.query<{
      id: string;
      source: string;
      cursor: string;
      payload: Record<string, unknown>;
    }>(
      "select o.*, o.recorded_at::text as cursor from public.tester_observation_page($1,$2,$3,$4,now(),$5,$6) o",
      [feature, sport, game, section, cursor, after],
    );
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema private;
      grant usage on schema auth, private to anon, authenticated, service_role;
      create function auth.jwt() returns jsonb language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claims',true), '')::jsonb, '{}'::jsonb)
      $$;
      create function auth.uid() returns uuid language sql stable as $$
        select (auth.jwt()->>'sub')::uuid
      $$;
      create table auth.users(id uuid primary key, created_at timestamptz, is_anonymous boolean,
        email_confirmed_at timestamptz, banned_until timestamptz);
      create table auth.sessions(id uuid primary key, user_id uuid references auth.users, not_after timestamptz);
      create table private.account_erasure_jobs(user_id uuid primary key, expires_at timestamptz);
      create table public.games(id uuid primary key, sport text, kickoff timestamptz, kickoff_tbd boolean);
      create table public.nba_games(id uuid primary key, tipoff timestamptz, tipoff_tbd boolean, status text);
      create table public.source_observations(id uuid primary key, game_id uuid, kind text, provider text,
        source text, observed_at timestamptz, recorded_at timestamptz, payload jsonb);
      create table public.nba_observations (like public.source_observations including all);
      create table public.audit_events(id integer);
      alter table public.source_observations enable row level security;
      alter table public.nba_observations enable row level security;
      alter table public.audit_events enable row level security;
      grant select on public.source_observations, public.nba_observations, public.audit_events to authenticated;
      insert into public.audit_events values (1);
    `);
    const age = migration("20261014103812_verified_age_gate.sql").split(
      "create function private.begin_age_check",
    )[0];
    await db.exec(age);
    await db.exec(
      migration("20261107173919_platform_tester_research_access.sql"),
    );

    for (let n = 1; n <= 9; n++) {
      await db.query(
        `insert into auth.users values ($1, $2::timestamptz + $3::interval, $4,
        case when $5 then now() else null end, case when $6 then now()+interval '1 day' else null end)`,
        [
          id(n),
          cutoff,
          n === 2 ? "1 second" : "0 seconds",
          n === 3,
          n !== 4,
          n === 5,
        ],
      );
      await db.query(
        "insert into auth.sessions values ($1,$2,case when $3 then now()-interval '1 second' else null end)",
        [id(n + 100), id(n), n === 6],
      );
    }
    await db.query(
      "insert into private.age_checks(user_id,state,policy_version,consent_version) values ($1,'underage',1,'fixture')",
      [id(7)],
    );
    await db.query(
      "insert into private.account_erasure_jobs values ($1,now()+interval '1 hour')",
      [id(8)],
    );
    await db.query(
      "insert into public.games values ($1,'nfl',now()+interval '1 day',false),($2,'nfl',now()-interval '2 days',false)",
      [id(201), id(203)],
    );
    await db.query(
      "insert into public.nba_games values ($1,now()+interval '1 day',false,'STATUS_SCHEDULED')",
      [id(202)],
    );
    const quote = {
      book: "FanDuel",
      market: "spreads",
      event_id: "fixture",
      secret: "drop",
      outcomes: [{ name: "Team", point: -4, price: -110, private: "drop" }],
    };
    await db.query(
      `insert into public.source_observations values
      ($1,$3,'odds','Feed','https://example.com/quote?token=secret',now()-interval '1 hour',now()-interval '30 minutes',$4),
      ($2,$3,'odds','Feed','https://example.com/quote',now()-interval '1 hour',now()-interval '30 minutes',$4),
      ($5,$3,'odds','Feed','https://example.com/quote',now()-interval '1 hour',now()-interval '30 minutes',$6)`,
      [
        id(301),
        id(302),
        id(201),
        quote,
        id(303),
        { ...quote, market: "unsupported" },
      ],
    );
    await db.query(
      `insert into public.nba_observations values
      ($1,$2,'injury','NBA','https://example.com/injuries',now()-interval '3 days',now()-interval '3 days',$3)`,
      [
        id(304),
        id(202),
        {
          team: "Home",
          player: "A",
          status: "Out",
          detail: { private: "drop" },
          owner_email: "drop",
        },
      ],
    );

    assert.equal(
      Number(
        await first("select private.seal_tester_batch($1,$2) value", [
          batch,
          cutoff,
        ]),
      ),
      7,
    );
    await role(1);
    assert.equal(await status(), false);
    await assert.rejects(
      read("nfl", id(201), "quotes"),
      /Tester feature unavailable/,
    );
    await assert.rejects(
      db.query("select * from private.tester_batch_accounts"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select private.seal_tester_batch($1,$2)", [batch, cutoff]),
      /permission denied/,
    );
    await db.exec("reset role");
    await db.query(
      "update private.tester_batches set enabled_features='{research}' where name=$1",
      [batch],
    );
    await role(1);
    assert.equal(
      await status(),
      false,
      "feature flag alone must not activate the cohort",
    );
    await db.exec("reset role");
    await db.query(
      "update private.tester_batches set canary_user_id=$1 where name=$2",
      [id(1), batch],
    );
    await role(9);
    assert.equal(
      await status(),
      false,
      "only the selected tester can enter canary mode",
    );
    await role(1);
    assert.equal(await status(), true);
    assert.equal(await status("fear"), false);
    assert.equal(await status("admin"), false);
    assert.equal(await status(null as unknown as string), false);
    const rows = (await read("nfl", id(201), "quotes")).rows;
    assert.deepEqual(
      rows.map((x) => x.id),
      [id(301), id(302)],
    );
    assert.deepEqual(rows[0].payload, {
      book: "FanDuel",
      market: "spreads",
      event_id: "fixture",
      outcomes: quote.outcomes.map(({ name, point, price }) => ({
        name,
        point,
        price,
      })),
    });
    assert.equal(rows[0].source, "https://example.com/quote");
    const next = await read(
      "nfl",
      id(201),
      "quotes",
      "research",
      rows[0].cursor,
      rows[0].id,
    );
    assert.deepEqual(
      next.rows.map((x) => x.id),
      [id(302)],
    );
    assert.deepEqual((await read("nba", id(202), "injury")).rows[0].payload, {
      team: "Home",
      player: "A",
      status: "Out",
    });
    assert.equal(
      (await db.query("select * from public.source_observations")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from public.audit_events")).rows.length,
      0,
    );
    await assert.rejects(
      read("nfl", id(202), "quotes"),
      /outside tester research window/,
    );
    await assert.rejects(
      read("nfl", id(203), "quotes"),
      /outside tester research window/,
    );
    await assert.rejects(
      read("nhl", id(201), "quotes"),
      /Invalid tester observation scope/,
    );
    await assert.rejects(
      read("nfl", id(201), "quotes", "research", "2000-01-01Z", id(301)),
      /Cursor outside/,
    );
    await assert.rejects(
      read("nfl", id(201), "quotes", "research", null, id(301)),
      /Invalid tester observation scope/,
    );

    for (const n of [2, 3, 4, 5, 6, 7, 8]) {
      await role(n);
      assert.equal(await status(), false, `user ${n}`);
    }
    await role(1, id(104));
    assert.equal(await status(), false);
    await role(1, "invalid");
    assert.equal(await status(), false);
    await role(1, id(101), true);
    assert.equal(await status(), false);

    await db.exec("reset role");
    await assert.rejects(
      db.query("update private.tester_batches set cutoff=now() where name=$1", [
        batch,
      ]),
      /Sealed tester cohort is immutable/,
    );
    await db.query(
      "update private.tester_batches set canary_only=false where name=$1",
      [batch],
    );
    await role(9);
    assert.equal(await status(), true);
    await assert.rejects(
      db.query("select * from private.tester_batch_audit"),
      /permission denied/,
    );
    await db.exec("reset role; set role anon");
    await assert.rejects(status(), /permission denied/);
    await db.exec("reset role; set role service_role");
    await assert.rejects(status(), /permission denied/);
    await db.exec("reset role");
    await db.query(
      "update private.tester_batch_accounts set revoked_at=now() where batch=$1 and user_id=$2",
      [batch, id(1)],
    );
    await db.query("select private.seal_tester_batch($1,$2)", [batch, cutoff]);
    await assert.rejects(
      db.query("select private.seal_tester_batch($1,now())", [batch]),
      /cutoff does not match/,
    );
    await role(1);
    assert.equal(await status(), false);
    await db.exec("reset role");
    await db.query(
      "update private.tester_batch_accounts set revoked_at=null where batch=$1 and user_id=$2",
      [batch, id(1)],
    );
    await db.query(
      "update private.tester_batches set enabled_features='{}' where name=$1",
      [batch],
    );
    await role(1);
    assert.equal(await status(), false);
    await db.exec("reset role");
    assert.ok(
      Number(
        await first("select count(*) value from private.tester_batch_audit"),
      ) >= 5,
    );
  } finally {
    await db.close();
  }
});

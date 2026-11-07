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
const testerSql = migration(
  "20261107173919_platform_tester_research_access.sql",
);
const statement = (sql: string, pattern: RegExp) => {
  const match = sql.match(pattern);
  assert.ok(match, `Migration statement missing: ${pattern}`);
  return match[0];
};

test("sealed testers can read only bounded projected research using an eligible live session", async () => {
  const db = new PGlite();
  const first = async <T>(sql: string, args: unknown[] = []) =>
    (await db.query<{ value: T }>(sql, args)).rows[0].value;
  const role = async (
    n: number,
    session: string | null = id(n + 100),
    anonymous = false,
    aal = "aal1",
  ) => {
    await db.exec("reset role; set role authenticated");
    await db.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({
        sub: id(n),
        session_id: session,
        is_anonymous: anonymous,
        aal,
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
  const asOperator = async <T>(operation: () => Promise<T>) => {
    await db.exec("set session authorization tester_migrator");
    try {
      return await operation();
    } finally {
      await db.exec("set session authorization postgres");
    }
  };
  const assertNoOperationContext = async () =>
    assert.equal(
      Number(
        await first(
          "select count(*) value from private.tester_operation_context",
        ),
      ),
      0,
      "operator reason must not survive the call",
    );
  const seal = (at = cutoff, reason = "Fixture snapshot") =>
    first<string>("select private.seal_tester_batch($1,$2,$3) value", [
      batch,
      at,
      reason,
    ]);
  const configure = (
    features: string[],
    canary: string | null,
    canaryOnly = true,
    reason = "Fixture configuration",
  ) =>
    db.query("select private.configure_tester_batch($1,$2,$3,$4,$5)", [
      batch,
      features,
      canaryOnly,
      canary,
      reason,
    ]);
  const revoke = (
    n: number,
    revoked: boolean,
    reason = "Fixture grant change",
  ) =>
    db.query("select private.set_tester_revoked($1,$2,$3,$4)", [
      batch,
      id(n),
      revoked,
      reason,
    ]);
  const deniedFeature = async (feature: string, label: string) => {
    const allowed = await status(feature);
    const projected = await read("nfl", id(201), "quotes", feature).then(
      () => true,
      (error: { code: string }) => {
        assert.equal(
          error.code,
          "42501",
          `${label}: ${feature} observation RPC SQLSTATE`,
        );
        return false;
      },
    );
    assert.deepEqual(
      { allowed, projected },
      { allowed: false, projected: false },
      `${label}: ${feature} entitlement and observation RPC`,
    );
  };
  const denied = async (label: string) => {
    for (const feature of ["research", "fear"])
      await deniedFeature(feature, label);
  };
  const member = () =>
    first<{ allowed: boolean; admin: boolean; complimentary_premium: boolean }>(
      "select public.membership_status() value",
    );
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create role tester_migrator nosuperuser bypassrls;
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
      create table auth.sessions(id uuid primary key, user_id uuid references auth.users on delete cascade, not_after timestamptz);
      create table private.admin_users(user_id uuid primary key);
      create table private.memberships(user_id uuid, starts_at timestamptz, expires_at timestamptz, revoked_at timestamptz);
      create table private.billing_subscriptions(user_id uuid, blocked boolean, paid_until timestamptz);
      create table private.account_erasure_jobs(user_id uuid primary key, expires_at timestamptz);
      create table public.games(id uuid primary key, sport text, kickoff timestamptz, kickoff_tbd boolean);
      create table public.nba_games(id uuid primary key, tipoff timestamptz, tipoff_tbd boolean, status text);
      create table public.source_observations(id uuid primary key, game_id uuid, kind text, provider text,
        source text, observed_at timestamptz, recorded_at timestamptz, payload jsonb);
      create table public.nba_observations (like public.source_observations including all);
      create table public.audit_events(id integer);
      create table public.personal_entries(id integer, user_id uuid);
      alter table public.source_observations enable row level security;
      alter table public.nba_observations enable row level security;
      alter table public.audit_events enable row level security;
      alter table public.personal_entries enable row level security;
      grant select on public.source_observations, public.nba_observations, public.audit_events, public.personal_entries to authenticated;
      insert into public.audit_events values (1);
    `);
    const billing = migration("20261001124054_subscription_billing.sql");
    const memberSql = migration("20260930133259_membership_and_payments.sql");
    const release = migration("20261001130201_release_hardening.sql");
    const initial = migration("20260930111253_vegas_quant_initial.sql");
    const nfl = migration("20261001125014_source_feeds.sql");
    const nba = migration("20261018060000_nba_source_feed.sql");
    await db.exec(
      [
        statement(
          memberSql,
          /create or replace function private\.is_admin\(\)[\s\S]*?\$\$;/,
        ),
        statement(
          billing,
          /create or replace function private\.has_membership\(\)[\s\S]*?\$\$;/,
        ),
        statement(
          release,
          /create or replace function private\.membership_status\(\)[\s\S]*?\$\$;/,
        ),
        statement(
          memberSql,
          /create function public\.membership_status\(\)[\s\S]*?\$\$;/,
        ),
        statement(initial, /create function public\.is_admin\(\)[\s\S]*?\$\$;/),
        statement(
          nfl,
          /create policy member_read on public\.source_observations[^;]+;/,
        ),
        statement(
          nba,
          /create policy member_read on public\.nba_observations[^;]+;/,
        ),
      ].join("\n"),
    );
    const auditPolicy = statement(
      memberSql,
      /create policy member_read on public\.%I for select[^']+/,
    );
    await db.exec(auditPolicy.replace("%I", "audit_events"));
    const personal = migration("20260930223839_personal_challenge_entries.sql");
    const ownerPolicy = statement(
      personal,
      /create policy owner_read on public\.%I for select[^']+/,
    );
    await db.exec(ownerPolicy.replace("%I", "personal_entries"));
    await db.query("insert into public.personal_entries values (1,$1),(2,$2)", [
      id(1),
      id(9),
    ]);
    const age = migration("20261014103812_verified_age_gate.sql").split(
      "create function private.begin_age_check",
    )[0];
    await db.exec(age);
    await db.exec(
      statement(
        migration("20261014103812_verified_age_gate.sql"),
        /do \$\$declare t record;begin[\s\S]*?end \$\$;/,
      ),
    );
    await db.exec(
      statement(
        migration("20261014103812_verified_age_gate.sql"),
        /do \$\$declare f record;args text;result text;oldname text;body text;begin[\s\S]*?end \$\$;/,
      ),
    );
    await db.exec(
      migration("20261014180409_existing_accounts_complimentary_premium.sql"),
    );
    await db.exec(`
      grant usage, create on schema private, public to tester_migrator;
      grant usage on schema auth to tester_migrator;
      grant select, references on auth.users to tester_migrator;
      grant select on auth.sessions, private.account_erasure_jobs, public.games, public.nba_games,
        public.source_observations, public.nba_observations to tester_migrator;
      grant execute on function private.age_member_allowed() to tester_migrator;
    `);
    await asOperator(async () => {
      // Match the hosted SQL connection's role attributes, not Supabase's exact runner.
      assert.deepEqual(
        await first(
          "select jsonb_build_object('same_role', current_user=session_user, 'superuser', rolsuper, 'bypassrls', rolbypassrls) value from pg_roles where rolname=current_user",
        ),
        { same_role: true, superuser: false, bypassrls: true },
      );
      await assert.rejects(
        db.exec(`
          create function private.repro_tester_reason() returns void
          language plpgsql security invoker set search_path = ''
          set vq.tester_operation_reason = '' as $$ begin return; end $$;
        `),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.equal((error as Error & { code?: string }).code, "42501");
          assert.equal(
            error.message,
            'permission denied to set parameter "vq.tester_operation_reason"',
          );
          return true;
        },
      );
      await db.exec(testerSql);
      assert.equal(
        Number(
          await first("select count(*) value from private.tester_batches"),
        ),
        0,
      );
      await assertNoOperationContext();
    });

    for (let n = 1; n <= 14; n++) {
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

    await db.query(
      "insert into private.billing_subscriptions values ($1,false,now()+interval '1 day')",
      [id(13)],
    );
    await db.query(
      "insert into private.existing_member_premium(user_id) values ($1)",
      [id(14)],
    );
    await db.query("insert into private.admin_users values ($1)", [id(12)]);
    await asOperator(async () => {
      await assert.rejects(seal(cutoff, ""), /requires a reason/);
      await assert.rejects(seal(cutoff, "x".repeat(241)), /requires a reason/);
      await assert.rejects(
        seal(new Date(Date.now() + 60_000).toISOString()),
        /historical cutoff/,
      );
      await db.exec("begin");
      try {
        assert.equal(Number(await seal()), 12);
        await assertNoOperationContext();
        await db.exec("savepoint invalid_canary");
        await assert.rejects(
          configure(["research"], id(2)),
          /Canary must be an account/,
        );
        await db.exec("rollback to savepoint invalid_canary");
        await assertNoOperationContext();
        await configure(["research"], null);
        await configure([], null);
        await assertNoOperationContext();
        await db.exec("commit");
      } catch (error) {
        await db.exec("rollback");
        throw error;
      }
    });
    const configureSql = statement(
      testerSql,
      /create function private\.configure_tester_batch\([\s\S]*?end \$\$;/,
    );
    const withoutCleanup = configureSql.replace(
      "delete from private.tester_operation_context where transaction_id = pg_catalog.pg_current_xact_id();",
      "",
    );
    assert.notEqual(
      withoutCleanup,
      configureSql,
      "cleanup mutation must change the operator",
    );
    await db.exec("begin");
    try {
      await db.exec(
        withoutCleanup.replace("create function", "create or replace function"),
      );
      await configure(["research"], null);
      await assert.rejects(
        assertNoOperationContext,
        /operator reason must not survive the call/,
      );
    } finally {
      await db.exec("rollback");
    }
    await assertNoOperationContext();
    await db.query("delete from auth.sessions where id=$1", [id(110)]);
    // This account was nonanonymous at the snapshot, so exercise the live record predicate.
    await db.query("update auth.users set is_anonymous=true where id=$1", [
      id(11),
    ]);
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
    await assert.rejects(seal(), /permission denied/);
    await db.exec("reset role");
    await configure(["research"], null);
    await role(1);
    assert.equal(
      await status(),
      false,
      "feature flag alone must not activate the cohort",
    );
    await db.exec("reset role");
    await assert.rejects(
      configure(["research"], id(2)),
      /Canary must be an account/,
    );
    await configure(["research"], id(1));
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
    assert.equal(
      (await db.query("select * from public.nba_observations")).rows.length,
      0,
    );
    assert.deepEqual(
      (await db.query("select id from public.personal_entries")).rows,
      [{ id: 1 }],
    );
    assert.equal((await member()).allowed, false);
    assert.equal(await first("select public.is_admin() value"), false);
    await role(1, id(101), false, "aal2");
    assert.equal(
      await first("select public.is_admin() value"),
      false,
      "MFA alone cannot create admin",
    );
    await role(1);
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

    await db.exec("reset role");
    await configure(["research", "fear"], id(1));
    await db.query(
      `insert into public.nba_observations values
      ($1,$2,'injury','NBA','https://example.com/injuries',now()-interval '4 days',now()-interval '2 days',$3)`,
      [id(305), id(202), { team: "Home", player: "A", status: "Questionable" }],
    );
    await role(1);
    assert.deepEqual(
      (await read("nba", id(202), "injury", "fear")).rows.map((x) => x.id),
      [id(304), id(305)],
    );
    await assert.rejects(
      read("nfl", id(201), "context", "fear"),
      /Invalid tester observation scope/,
    );

    await db.exec("reset role");
    await configure(["research", "fear"], null, false);
    await role(9);
    assert.equal(
      await status(),
      true,
      "ordinary testers can enter when the cohort is enabled",
    );
    assert.ok((await read("nfl", id(201), "quotes")).rows.length);
    const negativeCases = [
      ["post-cutoff account", 2],
      ["anonymous at snapshot", 3],
      ["unconfirmed email", 4],
      ["active ban", 5],
      ["expired session", 6],
      ["underage account", 7],
      ["pending erasure", 8],
      ["deleted session", 10],
      ["anonymous auth account", 11],
    ] as const;
    for (const [label, n] of negativeCases) {
      await role(n);
      await denied(label);
    }
    await role(1, id(104));
    await denied("session belongs to another account");
    await role(1, "invalid");
    await denied("malformed session ID");
    await role(1, null);
    await denied("missing session ID");
    await role(1, id(101), true);
    await denied("anonymous JWT claim");

    await db.exec("reset role");
    await db.query("update private.age_policy set enforced=true");
    await db.query(
      "insert into private.age_checks(user_id,state,policy_version,consent_version) values ($1,'verified',1,'fixture')",
      [id(1)],
    );
    await role(1);
    assert.equal(
      await status(),
      true,
      "current age verification allows the eligible tester",
    );
    await role(9);
    await denied("missing verification under age enforcement");
    await db.exec("reset role");
    await db.query("update private.age_policy set enforced=false");

    await assert.rejects(
      db.query("update private.tester_batches set cutoff=now() where name=$1", [
        batch,
      ]),
      /Sealed tester cohort is immutable/,
    );
    await assert.rejects(
      db.query(
        "insert into private.tester_batch_accounts(batch,user_id) values ($1,$2)",
        [batch, id(2)],
      ),
      /Sealed tester roster cannot gain accounts/,
    );
    await assert.rejects(
      db.query(
        "update private.tester_batch_accounts set user_id=$3 where batch=$1 and user_id=$2",
        [batch, id(9), id(2)],
      ),
      /Tester grant identity is immutable/,
    );
    await assert.rejects(
      db.query(
        "delete from private.tester_batch_accounts where batch=$1 and user_id=$2",
        [batch, id(9)],
      ),
      /only be removed by auth account deletion/,
    );
    await assert.rejects(
      db.query(
        "update private.tester_batches set enabled_features='{}' where name=$1",
        [batch],
      ),
      /requires a reason/,
    );
    await db.exec(
      "select set_config('vq.tester_operation_reason', 'Forged audit reason', false)",
    );
    await assert.rejects(
      db.query(
        "update private.tester_batches set enabled_features='{}' where name=$1",
        [batch],
      ),
      /requires a reason/,
    );
    await db.exec("select set_config('vq.tester_operation_reason', '', false)");
    await assert.rejects(
      db.exec("truncate private.tester_batch_accounts"),
      /history is retained/,
    );
    await assert.rejects(
      db.exec("delete from private.tester_batch_audit"),
      /history is retained/,
    );

    await role(9);
    await assert.rejects(
      db.query(
        "insert into private.tester_operation_context(reason) values ('spoofed')",
      ),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select private.begin_tester_operation('spoofed')"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select * from private.tester_batch_audit"),
      /permission denied/,
    );
    await assert.rejects(configure([], null), /permission denied/);
    await assert.rejects(revoke(9, true), /permission denied/);
    for (const dbRole of ["anon", "service_role"]) {
      await db.exec(`reset role; set role ${dbRole}`);
      await assert.rejects(status(), /permission denied/);
      await assert.rejects(read("nfl", id(201), "quotes"), /permission denied/);
      await assert.rejects(configure([], null), /permission denied/);
    }
    await db.exec("reset role");
    await asOperator(async () => {
      await revoke(1, true, "Revoke fixture account");
      await assertNoOperationContext();
    });
    const countAudit = () =>
      first<string>("select count(*) value from private.tester_batch_audit");
    const beforeReplay = await countAudit();
    await seal();
    await revoke(1, true);
    assert.equal(
      await countAudit(),
      beforeReplay,
      "no-op replay or repeat revocation must not add audit rows",
    );
    await assert.rejects(
      seal(new Date(Date.parse(cutoff) + 1000).toISOString()),
      /cutoff does not match/,
    );
    await role(1);
    await denied("revoked tester grant");

    const functionSql = statement(
      testerSql,
      /create function private\.tester_feature_access\(p_feature text\)[\s\S]*?end \$\$;/,
    );
    const mutants = [
      ["unconfirmed email", 4, "u.email_confirmed_at is not null and ", ""],
      [
        "active ban",
        5,
        "and (u.banned_until is null or u.banned_until <= now())",
        "",
      ],
      [
        "expired session",
        6,
        "and (s.not_after is null or s.not_after > now())",
        "",
      ],
      [
        "pending erasure",
        8,
        /and not exists \(\s*select 1 from private\.account_erasure_jobs[\s\S]*?\n      \)/,
        "",
      ],
      ["underage account", 7, "and private.age_member_allowed()", ""],
      [
        "missing verification under age enforcement",
        9,
        "and private.age_member_allowed()",
        "",
      ],
      [
        "deleted session",
        10,
        "join auth.sessions s",
        "left join auth.sessions s",
      ],
      ["wrong session owner", 9, "s.user_id = u.id and ", ""],
      [
        "anonymous auth account",
        11,
        "and not coalesce(u.is_anonymous, false)",
        "",
      ],
      ["anonymous JWT claim", 9, "or auth.jwt()->>'is_anonymous' = 'true'", ""],
      ["revoked tester grant", 1, "and a.revoked_at is null", ""],
    ] as const;
    for (const [label, n, predicate, replacement] of mutants) {
      await db.exec("reset role; begin");
      try {
        const weakened = functionSql.replace(predicate, replacement);
        assert.notEqual(
          weakened,
          functionSql,
          `Missing mutation target: ${label}`,
        );
        await db.exec(
          weakened.replace("create function", "create or replace function"),
        );
        if (label === "missing verification under age enforcement") {
          await db.query("update private.age_policy set enforced=true");
        }
        await role(
          n,
          label === "wrong session owner" ? id(104) : id(n + 100),
          label === "anonymous JWT claim",
        );
        for (const feature of ["research", "fear"]) {
          await assert.rejects(
            deniedFeature(feature, label),
            (error: unknown) => {
              assert.ok(error instanceof assert.AssertionError);
              assert.equal(
                error.message.split("\n")[0],
                `${label}: ${feature} entitlement and observation RPC`,
              );
              assert.deepEqual(error.actual, {
                allowed: true,
                projected: true,
              });
              return true;
            },
          );
        }
      } finally {
        await db.exec("rollback; reset role");
      }
    }

    await revoke(1, false, "Restore fixture account");
    await role(1);
    assert.equal(await status(), true);
    for (const n of [13, 14]) {
      await role(n);
      assert.equal((await member()).allowed, true);
      assert.equal((await member()).complimentary_premium, n === 14);
      assert.ok(
        (await db.query("select * from public.source_observations")).rows
          .length,
      );
    }
    await role(12);
    assert.equal(
      await first("select public.is_admin() value"),
      false,
      "admin requires MFA",
    );
    await role(12, id(112), false, "aal2");
    assert.equal(await first("select public.is_admin() value"), true);
    await db.exec("reset role");
    await configure(["research"], id(9));
    await db.query("delete from auth.users where id=$1", [id(9)]);
    const erased = (
      await db.query<{
        reason: string;
        operation: string;
        before_state: Record<string, unknown>;
      }>(
        "select reason,operation,before_state from private.tester_batch_audit where reason='Auth account deletion'",
      )
    ).rows;
    assert.deepEqual(erased.map((entry) => entry.operation).sort(), [
      "tester_batch_accounts.delete",
      "tester_batches.update",
    ]);
    assert.ok(erased.every((entry) => !JSON.stringify(entry).includes(id(9))));
    assert.ok(
      erased.find((entry) => entry.operation === "tester_batch_accounts.delete")
        ?.before_state.grant_id,
    );
    assert.equal(
      Number(await seal()),
      11,
      "same cutoff replay preserves removal",
    );
    await configure(["research", "fear"], null, false);
    await role(9);
    await denied("deleted account with stale JWT");
    await db.exec("reset role");
    await asOperator(async () => {
      await configure([], null, true, "Fixture rollback");
      await assertNoOperationContext();
    });
    await role(1);
    await denied("disabled tester batch");
    for (const n of [13, 14]) {
      await role(n);
      assert.equal(
        (await member()).allowed,
        true,
        "rollback preserves independent entitlements",
      );
      assert.ok(
        (await db.query("select * from public.source_observations")).rows
          .length,
      );
    }
    await db.exec("reset role");
    const audit = (
      await db.query<{
        reason: string;
        operation: string;
        actor: string;
        before_state: unknown;
        after_state: unknown;
      }>(
        "select reason,operation,actor,before_state,after_state from private.tester_batch_audit order by id",
      )
    ).rows;
    assert.ok(
      audit.some(
        (entry) =>
          entry.reason === "Fixture snapshot" &&
          entry.operation === "tester_batch_accounts.insert" &&
          entry.before_state === null &&
          entry.actor === "tester_migrator",
      ),
    );
    assert.ok(
      audit.some(
        (entry) =>
          entry.reason === "Revoke fixture account" &&
          entry.operation === "tester_batch_accounts.update" &&
          entry.before_state &&
          entry.after_state,
      ),
    );
    assert.ok(
      audit.some(
        (entry) =>
          entry.reason === "Restore fixture account" &&
          entry.operation === "tester_batch_accounts.update",
      ),
    );
    assert.ok(
      audit.some(
        (entry) =>
          entry.reason === "Fixture rollback" &&
          entry.operation === "tester_batches.update",
      ),
    );
  } finally {
    await db.close();
  }
});

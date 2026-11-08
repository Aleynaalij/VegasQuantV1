import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Run from repository root. Real repository SQL supplies safety, profile/rate,
// block, restriction, age/session and actor guards, not permissive guard stubs.
// Fixture seams: Supabase auth.uid/jwt, auth tables, is_admin=false, storage
// metadata, erasure table. Unrelated billing, notification and upload systems
// are intentionally not installed. This is database regression, not UI/E2E.
const db = new PGlite();
const sql = (name) => fs.readFileSync(`supabase/migrations/${name}`, "utf8");
const section = (text, start, end) => {
  const a = text.indexOf(start),
    b = text.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `Missing repository SQL section: ${start}`);
  return text.slice(a, b);
};
const A = randomUUID(),
  B = randomUUID(),
  session = randomUUID();
const safetyError =
  "Remove harmful content, executable links or guaranteed-return claims";
const safetyReject = (error) => error.message === safetyError;
const as = async (user, query, args = [], role = "authenticated") => {
  await db.exec("reset role");
  await db.query("select set_config('test.uid',$1,false)", [user]);
  await db.exec(`set role ${role}`);
  try {
    return (await db.query(query, args)).rows;
  } finally {
    await db.exec("reset role");
  }
};
const create = (
  id,
  question,
  options,
  body = "Harmless discussion",
  user = A,
) =>
  as(
    user,
    "select public.create_community_poll_post($1,'nfl',$2,null,$3,$4::jsonb)",
    [id, body, question, JSON.stringify(options)],
  );
const direct = (id, question, options, user = A) =>
  as(
    user,
    "insert into public.community_polls(post_id,question,options) values($1,$2,$3::jsonb)",
    [id, question, JSON.stringify(options)],
  );
const post = (id, user = A, body = "Harmless discussion") =>
  as(
    user,
    "insert into public.community_posts(id,user_id,sport,kind,title,body) values($1,$2,'nfl','talk','Community poll',$3)",
    [id, user, body],
  );
const clear = () => db.exec("delete from public.community_posts");
const counts = async (id) =>
  (
    await db.query(
      `select
  (select count(*)::int from public.community_posts where id=$1) posts,
  (select count(*)::int from public.community_polls where post_id=$1) polls`,
      [id],
    )
  ).rows[0];
const rejectRpc = async (question, options, expected, body, user = A) => {
  const id = randomUUID();
  await assert.rejects(create(id, question, options, body, user), expected);
  assert.deepEqual(
    await counts(id),
    { posts: 0, polls: 0 },
    "failed RPC must leave neither post nor poll",
  );
};
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private; create schema storage;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id','${session}')$$;
    create table auth.users(id uuid primary key,email_confirmed_at timestamptz,banned_until timestamptz);
    create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
    create function public.is_admin() returns boolean language sql stable as $$select false$$;
    create table public.game_comments(id uuid,user_id uuid,body text);
    create table private.account_erasure_jobs(user_id uuid,expires_at timestamptz);
    create table storage.objects(bucket_id text,name text,owner_id text);
    grant usage on schema auth,private,storage to authenticated;
    grant select on storage.objects to authenticated;
    insert into auth.users values('${A}',now(),null),('${B}',now(),null);
    insert into auth.sessions values('${session}','${A}',null);`);
  await db.exec(
    section(
      sql("20261003112128_community_profiles.sql"),
      "create table public.community_profiles",
      "-- Deliberate opt-in disclosure",
    ),
  );
  await db.exec(`insert into public.community_profiles(user_id,username,avatar,visible) values
    ('${A}','TestAuthor','data:image/jpeg;base64,YQ==',true),
    ('${B}','TestReader','data:image/jpeg;base64,Yg==',true)`);
  await db.exec(sql("20261014025802_community_social_feed.sql"));
  await db.exec(sql("20261014041536_launch_safety_controls.sql"));
  const age = sql("20261014103812_verified_age_gate.sql");
  await db.exec(
    section(
      age,
      "create table private.age_policy",
      "create function private.age_verification_status",
    ),
  );
  await db.exec(
    section(
      age,
      "do $$declare t record;begin",
      "-- SECURITY DEFINER member RPCs",
    ),
  );
  await db.exec(
    "alter table public.community_posts add column photo_path text",
  );
  await db.exec(
    section(
      sql("20261014162515_community_post_photos.sql"),
      "create or replace function private.prepare_member_publication()",
      "create or replace function private.begin_account_erasure",
    ),
  );
  await db.exec(
    section(
      sql("20261103181103_community_typed_reactions.sql"),
      "create function private.community_reaction_actor_allowed()",
      "-- Covers old direct inserts",
    ),
  );
  await db.exec(sql("20261108162552_community_polls.sql"));
  const oldSafety = (
    await db.query(
      "select pg_get_functiondef('private.community_safety_check()'::regprocedure) definition",
    )
  ).rows[0];
  const fixes = fs
    .readdirSync("supabase/migrations")
    .filter((n) => n.endsWith("_community_poll_safety.sql"))
    .sort();
  assert.ok(fixes.length > 0, "Poll content-safety migration must exist");
  for (const name of fixes) await db.exec(sql(name));
  assert.deepEqual(
    (
      await db.query(
        "select pg_get_functiondef('private.community_safety_check()'::regprocedure) definition",
      )
    ).rows[0],
    oldSafety,
    "existing safety trigger must not be changed by poll hotfix",
  );

  // Every regex alternative, both risk separators, lowercase/uppercase/mixed
  // case, every option position, and question with a harmless nonempty body.
  const prohibited = [
    "guaranteed profit",
    "guaranteed returns",
    "guaranteed win",
    "risk-free bet",
    "risk free bet",
    "risk-free profit",
    "risk free profit",
    "kill yourself",
    "i will kill you",
    "javascript:",
    "<script",
  ];
  let checks = 0;
  for (const term of prohibited)
    for (const bad of [
      term,
      term.toUpperCase(),
      [...term].map((c, i) => (i % 2 ? c.toUpperCase() : c)).join(""),
    ]) {
      // Confirm this exact sample is rejected by the real preexisting guard.
      await rejectRpc("Harmless question?", ["One", "Two"], safetyReject, bad);
      for (let position = -1; position < 4; position++) {
        const question = position < 0 ? `  ${bad}  ` : "Harmless question?";
        const options = ["One", "Two", "Three", "Four"];
        if (position >= 0) options[position] = ` ${bad} `;
        await rejectRpc(question, options, safetyReject);
        const id = randomUUID();
        await post(id);
        await assert.rejects(direct(id, question, options), safetyReject);
        assert.deepEqual(
          await counts(id),
          { posts: 1, polls: 0 },
          "direct insert must not create unsafe poll",
        );
        await clear();
        checks += 2;
      }
    }

  for (const path of ["rpc", "direct"]) {
    const id = randomUUID();
    if (path === "direct") await post(id);
    await (path === "rpc" ? create : direct)(id, "  Who wins tonight?  ", [
      "  BoStOn  ",
      " MiAmI ",
    ]);
    assert.deepEqual(
      (
        await db.query(
          "select question,options from public.community_polls where post_id=$1",
          [id],
        )
      ).rows[0],
      { question: "Who wins tonight?", options: ["BoStOn", "MiAmI"] },
    );
    assert.deepEqual(await counts(id), { posts: 1, polls: 1 });
    await clear();
  }
  for (const [q, options, expected] of [
    ["Q", ["one"], /check constraint/],
    ["Q", ["a", "b", "c", "d", "e"], /check constraint/],
    ["Q", [], /not-null|check constraint/],
    ["Q", {}, /scalar|object/],
    ["Q", ["Same", " same "], /Poll options must be different/],
    ["Q", ["  ", "b"], /Poll options must be 1-60 characters/],
    ["Q", ["x".repeat(61), "b"], /Poll options must be 1-60 characters/],
    ["Q", ["a", 2], /Poll options must be text/],
    ["Q", ["a", null], /Poll options must be text/],
    ["  ", ["a", "b"], /check constraint/],
    ["Q".repeat(141), ["a", "b"], /check constraint/],
  ]) {
    await rejectRpc(q, options, expected);
    const id = randomUUID();
    await post(id);
    await assert.rejects(direct(id, q, options), expected);
    assert.deepEqual(await counts(id), { posts: 1, polls: 0 });
    await clear();
  }
  // Boundary lengths, maximum option count and body fallback remain supported.
  const boundary = randomUUID();
  await create(boundary, "Q".repeat(140), ["a", "b".repeat(60), "c", "d"], "");
  assert.equal(
    (
      await db.query("select body from public.community_posts where id=$1", [
        boundary,
      ])
    ).rows[0].body,
    "Q".repeat(140),
  );
  await assert.rejects(
    create(randomUUID(), "Q", ["a", "b"]),
    /Wait thirty seconds/,
  );
  await clear();

  // Existing safety/restriction and profile checks still govern RPC creation.
  await db.query(
    "insert into private.community_restrictions(user_id,reason) values($1,$2)",
    [A, "Test restriction"],
  );
  await rejectRpc("Q", ["a", "b"], /Community posting restricted/);
  await db.exec("delete from private.community_restrictions");
  await db.query(
    "update public.community_profiles set visible=false where user_id=$1",
    [A],
  );
  await rejectRpc(
    "Q",
    ["a", "b"],
    /Complete and enable your community profile/,
  );
  await db.query(
    "update public.community_profiles set visible=true where user_id=$1",
    [A],
  );
  await rejectRpc("Q", ["a", "b"], /Sign in as the author/, undefined, "");
  await assert.rejects(
    as(
      A,
      "select public.create_community_poll_post($1,'nfl','body',null,'Q','[\"a\",\"b\"]')",
      [randomUUID()],
      "anon",
    ),
    /permission denied/,
  );

  // Real age policy: verified user and live matching session succeed; expired
  // session and underage state deny. Profile RLS may reject before post RLS.
  await db.exec("update private.age_policy set enforced=true");
  await rejectRpc("Q", ["a", "b"], /profile|row-level security/);
  await db.query(
    "insert into private.age_checks(user_id,state,policy_version,consent_version) values($1,'verified',1,'test')",
    [A],
  );
  const verified = randomUUID();
  await create(verified, "Q", ["a", "b"]);
  await clear();
  await db.exec("update auth.sessions set not_after=now()-interval '1 minute'");
  await rejectRpc("Q", ["a", "b"], /profile|row-level security/);
  await db.exec(
    "update auth.sessions set not_after=null; update private.age_checks set state='underage'",
  );
  await rejectRpc("Q", ["a", "b"], /profile|row-level security/);
  await db.exec(
    "delete from private.age_checks; update private.age_policy set enforced=false",
  );

  // Real block visibility, owner and creation-window RLS are retained.
  const owned = randomUUID();
  await post(owned);
  await assert.rejects(direct(owned, "Q", ["a", "b"], B), /row-level security/);
  await direct(owned, "Q", ["a", "b"]);
  await db.query(
    "insert into public.member_blocks(user_id,target_user_id) values($1,$2)",
    [A, B],
  );
  assert.deepEqual(
    await as(B, "select * from public.community_polls where post_id=$1", [
      owned,
    ]),
    [],
  );
  await assert.rejects(
    as(B, "select public.set_community_poll_vote($1,0)", [owned]),
    /Poll unavailable/,
  );
  await db.exec("delete from public.member_blocks");
  assert.equal(
    (
      await as(B, "select public.set_community_poll_vote($1,0) state", [owned])
    )[0].state.total,
    1,
  );
  await clear();
  const old = randomUUID();
  await post(old);
  await db.query(
    "update public.community_posts set created_at=now()-interval '2 minutes' where id=$1",
    [old],
  );
  await assert.rejects(direct(old, "Q", ["a", "b"]), /row-level security/);
  console.log(
    `Community poll safety PASS: ${checks} question/option RPC/direct rejection checks; actual safety/profile/rate/age/block/restriction guards, rollback, structure and valid paths.`,
  );
} finally {
  await db.close();
}

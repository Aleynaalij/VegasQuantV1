import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
// Reddit-style Zone votes: one vote per member per post (up, down, change, clear), scores without voter
// identities, and the member/visibility gates.
const db = new PGlite();
const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const R = "00000000-0000-4000-8000-00000000000c";
await db.exec(`create role anon; create role authenticated; create role service_role;
create schema private; create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table auth.users(id uuid primary key);
insert into auth.users values ('${A}'),('${B}'),('${R}');
create table private.restricted(user_id uuid);
insert into private.restricted values ('${R}');
create table private.hidden_authors(user_id uuid);
create function private.age_member_allowed() returns boolean language sql stable as $$select auth.uid() is not null$$;
create function private.community_member_allowed(target uuid) returns boolean language sql stable security definer set search_path='' as
 $$select not exists(select 1 from private.hidden_authors where user_id=target)$$;
create function private.community_reaction_actor_allowed() returns boolean language sql stable security definer set search_path='' as
 $$select auth.uid() is not null and not exists(select 1 from private.restricted where user_id=auth.uid())$$;
create function public.is_admin() returns boolean language sql stable as $$select false$$;
grant usage on schema private, auth to authenticated;
grant execute on all functions in schema private to authenticated;
create table public.community_posts(id uuid primary key, user_id uuid not null, body text);
insert into public.community_posts values ('10000000-0000-4000-8000-000000000001','${A}','post one'),('10000000-0000-4000-8000-000000000002','${A}','post two');`);
await db.exec(
  fs.readFileSync(
    "supabase/migrations/20261108170014_community_post_votes.sql",
    "utf8",
  ),
);

const P1 = "10000000-0000-4000-8000-000000000001";
const P2 = "10000000-0000-4000-8000-000000000002";
const as = async (uid, sql, params = []) => {
  await db.exec(
    `reset role; select set_config('request.jwt.claim.sub','${uid}',false); set role authenticated;`,
  );
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec("reset role");
  }
};
const vote = (uid, post, v) =>
  as(uid, "select public.set_community_post_vote($1,$2) r", [post, v]).then(
    (r) => r[0].r,
  );
const states = (uid, ids) =>
  as(uid, "select public.community_vote_states($1::uuid[]) r", [ids]).then(
    (r) => r[0].r,
  );
const pick = (s) => [s.score, s.up, s.down, s.mine];

assert.deepEqual(pick(await vote(B, P1, 1)), [1, 1, 0, 1]);
assert.deepEqual(
  pick(await vote(B, P1, 1)),
  [1, 1, 0, 1],
  "repeating a vote is idempotent",
);
assert.deepEqual(
  pick(await vote(B, P1, -1)),
  [-1, 0, 1, -1],
  "switching up to down",
);
assert.deepEqual(pick(await vote(A, P1, 1)), [0, 1, 1, 1]);
assert.deepEqual(
  pick(await vote(B, P1, 0)),
  [1, 1, 0, null],
  "clearing with 0",
);
assert.deepEqual(
  pick(await vote(A, P1, null)),
  [0, 0, 0, null],
  "clearing with null",
);

await vote(A, P1, 1);
await vote(B, P1, 1);
const s = await states(B, [P1, P2]);
assert.equal(s.length, 2, "posts without votes are returned with zeros");
const byId = Object.fromEntries(s.map((x) => [x.post_id, x]));
assert.deepEqual(pick(byId[P1]), [2, 2, 0, 1]);
assert.deepEqual(pick(byId[P2]), [0, 0, 0, null]);
assert.equal(
  JSON.stringify(s).includes(A),
  false,
  "states never expose voter ids",
);

await assert.rejects(vote(B, P1, 2), /Unsupported vote/);
await assert.rejects(vote(R, P1, 1), /Community vote unavailable/);
await assert.rejects(
  vote(B, "10000000-0000-4000-8000-000000000009", 1),
  /Post unavailable/,
);
await assert.rejects(
  as(B, "select * from public.community_post_votes"),
  /permission denied/,
);
await assert.rejects(
  as(B, `insert into public.community_post_votes values ('${P2}','${B}',1)`),
  /permission denied/,
);

await db.exec(`insert into private.hidden_authors values ('${A}')`);
assert.deepEqual(await states(B, [P1]), [], "hidden authors' posts drop out");
await assert.rejects(vote(B, P1, 1), /Post unavailable/);
await db.exec("delete from private.hidden_authors");

await db.exec(`delete from auth.users where id='${B}'`);
assert.deepEqual(
  pick((await states(A, [P1]))[0]),
  [1, 1, 0, 1],
  "deleting an account removes its votes",
);
await db.exec(`delete from public.community_posts where id='${P1}'`);
assert.equal(
  (await db.query("select count(*)::int n from public.community_post_votes"))
    .rows[0].n,
  0,
);
await assert.rejects(
  states(
    A,
    Array.from({ length: 101 }, () => crypto.randomUUID()),
  ),
  /Too many posts/,
);
console.log("Community post votes SQL checks passed.");

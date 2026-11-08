import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
// Zone polls: atomic post+poll creation under the caller's RLS, option validation, one vote per member
// (changeable), counts without voter identities, and the member/visibility gates.
const db = new PGlite();
const A = "00000000-0000-4000-8000-00000000000a"; // author
const B = "00000000-0000-4000-8000-00000000000b"; // voter
const R = "00000000-0000-4000-8000-00000000000c"; // restricted member
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
grant select on auth.users to authenticated;
create table public.community_posts(id uuid primary key, user_id uuid not null, sport text, kind text, title text,
 body text check (length(body) between 1 and 2000), legs jsonb, stake numeric, photo_path text, card text,
 created_at timestamptz not null default now());
alter table public.community_posts enable row level security;
create policy r on public.community_posts for select using (private.community_member_allowed(user_id));
create policy i on public.community_posts for insert with check (user_id = auth.uid());
grant select, insert on public.community_posts to authenticated;`);
await db.exec(
  fs.readFileSync(
    "supabase/migrations/20261108162552_community_polls.sql",
    "utf8",
  ),
);

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
const create = (uid, id, q, opts, body = "") =>
  as(
    uid,
    "select public.create_community_poll_post($1,'nhl',$2,null,$3,$4::jsonb) r",
    [id, body, q, JSON.stringify(opts)],
  );
const vote = (uid, post, opt) =>
  as(uid, "select public.set_community_poll_vote($1,$2) r", [post, opt]).then(
    (r) => r[0].r,
  );
const states = (uid, ids) =>
  as(uid, "select public.community_poll_states($1::uuid[]) r", [ids]).then(
    (r) => r[0].r,
  );

const P1 = "10000000-0000-4000-8000-000000000001";
await create(A, P1, "  Who wins tonight? ", [" BOS ", "FLA"], "");
const post = (
  await db.query(
    "select body, title, user_id from public.community_posts where id=$1",
    [P1],
  )
).rows[0];
assert.equal(
  post.body,
  "Who wins tonight?",
  "empty body falls back to the question",
);
assert.equal(post.user_id, A);
assert.deepEqual(
  (await db.query("select question, options from public.community_polls"))
    .rows[0],
  { question: "Who wins tonight?", options: ["BOS", "FLA"] },
);

// Validation rolls back the whole post.
for (const [q, opts, why] of [
  ["Q", ["only one"], "one option"],
  ["Q", ["a", "b", "c", "d", "e"], "five options"],
  ["Q", ["Same", "same"], "duplicate options"],
  ["Q", ["", "b"], "empty option"],
  ["Q", ["x".repeat(61), "b"], "long option"],
  ["", ["a", "b"], "empty question"],
  ["Q", ["a", 2], "non-text option"],
]) {
  const id = crypto.randomUUID();
  await assert.rejects(create(A, id, q, opts), undefined, why);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from public.community_posts where id=$1",
        [id],
      )
    ).rows[0].n,
    0,
    `${why}: post rolled back`,
  );
}

// A poll can't be attached to someone else's post, or to an old post.
await db.exec(
  `insert into public.community_posts(id,user_id,body) values ('20000000-0000-4000-8000-000000000002','${A}','old'),('20000000-0000-4000-8000-000000000003','${A}','new')`,
);
await db.exec(
  `update public.community_posts set created_at = now() - interval '2 minutes' where id='20000000-0000-4000-8000-000000000002'`,
);
await assert.rejects(
  as(
    B,
    `insert into public.community_polls(post_id,question,options) values ('20000000-0000-4000-8000-000000000003','Q','["a","b"]')`,
  ),
  /row-level security/,
);
await assert.rejects(
  as(
    A,
    `insert into public.community_polls(post_id,question,options) values ('20000000-0000-4000-8000-000000000002','Q','["a","b"]')`,
  ),
  /row-level security/,
);
await assert.rejects(
  as(B, "select * from public.community_poll_votes"),
  /permission denied/,
);

// Voting, changing, counting and clearing.
let s = await vote(B, P1, 1);
assert.deepEqual([s.counts, s.total, s.mine], [[0, 1], 1, 1]);
s = await vote(B, P1, 0);
assert.deepEqual(
  [s.counts, s.total, s.mine],
  [[1, 0], 1, 0],
  "changing a vote moves it",
);
s = await vote(A, P1, 0);
assert.deepEqual([s.counts, s.total, s.mine], [[2, 0], 2, 0]);
s = (await states(B, [P1, "20000000-0000-4000-8000-000000000003"]))[0];
assert.deepEqual([s.post_id, s.counts, s.total, s.mine], [P1, [2, 0], 2, 0]);
assert.equal(
  JSON.stringify(s).includes(A),
  false,
  "states never expose voter ids",
);
await assert.rejects(vote(B, P1, 2), /Unknown poll option/);
await assert.rejects(vote(B, P1, -1), /Unknown poll option/);
await assert.rejects(vote(R, P1, 0), /Community vote unavailable/);
await assert.rejects(
  vote(B, "20000000-0000-4000-8000-000000000003", 0),
  /Poll unavailable/,
);
s = await vote(B, P1, null);
assert.deepEqual(
  [s.counts, s.total, s.mine],
  [[1, 0], 1, null],
  "clearing removes the vote",
);

// Hidden authors' polls disappear from states and refuse votes.
await db.exec(`insert into private.hidden_authors values ('${A}')`);
assert.deepEqual(await states(B, [P1]), []);
await assert.rejects(vote(B, P1, 0), /Poll unavailable/);
await db.exec("delete from private.hidden_authors");

// Deleting the post removes poll and votes; deleting an account removes its votes.
await vote(B, P1, 1);
await db.exec(`delete from auth.users where id='${B}'`);
assert.equal(
  (
    await db.query(
      "select count(*)::int n from public.community_poll_votes where user_id=$1",
      [B],
    )
  ).rows[0].n,
  0,
);
await db.exec(`delete from public.community_posts where id='${P1}'`);
assert.equal(
  (await db.query("select count(*)::int n from public.community_polls")).rows[0]
    .n,
  0,
);
assert.equal(
  (await db.query("select count(*)::int n from public.community_poll_votes"))
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
console.log("Community polls SQL checks passed.");

// Follow-up: poll text goes through the same harmful-content / guaranteed-return check as posts.
await db.exec(fs.readFileSync("supabase/migrations/20261108171847_community_poll_safety.sql", "utf8"));
for (const [q, opts] of [
  ["Best lay tonight?", ["Guaranteed profit", "Fade it"]],
  ["Risk-free bet of the day?", ["Yes", "No"]],
  ["Click", ["javascript:alert(1)", "b"]],
]) {
  const id = crypto.randomUUID();
  await assert.rejects(create(A, id, q, opts, "harmless body"), /guaranteed-return/);
  assert.equal((await db.query("select count(*)::int n from public.community_posts where id=$1", [id])).rows[0].n, 0);
}
await create(A, crypto.randomUUID(), "Who wins?", ["Profit-takers", "Fade"], "ok");
console.log("Community poll safety checks passed.");

import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { stageDataFetch } from "../src/lib/stage-data-client";
import {
  stageFeatureQuery,
  featureCapabilities,
  noFeatures,
} from "../src/lib/stage-feature-query";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = (
  path: string,
  query = "",
  method = "GET",
  body: unknown = null,
) => ({
  path,
  query,
  method,
  accept: "application/json",
  body: body === null ? null : JSON.stringify(body),
  prefer: "return=representation",
  request_id: id(77),
});
test("feature parser binds existing names and rejects arbitrary schemas, services, filters, identity fields and malformed capabilities", () => {
  assert.deepEqual(
    featureCapabilities({ contract: "wrong", capabilities: noFeatures }),
    null,
  );
  assert.deepEqual(
    featureCapabilities({
      contract: "vq-stage-features-v1",
      capabilities: { ...noFeatures, social: true },
    }),
    { ...noFeatures, social: true },
  );
  assert(
    stageFeatureQuery(
      input(
        "member_parlays",
        "?select=id,title,legs&order=created_at.desc&limit=50",
      ),
    ),
  );
  assert(
    stageFeatureQuery(input("saved_legs", "?select=leg_key&leg_key=in.(a,b)")),
  );
  for (const p of [
    input("auth/users"),
    input("rpc/notification_dispatch", "", "POST", {}),
    input("community_posts", "?or=(user_id.eq.any)"),
    input("saved_legs", "?select=*,auth.users(*)"),
    input("member_parlays", "", "PATCH", { legs: [] }),
    {
      ...input("community_posts", "", "POST", { user_id: id(1), body: "Hi" }),
      request_id: "bad",
    },
    input("rpc/community_comments", "", "POST", { p_post: id(20), p_limit: 5 }),
    input("community_posts", "?limit=0"),
    {
      ...input("community_posts", "", "POST", { user_id: id(1), body: "Hi" }),
      prefer: "resolution=merge-duplicates",
    },
  ])
    assert.equal(stageFeatureQuery(p), null, JSON.stringify(p));
});
test(
  "actual query builders and original consumer policies: profile/social, saves, member_parlays, own inbox and authorization rollback",
  { timeout: 120000 },
  async (t) => {
    const { consumerDb } = await import("./fixtures/stage-consumer-db.mjs");
    const fixture = await consumerDb();
    const { db } = fixture;
    t.after(() => db.close());
    await fixture.as();
    const aclAfter = (
      await db.query<any>(
        `select oid::regprocedure::text f,proacl::text acl from pg_proc where pronamespace in ('public'::regnamespace,'private'::regnamespace) order by 1`,
      )
    ).rows;
    for (const before of fixture.aclBefore)
      assert.deepEqual(
        aclAfter.find((a: { f: string }) => a.f === before.f),
        before,
        "original execution grants must not change",
      );
    await assert.rejects(
      db.query(
        "select original_definitions from vq_private_access_stage.feature_contract",
      ),
      /permission denied/,
    );
    const initial = (
      await db.query<any>(
        "select public.vq_private_access_stage_features() as m",
      )
    ).rows[0].m;
    assert.equal(
      initial.capabilities.research,
      false,
      "missing original source schemas cannot advertise research",
    );
    await fixture.fixtureEnable();
    await fixture.as(2);
    let calls = 0;
    const sdk = createClient(
      "https://synthetic.supabase.co",
      "synthetic-public-key",
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: stageDataFetch(
            "https://synthetic.supabase.co",
            async (_url, init) => {
              calls++;
              const q = stageFeatureQuery(JSON.parse(String(init?.body)));
              if (!q)
                return Response.json(
                  { message: "Unsupported fixture contract" },
                  { status: 503 },
                );
              try {
                const r = (
                  await db.query<any>(
                    "select public.vq_private_access_stage_feature($1::jsonb) as r",
                    [JSON.stringify(q)],
                  )
                ).rows[0].r;
                return Response.json(r.data ?? null, {
                  status: r.status,
                  headers:
                    typeof r.count === "number"
                      ? { "Content-Range": `*/${r.count}` }
                      : {},
                });
              } catch (e) {
                return Response.json(
                  { message: (e as Error).message },
                  { status: 403 },
                );
              }
            },
          ),
        },
      },
    );
    const ok = (r: { error: unknown }) =>
      assert.equal(r.error, null, JSON.stringify(r.error));
    ok(
      await sdk
        .from("community_profiles")
        .update({ bio: "Synthetic profile bio" })
        .eq("user_id", id(2)),
    );
    const profile = await sdk
      .from("community_profiles")
      .select("user_id,bio")
      .eq("user_id", id(2))
      .single();
    ok(profile);
    assert.equal(profile.data!.bio, "Synthetic profile bio");
    const foreign = await sdk
      .from("community_profiles")
      .select("user_id,bio")
      .eq("user_id", id(1));
    ok(foreign);
    assert.deepEqual(foreign.data, []);
    assert(
      (
        await sdk
          .from("community_profiles")
          .upsert(
            { user_id: id(1), username: "Impersonation" },
            { onConflict: "user_id" },
          )
      ).error,
    );
    assert(
      (
        await sdk
          .from("community_profiles")
          .update({ bio: "guaranteed profit" })
          .eq("user_id", id(2))
      ).error,
      "original harmful-content moderation remains active",
    );
    const clock = await sdk.rpc("community_story_clock");
    ok(clock);
    assert.equal(clock.data.version, 1);
    const posted = await sdk
      .from("community_posts")
      .insert({
        id: id(24),
        user_id: id(2),
        sport: "nfl",
        kind: "talk",
        title: "Synthetic consumer post",
        body: "Supported synthetic posting",
        legs: [],
        stake: null,
        photo_path: null,
      })
      .select("id")
      .single();
    ok(posted);
    assert(
      (
        await sdk.rpc("create_community_poll_post", {
          p_id: id(25),
          p_sport: "nfl",
          p_body: "Synthetic poll",
          p_photo_path: null,
          p_question: "Synthetic choice?",
          p_options: ["One", "Two"],
        })
      ).error,
      "original post throttle remains active",
    );
    await db.exec(
      `reset role;update community_posts set created_at=now()-interval '2 minutes' where id='${id(24)}'`,
    );
    await fixture.as(2);
    const poll = await sdk.rpc("create_community_poll_post", {
      p_id: id(25),
      p_sport: "nfl",
      p_body: "Synthetic poll",
      p_photo_path: null,
      p_question: "Synthetic choice?",
      p_options: ["One", "Two"],
    });
    ok(poll);
    ok(
      await sdk.rpc("set_community_poll_vote", { p_post: id(25), p_option: 1 }),
    );
    const polls = await sdk.rpc("community_poll_states", { p_posts: [id(25)] });
    ok(polls);
    assert.equal(polls.data[0].total, 1);
    ok(
      await sdk.rpc("set_community_post_vote", { p_post: id(20), p_value: 1 }),
    );
    assert(
      (
        await sdk.rpc("set_community_post_vote", {
          p_post: id(20),
          p_value: 50,
        })
      ).error,
    );
    const story = await sdk.rpc("community_activity");
    ok(story);
    assert(story.data.some((v: { post_id: string }) => v.post_id === id(20)));
    ok(
      await sdk
        .from("member_follows")
        .upsert(
          { user_id: id(2), target_user_id: id(1) },
          { onConflict: "user_id,target_user_id", ignoreDuplicates: true },
        ),
    );
    ok(
      await sdk
        .from("member_follows")
        .upsert(
          { user_id: id(2), target_user_id: id(1) },
          { onConflict: "user_id,target_user_id", ignoreDuplicates: true },
        ),
    );
    const follow = await sdk
      .from("member_follows")
      .select("user_id,target_user_id");
    ok(follow);
    assert.equal(follow.data!.length, 1);
    const comment = await sdk
      .from("community_post_comments")
      .insert({
        id: id(21),
        user_id: id(2),
        post_id: id(20),
        body: "Synthetic discussion",
      })
      .select("id,user_id,body")
      .single();
    ok(comment);
    assert.equal(comment.data!.id, id(21));
    const reaction = await sdk.rpc("set_community_reaction", {
      p_post: id(20),
      p_reaction: "heart",
    });
    ok(reaction);
    assert.equal(reaction.data.mine, "heart");
    ok(
      await sdk.rpc("set_community_reaction", {
        p_post: id(20),
        p_reaction: "heart",
      }),
    );
    ok(
      await sdk
        .from("saved_legs")
        .upsert(
          { user_id: id(2), leg_key: "a" },
          { onConflict: "user_id,leg_key", ignoreDuplicates: true },
        ),
    );
    ok(
      await sdk
        .from("saved_legs")
        .upsert(
          { user_id: id(2), leg_key: "a" },
          { onConflict: "user_id,leg_key", ignoreDuplicates: true },
        ),
    );
    const saved = await sdk.from("saved_legs").select("leg_key");
    ok(saved);
    assert.deepEqual(saved.data, [{ leg_key: "a" }]);
    assert(
      (
        await sdk
          .from("saved_legs")
          .insert({ user_id: id(2), leg_key: "missing" })
      ).error,
    );
    const parlay = await sdk.rpc("create_member_parlay", {
      p_title: "Synthetic original lay",
      p_leg_keys: ["a", "b"],
    });
    ok(parlay);
    const retry = await sdk.rpc("create_member_parlay", {
      p_title: "Duplicate request",
      p_leg_keys: ["b", "a"],
    });
    ok(retry);
    assert.equal(retry.data, parlay.data);
    const lays = await sdk
      .from("member_parlays")
      .select("id,title,legs,created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    ok(lays);
    assert.equal(lays.data!.length, 1);
    assert.equal(lays.data![0].legs.length, 2);
    await db.exec(
      `reset role;update community_posts set created_at=now()-interval '2 minutes' where user_id='${id(2)}'`,
    );
    await fixture.as(2);
    const shared = await sdk.rpc("share_member_parlay", {
      p_parlay: parlay.data,
    });
    ok(shared);
    const sharedAgain = await sdk.rpc("share_member_parlay", {
      p_parlay: parlay.data,
    });
    ok(sharedAgain);
    assert.equal(
      sharedAgain.data,
      shared.data,
      "parlay sharing retains the original dedupe marker",
    );
    const tails = await sdk.rpc("leg_tail_counts", { p_legs: ["a", "b"] });
    ok(tails);
    assert.equal(
      tails.data.length,
      2,
      "set-returning original aggregate contract is preserved",
    );
    const originalLegs = lays.data![0].legs;
    await db.exec(
      "reset role;update published_legs set name='Changed current source' where leg_key='a'",
    );
    await fixture.as(2);
    assert.deepEqual(
      (
        await sdk
          .from("member_parlays")
          .select("legs")
          .eq("id", parlay.data)
          .single()
      ).data!.legs,
      originalLegs,
      "saved original snapshot is immutable when sources change",
    );
    const inbox = await sdk.rpc("notification_inbox", {});
    ok(inbox);
    assert(Array.isArray(inbox.data.items));
    ok(
      await sdk
        .from("notification_preferences")
        .upsert(
          { user_id: id(2), disabled_types: ["like"] },
          { onConflict: "user_id" },
        ),
    );
    assert(
      (
        await sdk
          .from("notification_preferences")
          .upsert(
            { user_id: id(2), push_enabled: true },
            { onConflict: "user_id" },
          )
      ).error,
      "outbound delivery cannot be enabled through the adapter",
    );
    ok(
      await sdk.rpc("notification_view", {
        p_ids: [],
        p_before: new Date().toISOString(),
      }),
    );
    await fixture.as(1);
    assert.deepEqual(
      (await sdk.from("member_parlays").select("id")).data,
      [],
      "no cross-user My Lays read",
    );
    ok(await sdk.from("community_post_comments").delete().eq("id", id(21))); // zero foreign rows, not a moderation bypass
    await fixture.as(2);
    assert.equal(
      (await sdk.from("community_post_comments").select("id").eq("id", id(21)))
        .data!.length,
      1,
    );
    // Direct database paths must obey the same stage gate, not only the bridge.
    for (const [setting, value] of [
      ["test.gate", "off"],
      ["test.aal", "aal1"],
      ["test.session", "revoked"],
      ["test.age", "off"],
      ["test.member", "off"],
    ]) {
      await db.query<any>("select set_config($1,$2,false)", [setting, value]);
      assert.equal(
        (
          await db.query<any>(
            "select count(*) as n from public.community_posts",
          )
        ).rows[0].n,
        0,
      );
      assert((await sdk.rpc("community_activity")).error);
      await db.query<any>("select set_config($1,$2,false)", [
        setting,
        setting === "test.aal"
          ? "aal2"
          : setting === "test.session"
            ? "active"
            : "on",
      ]);
    }
    await fixture.as(3);
    assert.equal(
      (await db.query<any>("select count(*) as n from community_posts")).rows[0]
        .n,
      0,
    );
    assert((await sdk.from("saved_legs").select("leg_key")).error);
    await fixture.as(2);
    // Inject an in-transaction eligibility change; the attempted mutation itself must roll back.
    await db.exec(`reset role;create function private.synthetic_revoke() returns trigger language plpgsql as $$begin perform set_config('test.age','off',true);return new;end$$;create trigger synthetic_revoke before insert on saved_legs for each row execute function private.synthetic_revoke();
 update vq_private_access_stage.feature_contract set fingerprints=vq_private_access_stage.feature_fingerprints();`);
    await fixture.as(2);
    assert(
      (await sdk.from("saved_legs").insert({ user_id: id(2), leg_key: "b" }))
        .error,
    );
    await db.exec(
      "reset role;drop trigger synthetic_revoke on saved_legs;drop function private.synthetic_revoke();select set_config('test.age','on',false);update vq_private_access_stage.feature_contract set fingerprints=vq_private_access_stage.feature_fingerprints();",
    );
    await fixture.as(2);
    assert.equal(
      (await sdk.from("saved_legs").select("leg_key").eq("leg_key", "b")).data!
        .length,
      0,
    );
    // Drift prevents capability use. Rolling back the application flag does not delete records.
    await db.exec(
      "reset role;alter table member_parlays disable row level security",
    );
    await fixture.as(2);
    assert.equal(
      (
        await db.query<any>(
          "select public.vq_private_access_stage_features() as m",
        )
      ).rows[0].m,
      null,
    );
    await db.exec(
      'reset role;alter table member_parlays enable row level security;update vq_private_access_stage.feature_contract set fingerprints=vq_private_access_stage.feature_fingerprints(),capabilities=\'{"social":false,"profile":false,"desk":false,"notifications":false,"research":false}\';',
    );
    assert.equal(
      (await db.query<any>("select count(*) as n from member_parlays")).rows[0]
        .n,
      1,
    );
    assert(calls > 20);
  },
);

test("capabilities are a versioned server projection; stale or malformed identity responses cannot enable journeys", async () => {
  const { createViewerSessionClient } = await import(
    "../src/lib/viewer-session-client"
  );
  let payload: Record<string, unknown> = {
    state: "ready",
    age: "verified",
    session: { transport: "httpOnly-stage", user: { id: id(1) } },
  };
  const client = createViewerSessionClient(async () => Response.json(payload));
  assert.deepEqual((await client.read()).capabilities, noFeatures);
  payload = {
    ...payload,
    contract: "vq-stage-features-v1",
    capabilities: { ...noFeatures, social: true, desk: true },
  };
  assert.equal((await client.read(true)).capabilities.desk, true);
  payload = { ...payload, capabilities: { ...noFeatures, social: "yes" } };
  assert.deepEqual((await client.read(true)).capabilities, noFeatures);
  client.invalidate();
  assert.equal(client.getSnapshot().session, null);
});

test(
  "isolated preparation rejects unsafe owners/volatile SQL and guards private-only mutation commit",
  { timeout: 120000 },
  async (t) => {
    const { consumerDb } = await import("./fixtures/stage-consumer-db.mjs");
    await assert.rejects(
      consumerDb(async (db) => {
        await db.exec(
          `grant create on schema public to authenticated;create function public.unreviewed_owner() returns boolean language sql stable security definer as $$select true$$;alter function public.unreviewed_owner() owner to authenticated;`,
        );
      }),
      /Unsafe isolated definer owner/,
    );

    await assert.rejects(
      consumerDb(async (db) => {
        await db.exec(
          `create function public.unreviewed_volatile() returns setof integer language sql security definer as $$select 1$$;`,
        );
      }),
      /Unreviewed definer shape/,
    );
    await assert.rejects(
      consumerDb(async (db) => {
        await db.exec(
          `create table private.unsafe_direct_source(secret text);grant select on private.unsafe_direct_source to authenticated;`,
        );
      }),
      /private source lacks original RLS/,
    );
    const fixture = await consumerDb(async (db) => {
      await db.exec(
        `create table private.synthetic_notes(user_id uuid,note text);create function private.synthetic_private_mutation() returns void language plpgsql security definer set search_path='' as $$begin insert into private.synthetic_notes values(auth.uid(),'synthetic note');perform set_config('test.age','off',true);return;end$$;revoke all on function private.synthetic_private_mutation() from public,anon;grant execute on function private.synthetic_private_mutation() to authenticated;`,
      );
    });
    t.after(() => fixture.db.close());
    await fixture.as(1);
    await assert.rejects(
      fixture.db.query("select private.synthetic_private_mutation()"),
      /authorization changed/,
    );
    await fixture.db.exec("reset role");
    assert.equal(
      (
        await fixture.db.query<any>(
          "select count(*) as n from private.synthetic_notes",
        )
      ).rows[0].n,
      0,
    );
  },
);

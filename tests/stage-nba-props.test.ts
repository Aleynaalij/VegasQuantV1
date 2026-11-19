import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { stageDataFetch } from "../src/lib/stage-data-client";
import { stageFeatureQuery } from "../src/lib/stage-feature-query";
import { stageConsumerRoute } from "../src/lib/stage-route-policy";
import { loadSlate } from "../src/lib/nba-tonight";

const request = (
  path: string,
  query = "",
  body: unknown = null,
  method = "GET",
) => ({
  path,
  query,
  body: body === null ? null : JSON.stringify(body),
  method,
  accept: "application/json",
  prefer: null,
  request_id: null,
});

test("Prop Finder admits only its bounded read operations and reviewed RPC pagination", () => {
  assert(stageConsumerRoute("/nba/props"));
  assert(!stageConsumerRoute("/nba/props/private"));
  assert(!stageConsumerRoute("/api/nba/props"));
  assert(
    stageFeatureQuery(
      request(
        "nba_observations",
        "?select=game_id,payload&kind=eq.prop&order=recorded_at.desc,id.asc&limit=1000&offset=1000",
      ),
    ),
  );
  const usage = stageFeatureQuery(
    request(
      "rpc/nba_player_usage",
      "?order=game_id.asc,athlete_id.asc&limit=10&offset=10",
      { p_athletes: ["synthetic"] },
      "POST",
    ),
  );
  assert.deepEqual(usage && "page" in usage ? usage.page : null, {
    order: [
      ["game_id", "asc"],
      ["athlete_id", "asc"],
    ],
    limit: 10,
    offset: 10,
  });
  for (const raw of [
    request("nba_games", "?tipoff=gte.2026-11-18&tipoff=gte.2026-11-19"),
    request("nba_games", "?limit=1&limit=2"),
    request("nba_observations", "", { payload: {} }, "POST"),
    request("nba_player_shooting"),
    request("nba_observations", "?select=service_role"),
    request(
      "rpc/nba_player_usage",
      "?order=secret.asc",
      { p_athletes: [] },
      "POST",
    ),
    request("rpc/nba_player_usage", "?limit=1001", { p_athletes: [] }, "POST"),
    request("rpc/nba_player_usage", "?offset=-1", { p_athletes: [] }, "POST"),
    request(
      "rpc/nba_player_usage",
      "?order=game_id.asc&order=usage.desc",
      { p_athletes: [] },
      "POST",
    ),
    request("rpc/nba_player_usage", "?or=(true)", { p_athletes: [] }, "POST"),
    request(
      "rpc/nba_defense_vs_position",
      "?limit=10",
      { p_season: 2026 },
      "POST",
    ),
  ])
    assert.equal(stageFeatureQuery(raw), null);
});

test(
  "actual Prop Finder loader uses original NBA RPCs and the cookie bridge with no second identity",
  { timeout: 120000 },
  async (t) => {
    const { consumerDb, id } = await import("./fixtures/stage-consumer-db.mjs");
    const { prepareStageNba } = await import("./fixtures/stage-nba-db.mjs");
    const fixture = await consumerDb(prepareStageNba);
    t.after(() => fixture.db.close());
    // Other original research dependencies remain absent: hosted readiness is not inferred.
    const initial = (
      await fixture.db.query<any>(
        "select capabilities from vq_private_access_stage.feature_contract",
      )
    ).rows[0].capabilities;
    assert.equal(initial.research, false);
    await fixture.db.exec(
      "update vq_private_access_stage.feature_contract set capabilities=jsonb_set(capabilities,'{research}','true')",
    );
    await fixture.as();
    const seen: string[] = [];
    const client = createClient(
      "https://caynldluziwrzmvuslzg.supabase.co",
      "sb_publishable_synthetic",
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: {
          fetch: stageDataFetch(
            "https://caynldluziwrzmvuslzg.supabase.co",
            async (url, init) => {
              assert.equal(url, "/staging/discovery/data");
              assert.equal(init?.credentials, "same-origin");
              assert.equal(
                new Headers(init?.headers).has("authorization"),
                false,
              );
              assert.equal(new Headers(init?.headers).has("apikey"), false);
              const normalized = stageFeatureQuery(
                JSON.parse(String(init?.body)),
              );
              assert(
                normalized,
                "the original loader request must have an admitted contract",
              );
              seen.push(normalized.name);
              try {
                const r = (
                  await fixture.db.query<any>(
                    "select public.vq_private_access_stage_feature($1::jsonb) r",
                    [JSON.stringify(normalized)],
                  )
                ).rows[0].r;
                return Response.json(r.data, { status: r.status });
              } catch {
                return Response.json({ code: "DENIED" }, { status: 403 });
              }
            },
          ),
        },
      },
    );
    const slate = await loadSlate(true, undefined, client);
    assert.deepEqual(
      slate.games.map((g) => g.id),
      [id(92)],
    );
    assert.equal(slate.lines[0].player, "Synthetic Player");
    assert.equal(slate.lines[0].tpa, 7);
    assert.equal(slate.trends.get(id(92))?.length, 1);
    assert.equal(slate.quotes.get(id(92))?.length, 1);
    assert(slate.defense.length > 0);
    assert(seen.includes("nba_player_usage"));
    assert(seen.includes("nba_defense_vs_position"));
    const later = await loadSlate(true, id(93), client);
    assert.deepEqual(
      later.games.map((g) => g.id),
      [id(93)],
    );
    const page = stageFeatureQuery(
      request(
        "rpc/nba_player_usage",
        "?order=game_id.asc&limit=1&offset=1",
        { p_athletes: ["synthetic"] },
        "POST",
      ),
    );
    assert(page);
    assert.deepEqual(
      (
        await fixture.db.query<any>(
          "select public.vq_private_access_stage_feature($1::jsonb) r",
          [JSON.stringify(page)],
        )
      ).rows[0].r.data,
      [],
    );
    await assert.rejects(
      fixture.db.query(
        "select public.vq_private_access_stage_feature($1::jsonb)",
        [
          JSON.stringify({
            ...page,
            page: { order: [["unknown", "asc"]], limit: 1, offset: 0 },
          }),
        ],
      ),
      /Invalid RPC order/,
    );
    await fixture.db.exec("select set_config('test.member','off',false)");
    await assert.rejects(loadSlate(true, undefined, client));
    await fixture.db.exec("select set_config('test.member','on',false)");
    await fixture.as(3);
    await assert.rejects(loadSlate(true, undefined, client));
  },
);

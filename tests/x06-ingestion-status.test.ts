// Synthetic handler tests: Supabase, Deno env, clock and EVERY fetch are replaced.
// Real normalizers/cadence run unchanged. No provider or database request is possible.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as nbaNormalize from "../supabase/functions/nba-sync/normalize";
import * as nbaCadence from "../supabase/functions/nba-sync/cadence";
import * as nflNormalize from "../supabase/functions/source-sync/normalize";
import * as nflCadence from "../supabase/functions/source-sync/cadence";
import * as nflProps from "../supabase/functions/source-sync/props";

const NOW = Date.parse("2026-11-03T12:00:00Z");
const HOUR = 3600000;
const iso = (at: number) => new Date(at).toISOString();
type Sport = "nba" | "nfl";
type Outcome =
  | "quote"
  | "empty"
  | "invalid"
  | "http-error"
  | "ingest-error"
  | "dedupe";
type Run = {
  provider: string;
  status?: string;
  details?: Record<string, any>;
  observations?: any[];
};
type Options = {
  hours?: number[];
  outcomes?: Outcome[];
  limit?: number;
  enabled?: boolean;
  previous?: Run;
};

function harness(sport: Sport, options: Options = {}) {
  let now = NOW;
  const propProvider =
    sport === "nba" ? "The Odds API NBA props" : "The Odds API props";
  const events = (options.hours ?? [8, 9]).map((hours, i) => ({
    id: `e${i}`,
    home_team: `Home ${i}`,
    away_team: `Away ${i}`,
    commence_time: iso(NOW + hours * HOUR),
  }));
  const games = events.map((e, i) => ({
    id: `g${i}`,
    home_team: e.home_team,
    away_team: e.away_team,
    kickoff: e.commence_time,
  }));
  const board = {
    events: events.map((e, i) => ({
      id: String(401000 + i),
      date: e.commence_time,
      season: { year: 2027, type: 2 },
      competitions: [
        {
          timeValid: true,
          competitors: [
            {
              homeAway: "home",
              team: { displayName: e.home_team, abbreviation: `H${i}` },
            },
            {
              homeAway: "away",
              team: { displayName: e.away_team, abbreviation: `A${i}` },
            },
          ],
          status: { type: { name: "STATUS_SCHEDULED", state: "pre" } },
        },
      ],
    })),
  };
  const runs: Run[] = options.previous
    ? [structuredClone(options.previous)]
    : [];
  const requested: string[] = [];
  let eventListFailure = false;
  let eventListRequests = 0;
  let active = 0,
    maxActive = 0;
  const outcome = (id: string) =>
    options.outcomes?.[Number(id.slice(1))] ?? "quote";
  const query = (table: string) => {
    let provider = "";
    const q: Record<string, any> = {
      then: (
        resolve: (value: unknown) => unknown,
        reject: (error: unknown) => unknown,
      ) => {
        const latest = [...runs]
          .reverse()
          .find((r) => r.provider === provider && r.details?.fetched_at);
        return Promise.resolve({
          data: table === "games" ? games : latest ? [latest] : [],
          error: null,
        }).then(resolve, reject);
      },
    };
    for (const method of ["select", "not", "order", "limit", "gte", "lte"])
      q[method] = () => q;
    q.eq = (column: string, value: string) => {
      assert.equal(column, "provider");
      provider = value;
      return q;
    };
    return q;
  };
  const db = {
    from: (table: string) => {
      assert.ok(["games", "feed_runs"].includes(table));
      return query(table);
    },
    rpc: async (name: string, args?: { p?: Run }) => {
      if (name === "feed_authorize") return { data: true, error: null };
      if (name === "nba_feed_settings")
        return {
          data: {
            lines_enabled: false,
            props_enabled: options.enabled !== false,
            prop_markets: ["player_points"],
            max_prop_events: options.limit ?? 15,
          },
          error: null,
        };
      if (name === "priced_pick_games") return { data: [], error: null };
      assert.ok(
        ["ingest_nba", "ingest_source"].includes(name),
        `Unexpected RPC: ${name}`,
      );
      const p = args!.p!;
      const id = p.observations?.[0]?.payload?.event_id;
      if (p.provider === propProvider && id && outcome(id) === "ingest-error")
        return { data: null, error: Error("Synthetic ingest failure") };
      runs.push(structuredClone(p));
      return {
        data: {
          inserted:
            id && outcome(id) === "dedupe" ? 0 : (p.observations?.length ?? 0),
        },
        error: null,
      };
    },
  };
  const response = (data: unknown, status = 200) => ({
    ok: status === 200,
    status,
    headers: new Headers(),
    json: async () => data,
  });
  const fetch = async (input: string) => {
    const url = new URL(input);
    if (url.hostname === "site.api.espn.com") {
      if (url.pathname.endsWith("/scoreboard"))
        return response(
          sport === "nba"
            ? board
            : {
                leagues: [{ season: { year: 2026, type: { type: 2 } } }],
                week: { number: 9 },
                events: [],
              },
        );
      if (url.pathname.endsWith("/injuries")) return response({ injuries: [] });
      if (url.pathname.endsWith("/news")) return response({ articles: [] });
    }
    if (url.hostname === "api.the-odds-api.com") {
      if (url.pathname.endsWith("/events")) {
        eventListRequests++;
        return response(events, eventListFailure ? 503 : 200);
      }
      if (url.pathname.endsWith("/odds/")) return response([]);
      const id = /\/events\/(e\d+)\/odds$/.exec(url.pathname)?.[1];
      if (id) {
        requested.push(id);
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise<void>((resolve) => setImmediate(resolve));
        active--;
        const result = outcome(id);
        if (result === "http-error") return response({}, 503);
        const event = events.find((e) => e.id === id)!;
        return response({
          ...event,
          bookmakers:
            result === "empty"
              ? []
              : [
                  {
                    key: "fanduel",
                    title: "FanDuel",
                    last_update: iso(now - 60000),
                    markets: [
                      {
                        key:
                          sport === "nba" ? "player_points" : "player_rush_yds",
                        outcomes: [
                          {
                            name: "Over",
                            description: "Synthetic Player",
                            point: 20.5,
                            price: result === "invalid" ? 0 : -110,
                          },
                        ],
                      },
                    ],
                  },
                ],
        });
      }
    }
    assert.fail(`Unexpected mocked URL: ${url.origin}${url.pathname}`);
  };
  let handler: (req: Request) => Promise<Response> = () =>
    Promise.reject(Error("Handler not installed"));
  const file = new URL(
    `../supabase/functions/${sport === "nba" ? "nba-sync" : "source-sync"}/index.ts`,
    import.meta.url,
  );
  const output = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  class Clock extends Date {
    constructor(value: string | number = now) {
      super(value);
    }
    static now() {
      return now;
    }
  }
  runInNewContext(output, {
    exports: {},
    require: (path: string) => {
      if (path === "@supabase/supabase-js") return { createClient: () => db };
      if (path === "./normalize.ts")
        return sport === "nba" ? nbaNormalize : nflNormalize;
      if (path === "./cadence.ts")
        return sport === "nba" ? nbaCadence : nflCadence;
      if (path === "./props.ts" && sport === "nfl") return nflProps;
      assert.fail(`Unexpected import: ${path}`);
    },
    Deno: {
      env: {
        get: (key: string) =>
          ({
            SUPABASE_URL: "https://fixture.invalid",
            SUPABASE_SERVICE_ROLE_KEY: "synthetic-only",
            ODDS_API_KEY: "synthetic-only",
            ODDS_FEED_ENABLED: "true",
            ODDS_PROPS_ENABLED: options.enabled === false ? "false" : "true",
          })[key],
      },
      serve: (fn: typeof handler) => {
        handler = fn;
      },
    },
    fetch,
    crypto: webcrypto,
    TextEncoder,
    AbortSignal,
    Response,
    Date: Clock,
  });
  return {
    requested,
    runs,
    events,
    maxActive: () => maxActive,
    eventListRequests: () => eventListRequests,
    failEventList: () => {
      eventListFailure = true;
    },
    recoverEventList: () => {
      eventListFailure = false;
    },
    async run(at = NOW) {
      now = at;
      const response = await handler(
        new Request("https://fixture.invalid", {
          method: "POST",
          headers: { authorization: "Bearer synthetic-only" },
          body: "{}",
        }),
      );
      assert.equal(response.status, 200);
      const result = runs.findLast(
        (r) => r.provider === propProvider && r.status,
      );
      assert.ok(result?.details);
      return result as Run & { details: Record<string, any> };
    },
  };
}

test("X06 NBA distinguishes budget deferral from failure and full coverage", async () => {
  const h = harness("nba", { limit: 1 });
  const run = await h.run();
  assert.equal(run.status, "partial");
  assert.deepEqual(h.requested, ["e0"]);
  assert.deepEqual(
    [
      run.details.eligible_events,
      run.details.due_events,
      run.details.attempted_events,
      run.details.fetched_events,
      run.details.budget_deferred_events,
      run.details.failed,
      run.details.empty,
    ],
    [2, 2, 1, 1, 1, 0, 0],
  );
});

for (const outcome of ["empty", "invalid"] as const)
  test(`X06 NBA ${outcome} normalized response is partial, not a provider failure`, async () => {
    const run = await harness("nba", { hours: [8], outcomes: [outcome] }).run();
    assert.equal(run.status, "partial");
    assert.equal(run.details.empty, 1);
    assert.equal(run.details.failed, 0);
  });

for (const sport of ["nba", "nfl"] as const) {
  test(`X06 ${sport} valid deduplicated quotes are successful even with zero inserts`, async () => {
    const run = await harness(sport, {
      hours: [8],
      outcomes: ["dedupe"],
    }).run();
    assert.equal(run.status, "ok");
    assert.equal(run.details.inserted_quotes, 0);
    assert.equal(run.details.empty, 0);
    assert.equal(run.details.failed, 0);
    assert.equal(run.details.event_fetched_at.e0, iso(NOW));
  });
  for (const failure of ["http-error", "ingest-error"] as const)
    test(`X06 ${sport} ${failure} cannot advance the successful cache`, async () => {
      const run = await harness(sport, {
        hours: [sport === "nba" ? 8 : 48],
        outcomes: [failure],
      }).run();
      assert.equal(run.status, "partial");
      assert.equal(run.details.failed, 1);
      assert.equal(run.details.event_fetched_at.e0, undefined);
      if (sport === "nfl")
        assert.equal(run.details.event_attempted_at.e0, iso(NOW));
    });
  test(`X06 ${sport} mixed batch separates success, empty, HTTP and ingest failure`, async () => {
    const h = harness(sport, {
      hours: [8, 9, 10, 11, 12],
      outcomes: ["quote", "empty", "http-error", "ingest-error", "dedupe"],
    });
    const run = await h.run();
    assert.equal(run.status, "partial");
    assert.equal(run.details.failed, 2);
    assert.equal(run.details.empty, 1);
    assert.equal(run.details.inserted_quotes, 1);
    assert.deepEqual(Object.keys(run.details.event_fetched_at).sort(), [
      "e0",
      "e1",
      "e4",
    ]);
    assert.equal(h.requested.length, 5);
    assert.ok(h.maxActive() <= (sport === "nba" ? 1 : 3));
  });
  test(`X06 ${sport} empty schedule and disabled flag spend no prop credits`, async () => {
    for (const options of [{ hours: [] }, { enabled: false }]) {
      const h = harness(sport, options);
      const run = await h.run();
      assert.equal(
        run.status,
        options.enabled === false ? "not configured" : "no upcoming events",
      );
      assert.equal(h.requested.length, 0);
    }
  });
}

test("X06 NFL retains six-hour attempt backoff without inventing success", async () => {
  const h = harness("nfl", { hours: [48], outcomes: ["http-error"] });
  await h.run();
  const next = await h.run(NOW + 15 * 60000);
  assert.deepEqual(h.requested, ["e0"]);
  assert.equal(next.details.event_fetched_at.e0, undefined);
  assert.equal(next.details.event_attempted_at.e0, iso(NOW));
  await h.run(NOW + 6 * HOUR);
  assert.deepEqual(h.requested, ["e0", "e0"]);
});

test("X06 NFL distant failures remain throttled when a near game triggers the next batch", async () => {
  const h = harness("nfl", {
    hours: [1, 48],
    outcomes: ["quote", "http-error"],
  });
  await h.run();
  const next = await h.run(NOW + 15 * 60000);
  assert.deepEqual(h.requested, ["e0", "e1", "e0"]);
  assert.equal(next.details.event_fetched_at.e1, undefined);
  assert.equal(next.details.event_attempted_at.e1, iso(NOW));
});

test("X06 NFL legacy caches are retained only as attempts, without increasing requests", async () => {
  const h = harness("nfl", {
    hours: [48],
    previous: {
      provider: "The Odds API props",
      status: "partial",
      details: {
        market_set_version: nflProps.PROP_MARKET_SET_VERSION,
        fetched_at: iso(NOW - 15 * 60000),
        event_fetched_at: { e0: iso(NOW - 15 * 60000) },
        failed: 1,
      },
    },
  });
  const next = await h.run();
  assert.equal(h.requested.length, 0);
  assert.equal(next.details.event_fetch_state_version, 2);
  assert.deepEqual(next.details.event_fetched_at, {});
  assert.equal(next.details.event_attempted_at.e0, iso(NOW - 15 * 60000));
});

test("X06 NFL cap and maximum parallelism remain 24 and three", async () => {
  const h = harness("nfl", {
    hours: Array.from({ length: 25 }, (_, i) => 48 + i),
  });
  const run = await h.run();
  assert.equal(run.status, "partial");
  assert.equal(run.details.skipped, 1);
  assert.equal(h.requested.length, 24);
  assert.ok(h.maxActive() <= 3);
});

test("X06 NBA cadence deferrals are not reported as fresh successful coverage", async () => {
  const h = harness("nba", { hours: [8] });
  await h.run();
  const next = await h.run(NOW + 15 * 60000);
  assert.equal(next.status, "not due");
  assert.deepEqual(
    [
      next.details.eligible_events,
      next.details.due_events,
      next.details.not_due_events,
      next.details.attempted_events,
      next.details.budget_deferred_events,
    ],
    [1, 0, 1, 0, 0],
  );
  assert.deepEqual(h.requested, ["e0"]);
});

test("X06 NBA next run can visit a budget-deferred event without exceeding the cap", async () => {
  const h = harness("nba", { limit: 1 });
  await h.run();
  const next = await h.run(NOW + 15 * 60000);
  assert.equal(next.status, "ok");
  assert.equal(next.details.due_events, 1);
  assert.equal(next.details.not_due_events, 1);
  assert.equal(next.details.attempted_events, 1);
  assert.equal(next.details.budget_deferred_events, 0);
  assert.deepEqual(h.requested, ["e0", "e1"]);
});

test("X06 NFL newer failed attempt retains, but cannot refresh, earlier successful evidence", async () => {
  const prior = iso(NOW - 7 * HOUR);
  const h = harness("nfl", {
    hours: [48],
    outcomes: ["ingest-error"],
    previous: {
      provider: "The Odds API props",
      status: "ok",
      details: {
        market_set_version: nflProps.PROP_MARKET_SET_VERSION,
        event_fetch_state_version: 2,
        fetched_at: prior,
        event_fetched_at: { e0: prior },
        event_attempted_at: { e0: prior },
      },
    },
  });
  const run = await h.run();
  assert.equal(run.details.event_fetched_at.e0, prior);
  assert.equal(run.details.event_attempted_at.e0, iso(NOW));
  const next = await h.run(NOW + 15 * 60000);
  assert.equal(next.status, "partial");
  assert.deepEqual(h.requested, ["e0"]);
});

test("X06 NFL event-list failure retains prior success and attempt caches", async () => {
  const h = harness("nfl", { hours: [48] });
  const first = await h.run();
  h.failEventList();
  const next = await h.run(NOW + 6 * HOUR);
  assert.equal(next.status, "error");
  assert.deepEqual(
    next.details.event_fetched_at,
    first.details.event_fetched_at,
  );
  assert.deepEqual(
    next.details.event_attempted_at,
    first.details.event_attempted_at,
  );
  assert.equal(next.details.attempted_at, iso(NOW + 6 * HOUR));
  assert.deepEqual(h.requested, ["e0"]);
});

test("X06 NFL new market set resets both clocks while malformed attempts cannot defer valid work", async () => {
  for (const details of [
    {
      market_set_version: "old",
      event_attempted_at: { e0: iso(NOW) },
      event_fetched_at: { e0: iso(NOW) },
    },
    {
      market_set_version: nflProps.PROP_MARKET_SET_VERSION,
      event_attempted_at: { e0: "bad" },
      event_fetched_at: {},
    },
    {
      market_set_version: nflProps.PROP_MARKET_SET_VERSION,
      event_attempted_at: { e0: iso(NOW + HOUR) },
      event_fetched_at: {},
    },
  ]) {
    const h = harness("nfl", {
      hours: [48],
      previous: {
        provider: "The Odds API props",
        status: "partial",
        details: {
          ...details,
          event_fetch_state_version: 2,
          fetched_at: iso(NOW - 7 * HOUR),
        },
      },
    });
    const run = await h.run();
    assert.deepEqual(h.requested, ["e0"]);
    assert.equal(run.details.event_fetched_at.e0, iso(NOW));
    assert.equal(run.details.event_attempted_at.e0, iso(NOW));
  }
});

test("X06 NFL discovery recovery retries on the next run without resetting due event clocks", async () => {
  const h = harness("nfl", { hours: [48] });
  await h.run();
  h.failEventList();
  const failed = await h.run(NOW + 6 * HOUR);
  assert.equal(failed.status, "error");
  assert.deepEqual(h.requested, ["e0"]);
  h.recoverEventList();
  const recovered = await h.run(NOW + 6 * HOUR + 15 * 60000);
  assert.equal(recovered.status, "ok");
  assert.deepEqual(h.requested, ["e0", "e0"]);
  assert.equal(
    recovered.details.event_fetched_at.e0,
    iso(NOW + 6 * HOUR + 15 * 60000),
  );
});

test("X06 NFL discovery retry preserves paid-event cadence for distant games", async () => {
  const h = harness("nfl", { hours: [1, 48] });
  await h.run();
  h.failEventList();
  assert.equal((await h.run(NOW + 15 * 60000)).status, "error");
  h.recoverEventList();
  const recovered = await h.run(NOW + 30 * 60000);
  assert.equal(recovered.status, "ok");
  assert.equal(h.eventListRequests(), 3);
  assert.deepEqual(h.requested, ["e0", "e1", "e0"]);
  assert.equal(recovered.details.event_fetched_at.e1, iso(NOW));
  assert.equal(recovered.details.event_attempted_at.e1, iso(NOW));
});

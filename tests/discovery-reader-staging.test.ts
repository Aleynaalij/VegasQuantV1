import test from "node:test";
import assert from "node:assert/strict";

// Isolated synthetic adapter exercise. No network, sessions, secrets or database mutations.
test("staging contract exercises the actual reader across four sports and failure states", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://synthetic.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "synthetic-public-fixture";
  const { supabase } = await import("../src/lib/supabase");
  const { readResearchHub } = await import("../src/lib/research-hub-reader");
  const { eventResearchHref, fullMatchupHref } = await import(
    "../src/lib/discovery/model"
  );
  const original = {
    from: supabase.from,
    rpc: supabase.rpc,
    session: supabase.auth.getSession,
    fetch: globalThis.fetch,
  };
  let allowed = true,
    failSport = false;
  const calls: string[] = [];
  const at = new Date(Date.now() + 3600000).toISOString();
  const game = (sport: string) => ({
    id: `synthetic-${sport}`,
    slug: `synthetic-${sport}`,
    away_team: "Sample Visitors",
    home_team: "Sample Hosts",
    kickoff: at,
    tipoff: at,
    sport,
    status: "SCHEDULED",
  });
  globalThis.fetch = async () => {
    throw new Error("Network forbidden in synthetic contract test");
  };
  supabase.auth.getSession = (async () => ({
    data: { session: { user: { id: "synthetic" } } },
    error: null,
  })) as typeof supabase.auth.getSession;
  supabase.rpc = ((name: string, args: Record<string, unknown>) => {
    calls.push(name);
    if (name === "membership_status")
      return Promise.resolve({ data: { allowed }, error: null });
    if (name === "tester_feature_access")
      return Promise.resolve({ data: false, error: null });
    if (name === "sports_slate") {
      const sport = String(args.p_sport);
      return Promise.resolve(
        failSport && sport === "nhl"
          ? { data: null, error: { message: "synthetic unavailable" } }
          : {
              data: {
                version: 1,
                sport,
                access: false,
                games: [
                  {
                    id: `synthetic-${sport}`,
                    slug: `synthetic-${sport}`,
                    sport,
                    away: { name: "Sample Visitors" },
                    home: { name: "Sample Hosts" },
                    start_time: at,
                    status: "SCHEDULED",
                    completed: false,
                  },
                ],
              },
              error: null,
            },
      );
    }
    throw new Error(`Unexpected RPC: ${name}`);
  }) as unknown as typeof supabase.rpc;
  supabase.from = ((table: string) => {
    calls.push(table);
    const result = {
      data:
        table === "games"
          ? [game("nfl")]
          : table === "nba_games"
            ? [game("nba")]
            : [],
      error: null,
    };
    const query: Record<string, unknown> = {};
    for (const key of ["select", "eq", "gte", "lt", "order", "limit", "in"])
      query[key] = () => query;
    query.then = (resolve: (v: unknown) => void) =>
      Promise.resolve(result).then(resolve);
    return query;
  }) as unknown as typeof supabase.from;
  try {
    const data = await readResearchHub();
    assert.deepEqual(data.events.map((e) => e.sport).sort(), [
      "nba",
      "ncaab",
      "nfl",
      "nhl",
    ]);
    assert.equal(data.signedIn, true);
    assert.equal(data.denied, false);
    for (const e of data.events) {
      assert.ok(eventResearchHref(e).includes(encodeURIComponent(e.key)));
      assert.ok(fullMatchupHref(e).includes(e.slug));
    }
    allowed = false;
    const denied = await readResearchHub();
    assert.equal(denied.denied, true);
    assert.equal(denied.findings.length, 0);
    assert.equal(denied.events.length, 4);
    failSport = true;
    const partial = await readResearchHub();
    assert.equal(partial.events.length, 3);
    assert.ok(partial.errors.some((e) => e.includes("NHL")));
    assert.ok(
      !calls.some(
        (name) =>
          /insert|update|delete|publish/.test(name) &&
          name !== "published_legs",
      ),
    );
  } finally {
    supabase.from = original.from;
    supabase.rpc = original.rpc;
    supabase.auth.getSession = original.session;
    globalThis.fetch = original.fetch;
  }
});

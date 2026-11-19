const transport = globalThis.fetch;
let revoked = false;
globalThis.fetch = (input, options) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.hostname === "127.0.0.1") return transport(input, options);
  if (
    url.origin === process.env.NEXT_PUBLIC_SUPABASE_URL &&
    url.pathname === "/rest/v1/rpc/vq_private_access_stage_authorized"
  ) {
    const authorization = new Headers(options?.headers).get("authorization");
    return Promise.resolve(
      Response.json(!revoked && authorization === "Bearer fixture.owner.token"),
    );
  }
  if (url.origin === process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const auth = new Headers(options?.headers).get("authorization");
    if (auth !== "Bearer fixture.owner.token")
      return Promise.resolve(new Response(null, { status: 403 }));
    const rpc = url.pathname.split("/").pop();
    if (url.pathname === "/auth/v1/user")
      return Promise.resolve(
        Response.json({
          id: "11111111-1111-4111-8111-111111111111",
          email: "fixture@example.invalid",
          user_metadata: {},
          app_metadata: { provider: "email" },
        }),
      );
    if (url.pathname === "/auth/v1/logout") {
      revoked = true;
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (rpc === "age_verification_status")
      return Promise.resolve(
        Response.json({ synthetic: true, verified: true }),
      );
    if (rpc === "membership_status")
      return Promise.resolve(Response.json({ allowed: true }));
    if (rpc === "vq_private_access_stage_dealer_feed")
      return Promise.resolve(
        Response.json({
          contract: "vq-stage-dealer-v1",
          posts: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              sport: "nba",
              title: "Synthetic Dealer acceptance",
              body: "Research only. Synthetic fixture.",
              created_at: "2026-11-01T15:00:00Z",
            },
          ],
        }),
      );
    if (rpc === "sports_slate") {
      const sport = JSON.parse(options?.body ?? "{}").p_sport;
      const day = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      const id =
        sport === "nhl"
          ? "22222222-2222-4222-8222-222222222222"
          : "33333333-3333-4333-8333-333333333333";
      const source = {
        url: "https://example.com/synthetic-" + sport,
        sha256: "a".repeat(64),
        retrieved_at: new Date().toISOString(),
      };
      return Promise.resolve(
        Response.json({
          version: 1,
          sport,
          access: true,
          games: [
            {
              id,
              sport,
              slug: "atlas-synthetic-" + sport,
              away: { name: "Atlas " + sport + " Away" },
              home: { name: "Atlas " + sport + " Home" },
              start_time: day + "T23:59:00Z",
              start_time_tbd: false,
              status: "SCHEDULED",
              completed: false,
              source,
            },
          ],
          facts: [
            {
              id: "context-" + sport,
              game_id: id,
              kind: "team_context",
              payload: { note: "Synthetic supported team context" },
              source,
            },
          ],
          markets: [],
          selections: [],
        }),
      );
    }
    if (rpc === "games") {
      const day = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      return Promise.resolve(
        Response.json([
          {
            id: "44444444-4444-4444-8444-444444444444",
            slug: "atlas-synthetic-nfl",
            away_team: "Atlas nfl Away",
            home_team: "Atlas nfl Home",
            kickoff: day + "T23:59:00Z",
            kickoff_tbd: false,
            schedule_source: "https://example.com/synthetic-nfl",
            schedule_observed_at: new Date().toISOString(),
          },
        ]),
      );
    }
    if (
      [
        "analysis_versions",
        "market_snapshots",
        "published_legs",
        "source_observations",
      ].includes(rpc)
    )
      return Promise.resolve(Response.json([]));
    if (rpc === "nba_observations") return Promise.resolve(Response.json([]));
    if (rpc === "nba_games") {
      const day = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      return Promise.resolve(
        Response.json([
          {
            id: "11111111-1111-4111-8111-111111111111",
            slug: "atlas-synthetic-nba",
            away_team: "Atlas Away",
            home_team: "Atlas Home",
            tipoff: day + "T23:59:00Z",
            tipoff_tbd: false,
            status: "SCHEDULED",
            venue: "Synthetic validation",
            source: "https://example.com/synthetic-schedule",
          },
        ]),
      );
    }
  }
  return Promise.reject(
    new Error("External fetch disabled in the staging acceptance test"),
  );
};

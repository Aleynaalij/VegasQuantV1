import { createClient } from "@supabase/supabase-js";
import { upcomingPropEvents, propObservations } from "./props.ts";
import {
  fixturesFromScoreboard,
  observationsFromScoreboard,
  oddsObservations,
  injuryObservations,
  newsObservations,
} from "./normalize.ts";
const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const sha = async (s: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
async function json(url: string) {
  const r = await fetch(url, {
    signal: AbortSignal.timeout(18000),
    headers: {
      "User-Agent": "VegasQuant/1.0 (sports research; vegasquant.app)",
    },
  });
  if (!r.ok) throw Error(`Provider returned ${r.status}`);
  return r.json();
}
Deno.serve(async (req: Request) => {
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return new Response("Unauthorized", { status: 401 });
  const auth = await db.rpc("feed_authorize", { p_digest: await sha(token) });
  if (auth.error || auth.data !== true)
    return new Response("Unauthorized", { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const seed = await json(
      "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard",
    );
    const year = Number(seed.leagues?.[0]?.season?.year),
      week = Number(seed.week?.number || seed.events?.[0]?.week?.number || 1),
      seasonType = Number(seed.leagues?.[0]?.season?.type?.type || 2);
    if (!Number.isInteger(year) || year < 2026 || year > 2030)
      throw Error("Unexpected season");
    const weeks = body.bootstrap
      ? Array.from({ length: 18 }, (_, i) => i + 1)
      : [week, Math.min(week + 1, seasonType === 2 ? 18 : 5)];
    let added = 0;
    for (let i = 0; i < weeks.length; i += 3) {
      const batch = await Promise.all(
        weeks
          .slice(i, i + 3)
          .map((w) =>
            json(
              `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${year}&seasontype=${body.bootstrap ? 2 : seasonType}&week=${w}&limit=1000`,
            ),
          ),
      );
      for (const data of batch) {
        const games = fixturesFromScoreboard(data);
        const observations = observationsFromScoreboard(data);
        for (const o of observations)
          o.fingerprint = await sha(
            JSON.stringify([o.provider_id, o.kind, o.payload]),
          );
        const r = await db.rpc("ingest_source", {
          p: {
            provider: "ESPN",
            games,
            observations,
            details: {
              games: games.length,
              mode: body.bootstrap ? "season import" : "scheduled refresh",
            },
          },
        });
        if (r.error) throw r.error;
        added += r.data.inserted;
      }
    }
    const { data: upcoming, error: gameError } = await db
      .from("games")
      .select("id,away_team,home_team,kickoff")
      .gte("kickoff", new Date(Date.now() - 86400000).toISOString())
      .lte("kickoff", new Date(Date.now() + 8 * 86400000).toISOString());
    if (gameError) throw gameError;
    for (const kind of ["injuries", "news"]) {
      try {
        const data = await json(
          `https://site.api.espn.com/apis/site/v2/sports/football/nfl/${kind}`,
        );
        const observations =
          kind === "injuries"
            ? injuryObservations(data, upcoming || [])
            : newsObservations(data, upcoming || []);
        for (const o of observations)
          o.fingerprint = await sha(
            JSON.stringify([o.game_id, o.kind, o.observed_at, o.payload]),
          );
        const result = await db.rpc("ingest_source", {
          p: { provider: `ESPN ${kind}`, observations },
        });
        if (result.error) throw result.error;
      } catch {
        await db.rpc("ingest_source", {
          p: {
            provider: `ESPN ${kind}`,
            status: "error",
            details: {
              message: "Provider unavailable; previous observations retained",
            },
          },
        });
      }
    }
    const key = Deno.env.get("ODDS_API_KEY");
    if (key && Deno.env.get("ODDS_FEED_ENABLED") === "true") {
      const events = await json(
        `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/?apiKey=${encodeURIComponent(key)}&regions=us&markets=h2h,spreads,totals&oddsFormat=american&bookmakers=fanduel,draftkings`,
      );
      const { data: games, error } = await db
        .from("games")
        .select("id,away_team,home_team,kickoff");
      if (error) throw error;
      const observations = oddsObservations(events, games || []);
      for (const o of observations)
        o.fingerprint = await sha(
          JSON.stringify([o.game_id, o.kind, o.payload]),
        );
      const r = await db.rpc("ingest_source", {
        p: { provider: "The Odds API", observations },
      });
      if (r.error) throw r.error;
    }
    await db.rpc("ingest_source", {
      p: {
        provider: "The Odds API",
        status:
          key && Deno.env.get("ODDS_FEED_ENABLED") === "true"
            ? "ok"
            : "not configured",
        details: {
          books: ["FanDuel", "DraftKings"],
          props: "Requires enabled event-level prop feed",
        },
      },
    });
    let propCount = 0;
    const propsEnabled = Boolean(key && Deno.env.get("ODDS_FEED_ENABLED") === "true" && Deno.env.get("ODDS_PROPS_ENABLED") === "true");
    if (propsEnabled) {
      try {
        const events = await json(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events?apiKey=${encodeURIComponent(key!)}`);
        const selection = upcomingPropEvents(events,upcoming || [],Date.now());
        let failed = 0, empty = 0;
        for (let i=0;i<selection.events.length;i+=3) {
          const results = await Promise.allSettled(selection.events.slice(i,i+3).map(async event => {
            const data = await json(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events/${event.id}/odds?apiKey=${encodeURIComponent(key!)}&markets=player_rush_yds,player_reception_yds&bookmakers=fanduel,draftkings&oddsFormat=american`);
            const observations = propObservations(data,upcoming || [],Date.now());
            for (const o of observations) o.fingerprint = await sha(JSON.stringify([o.game_id,o.kind,o.observed_at,o.payload]));
            const r = await db.rpc("ingest_source",{p:{provider:"The Odds API props",observations}});
            if (r.error) throw r.error;
            return { inserted: r.data.inserted, empty: observations.length===0 };
          }));
          for (const r of results) {
            if (r.status === "rejected") failed++;
            else { propCount += r.value.inserted; if(r.value.empty) empty++; }
          }
        }
        await db.rpc("ingest_source",{p:{provider:"The Odds API props",
          status:failed || empty || selection.skipped ? "partial" : selection.events.length ? "ok" : "no upcoming events",
          details:{events:selection.events.length,failed,empty,skipped:selection.skipped,inserted_quotes:propCount,
            markets:["player_rush_yds","player_reception_yds"],books:["FanDuel","DraftKings"]}}});
      } catch {
        await db.rpc("ingest_source",{p:{provider:"The Odds API props",status:"error",details:{message:"Prop provider unavailable; prior observations retained"}}});
      }
    } else {
      await db.rpc("ingest_source",{p:{provider:"The Odds API props",status:"not configured",
        details:{required:["ODDS_API_KEY","ODDS_FEED_ENABLED=true","ODDS_PROPS_ENABLED=true"],message:"Player-prop provider access required; no prices generated"}}});
    }
    return Response.json({
      ok: true,
      added,
      prop_quotes_inserted: propCount,
      props_configured: propsEnabled,
      odds_configured: Boolean(
        key && Deno.env.get("ODDS_FEED_ENABLED") === "true",
      ),
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Provider ingestion failed";
    await db.rpc("ingest_source", {
      p: {
        provider: "source-sync",
        status: "error",
        details: { message: message.slice(0, 200) },
      },
    });
    return Response.json(
      { error: "Source refresh failed; previous snapshots retained" },
      { status: 502 },
    );
  }
});

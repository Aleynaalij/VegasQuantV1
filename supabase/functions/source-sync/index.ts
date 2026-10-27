import { createClient } from "@supabase/supabase-js";
import {
  upcomingPropEvents,
  propObservations,
  gameForEvent,
  BASE_PROP_MARKETS,
  PROP_MARKET_SET_VERSION,
  propFetchCache,
  PICK_PROP_MARKETS,
} from "./props.ts";
import {
  fixturesFromScoreboard,
  observationsFromScoreboard,
  oddsObservations,
  BOOKMAKERS,
  BOOK_TITLES,
  injuryObservations,
  newsObservations,
} from "./normalize.ts";
import {
  gameLinesDue,
  propsDue,
  propEventDue,
  PROPS_HORIZON,
} from "./cadence.ts";
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
    const oddsOn = Boolean(key && Deno.env.get("ODDS_FEED_ENABLED") === "true");
    // Latest run that called the provider (rows without fetched_at predate the cadence).
    const lastFetch = async (provider: string) => {
      const r = await db
        .from("feed_runs")
        .select("status,details")
        .eq("provider", provider)
        .not("details->>fetched_at", "is", null)
        .order("created_at", { ascending: false })
        .limit(1);
      const row = r.data?.[0];
      const at = Date.parse(row?.details?.fetched_at || "");
      return Number.isFinite(at)
        ? { at, status: row!.status, details: row!.details }
        : null;
    };
    // A run that is not due repeats the last fetch's status and details (same fetched_at),
    // so health checks stay current without spending provider credits.
    const carryForward = (
      provider: string,
      last: NonNullable<Awaited<ReturnType<typeof lastFetch>>>,
    ) =>
      db.rpc("ingest_source", {
        p: {
          provider,
          status: last.status,
          details: { ...last.details, carried_forward: true },
        },
      });
    const kickoffs = (upcoming || []).map((g) => Date.parse(g.kickoff));
    const now = Date.now();
    let oddsCount = 0,
      missingFanDuelEvents = 0;
    const linesLast = oddsOn ? await lastFetch("The Odds API") : null;
    const linesDue =
      oddsOn && gameLinesDue(kickoffs, linesLast?.at ?? null, now);
    if (linesDue) {
      const events = await json(
        `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/?apiKey=${encodeURIComponent(key!)}&regions=us&markets=h2h,spreads,totals&oddsFormat=american&bookmakers=${BOOKMAKERS.join(",")}`,
      );
      const { data: games, error } = await db
        .from("games")
        .select("id,away_team,home_team,kickoff");
      if (error) throw error;
      const observations = oddsObservations(events, games || []);
      oddsCount = observations.length;
      // FanDuel coverage is still reported on its own: it remains the default published book.
      const coveredEvents = new Set(
        observations
          .filter((o) => o.payload.book === "FanDuel" && o.payload.outcomes.length > 0)
          .map((o) => o.payload.event_id),
      );
      missingFanDuelEvents = events.filter(
        (event: { id: string }) => !coveredEvents.has(event.id),
      ).length;
      for (const o of observations)
        o.fingerprint = await sha(
          JSON.stringify([o.game_id, o.kind, o.payload]),
        );
      const r = await db.rpc("ingest_source", {
        p: { provider: "The Odds API", observations },
      });
      if (r.error) throw r.error;
    }
    const gamesAhead = kickoffs.some((k) => k > now && k <= now + 7 * 86400000);
    if (oddsOn && !linesDue && linesLast && gamesAhead)
      await carryForward("The Odds API", linesLast);
    else
      await db.rpc("ingest_source", {
        p: {
          provider: "The Odds API",
          status: !oddsOn
            ? "not configured"
            : !linesDue
              ? "no upcoming events"
              : oddsCount && !missingFanDuelEvents
                ? "ok"
                : "partial",
          details: {
            books: BOOK_TITLES,
            quoted_markets: oddsCount,
            missing_fanduel_events: missingFanDuelEvents,
            fallback_book: null,
            props: "Requires enabled event-level prop feed",
            ...(linesDue ? { fetched_at: new Date(now).toISOString() } : {}),
          },
        },
      });
    let propCount = 0;
    const propsEnabled =
      oddsOn && Deno.env.get("ODDS_PROPS_ENABLED") === "true";
    const propsLast = propsEnabled
      ? await lastFetch("The Odds API props")
      : null;
    if (
      propsEnabled &&
      propsLast &&
      propsLast.details?.market_set_version === PROP_MARKET_SET_VERSION &&
      !propsDue(kickoffs, propsLast.at, now)
    ) {
      await carryForward("The Odds API props", propsLast);
    } else if (propsEnabled) {
      try {
        const events = await json(
          `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events?apiKey=${encodeURIComponent(key!)}`,
        );
        const selection = upcomingPropEvents(
          events,
          upcoming || [],
          now,
          24,
          PROPS_HORIZON,
        );
        // Rate limit per event: a near kickoff must not repeatedly refresh next week's games.
        const previousEventFetches = propFetchCache(propsLast?.details, now);
        const eventFetches: Record<string, string> = {};
        for (const event of selection.events) {
          const previous = previousEventFetches[event.id];
          if (
            typeof previous === "string" &&
            Number.isFinite(Date.parse(previous))
          )
            eventFetches[event.id] = previous;
        }
        const dueEvents = selection.events.filter((event) => {
          const previous = Date.parse(eventFetches[event.id] || "");
          return propEventDue(
            Date.parse(event.commence_time),
            Number.isFinite(previous) ? previous : null,
            now,
          );
        });
        // Games with a published, gradable pick get additional passing/receptions markets.
        const picked = await db.rpc("priced_pick_games", { p_hours: 36 });
        const pickGames = new Set<string>(
          picked.error
            ? []
            : (picked.data || []).map((r: { game_id: string }) => r.game_id),
        );
        let failed = 0,
          empty = 0;
        for (let i = 0; i < dueEvents.length; i += 3) {
          const results = await Promise.allSettled(
            dueEvents.slice(i, i + 3).map(async (event) => {
              eventFetches[event.id] = new Date(now).toISOString();
              const markets = pickGames.has(
                gameForEvent(event, upcoming || [])?.id || "",
              )
                ? PICK_PROP_MARKETS
                : BASE_PROP_MARKETS;
              const data = await json(
                `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events/${event.id}/odds?apiKey=${encodeURIComponent(key!)}&markets=${markets.join(",")}&bookmakers=${BOOKMAKERS.join(",")}&oddsFormat=american`,
              );
              const observations = propObservations(
                data,
                upcoming || [],
                Date.now(),
              );
              for (const o of observations)
                o.fingerprint = await sha(
                  JSON.stringify([o.game_id, o.kind, o.observed_at, o.payload]),
                );
              const r = await db.rpc("ingest_source", {
                p: { provider: "The Odds API props", observations },
              });
              if (r.error) throw r.error;
              return {
                inserted: r.data.inserted,
                empty: observations.length === 0,
              };
            }),
          );
          for (const r of results) {
            if (r.status === "rejected") failed++;
            else {
              propCount += r.value.inserted;
              if (r.value.empty) empty++;
            }
          }
        }
        await db.rpc("ingest_source", {
          p: {
            provider: "The Odds API props",
            status:
              failed || empty || selection.skipped
                ? "partial"
                : selection.events.length
                  ? "ok"
                  : "no upcoming events",
            details: {
              events: dueEvents.length,
              eligible_events: selection.events.length,
              deferred_events: selection.events.length - dueEvents.length,
              horizon_hours: PROPS_HORIZON / 3600000,
              market_set_version: PROP_MARKET_SET_VERSION,
              research_markets: BASE_PROP_MARKETS,
              event_fetched_at: eventFetches,
              failed,
              empty,
              skipped: selection.skipped,
              inserted_quotes: propCount,
              markets: PICK_PROP_MARKETS,
              pick_games: pickGames.size,
              books: BOOK_TITLES,
              fetched_at: dueEvents.length
                ? new Date(now).toISOString()
                : new Date(propsLast?.at || now).toISOString(),
            },
          },
        });
      } catch {
        await db.rpc("ingest_source", {
          p: {
            provider: "The Odds API props",
            status: "error",
            details: {
              message: "Prop provider unavailable; prior observations retained",
              fetched_at: new Date(now).toISOString(),
            },
          },
        });
      }
    } else {
      await db.rpc("ingest_source", {
        p: {
          provider: "The Odds API props",
          status: "not configured",
          details: {
            books: BOOK_TITLES,
            required: [
              "ODDS_API_KEY",
              "ODDS_FEED_ENABLED=true",
              "ODDS_PROPS_ENABLED=true",
            ],
            message:
              "Player-prop provider access required; no prices generated",
          },
        },
      });
    }
    return Response.json({
      ok: true,
      added,
      prop_quotes_inserted: propCount,
      props_configured: propsEnabled,
      odds_configured: oddsOn,
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

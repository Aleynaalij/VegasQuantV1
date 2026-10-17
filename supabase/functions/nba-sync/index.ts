// NBA source refresh: ESPN schedule, scores and injuries; The Odds API game lines and player props.
// Writes only nba_games / nba_observations (through private.ingest_nba) and feed_runs. Paid Odds API
// calls follow cadence.ts and the switches in private.nba_feed_settings; every paid call records the
// provider's remaining-credit headers so the budget is visible in feed_runs.
import { createClient } from "@supabase/supabase-js";
import {
  BOOKMAKERS,
  BOOK_TITLES,
  GAME_MARKETS,
  DEFAULT_PROP_MARKETS,
  gamesFromScoreboard,
  observationsFromScoreboard,
  injuryObservations,
  priceObservations,
  gameForEvent,
  scoreboardRange,
  type OddsEvent,
} from "./normalize.ts";
import { linesDue, propEventDue, PROPS_HORIZON, eventFetchCache } from "./cadence.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const sha = async (s: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
const credits = { remaining: null as number | null, used: null as number | null };
async function json(url: string) {
  const r = await fetch(url, {
    signal: AbortSignal.timeout(18000),
    headers: { "User-Agent": "VegasQuant/1.0 (sports research; vegasquant.app)" },
  });
  if (!r.ok) throw Error(`Provider returned ${r.status}`);
  const remaining = Number(r.headers.get("x-requests-remaining")),
    used = Number(r.headers.get("x-requests-used"));
  if (r.headers.has("x-requests-remaining") && Number.isFinite(remaining)) credits.remaining = remaining;
  if (r.headers.has("x-requests-used") && Number.isFinite(used)) credits.used = used;
  return r.json();
}
type Row = { provider_id?: string; kind: string; observed_at: string | null; payload: unknown; fingerprint: string };
const fingerprint = async (rows: Row[]) => {
  for (const o of rows) o.fingerprint = await sha(JSON.stringify([o.provider_id, o.kind, o.observed_at, o.payload]));
  return rows;
};
const ingest = async (p: Record<string, unknown>) => {
  const r = await db.rpc("ingest_nba", { p });
  if (r.error) throw r.error;
  return r.data as { inserted: number };
};
const recordRun = (provider: string, status: string, details: Record<string, unknown>) =>
  db.rpc("ingest_nba", { p: { provider, status, details } });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return new Response("Unauthorized", { status: 401 });
  const auth = await db.rpc("feed_authorize", { p_digest: await sha(token) });
  if (auth.error || auth.data !== true) return new Response("Unauthorized", { status: 401 });
  const now = Date.now();
  try {
    // 1. Schedule and scores, yesterday through a week ahead.
    const board = await json(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${scoreboardRange(now)}&limit=1000`,
    );
    const fixtures = gamesFromScoreboard(board);
    const scheduled = await ingest({
      provider: "ESPN NBA",
      games: fixtures,
      observations: await fingerprint(observationsFromScoreboard(board)),
      details: { games: fixtures.length, range: scoreboardRange(now) },
    });

    // 2. Injury report for teams playing in the next 48 hours.
    try {
      const report = await json("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries");
      await ingest({ provider: "ESPN NBA injuries", observations: await fingerprint(injuryObservations(report, fixtures, now)) });
    } catch {
      await recordRun("ESPN NBA injuries", "error", { message: "Provider unavailable; previous observations retained" });
    }

    // 3. Prices. Switches live in the database so they can change without a redeploy.
    const key = Deno.env.get("ODDS_API_KEY");
    const settings = (await db.rpc("nba_feed_settings")).data || {};
    const tipoffs = fixtures.map((f) => Date.parse(f.tipoff));
    const lastFetch = async (provider: string) => {
      const r = await db.from("feed_runs").select("details").eq("provider", provider)
        .not("details->>fetched_at", "is", null).order("created_at", { ascending: false }).limit(1);
      const details = r.data?.[0]?.details || null;
      const at = Date.parse(details?.fetched_at || "");
      return { at: Number.isFinite(at) ? at : null, details };
    };

    let lineQuotes = 0;
    if (!key || settings.lines_enabled !== true) {
      await recordRun("The Odds API NBA", "not configured", { books: BOOK_TITLES, lines_enabled: settings.lines_enabled === true });
    } else {
      const last = await lastFetch("The Odds API NBA");
      if (linesDue(tipoffs, last.at, now)) {
        const events: OddsEvent[] = await json(
          `https://api.the-odds-api.com/v4/sports/basketball_nba/odds/?apiKey=${encodeURIComponent(key)}&regions=us&markets=${GAME_MARKETS.join(",")}&oddsFormat=american&bookmakers=${BOOKMAKERS.join(",")}`,
        );
        const rows = await fingerprint(priceObservations(events, fixtures, "odds", GAME_MARKETS, Date.now()));
        lineQuotes = (await ingest({
          provider: "The Odds API NBA",
          observations: rows,
          details: { books: BOOK_TITLES, events: events.length, quotes: rows.length, fetched_at: new Date(now).toISOString(),
            credits_remaining: credits.remaining, credits_used: credits.used },
        })).inserted;
      } else {
        await recordRun("The Odds API NBA", "not due", { ...(last.details || {}), carried_forward: true });
      }
    }

    let propQuotes = 0;
    const markets: string[] = Array.isArray(settings.prop_markets) && settings.prop_markets.length ? settings.prop_markets : DEFAULT_PROP_MARKETS;
    if (!key || settings.props_enabled !== true) {
      await recordRun("The Odds API NBA props", "not configured", { props_enabled: settings.props_enabled === true, markets });
    } else {
      const last = await lastFetch("The Odds API NBA props");
      const marketKey = markets.join(",");
      const fetched = eventFetchCache(last.details, marketKey, now);
      // The events list does not count against the Odds API quota.
      const events: OddsEvent[] = await json(
        `https://api.the-odds-api.com/v4/sports/basketball_nba/events?apiKey=${encodeURIComponent(key)}`,
      );
      const eligible = events
        .filter((e) => gameForEvent(e, fixtures) && /^[a-zA-Z0-9_-]+$/.test(e.id))
        .filter((e) => { const t = Date.parse(e.commence_time); return t > now && t <= now + PROPS_HORIZON; })
        .sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time));
      const limit = Number(settings.max_prop_events) > 0 ? Number(settings.max_prop_events) : 15;
      const dueEvents = eligible
        .filter((e) => propEventDue(Date.parse(e.commence_time), fetched[e.id] ? Date.parse(fetched[e.id]) : null, now))
        .slice(0, limit);
      let failed = 0;
      for (const e of dueEvents) {
        try {
          const data: OddsEvent = await json(
            `https://api.the-odds-api.com/v4/sports/basketball_nba/events/${e.id}/odds?apiKey=${encodeURIComponent(key)}&markets=${markets.join(",")}&bookmakers=${BOOKMAKERS.join(",")}&oddsFormat=american`,
          );
          fetched[e.id] = new Date(now).toISOString();
          propQuotes += (await ingest({ provider: "The Odds API NBA props",
            observations: await fingerprint(priceObservations([data], fixtures, "prop", markets, Date.now())) })).inserted;
        } catch {
          failed++;
        }
      }
      await recordRun("The Odds API NBA props", failed ? "partial" : eligible.length ? "ok" : "no upcoming events", {
        markets, market_key: marketKey, books: BOOK_TITLES, eligible_events: eligible.length, fetched_events: dueEvents.length - failed,
        failed, inserted_quotes: propQuotes, event_fetched_at: fetched, horizon_hours: PROPS_HORIZON / 3600000,
        fetched_at: dueEvents.length ? new Date(now).toISOString() : last.details?.fetched_at ?? null,
        credits_remaining: credits.remaining, credits_used: credits.used,
      });
    }
    return Response.json({ ok: true, games: fixtures.length, inserted: scheduled.inserted, line_quotes: lineQuotes, prop_quotes: propQuotes,
      credits_remaining: credits.remaining });
  } catch (e) {
    const message = e instanceof Error ? e.message : "NBA ingestion failed";
    await recordRun("nba-sync", "error", { message: message.slice(0, 200) });
    return Response.json({ error: "NBA refresh failed; previous snapshots retained" }, { status: 502 });
  }
});

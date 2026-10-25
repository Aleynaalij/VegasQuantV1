import { z } from "zod";
import { requestUser, sameOrigin } from "@/lib/billing-server";
import {
  kalshiTarget,
  kalshiEvent,
  exactKalshiMarket,
  kalshiMarketUrl,
  type KalshiMarket,
} from "@/lib/kalshi";
export const runtime = "nodejs";
const reply = (body: object, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(req: Request) {
  if (!sameOrigin(req)) return reply({ error: "Invalid origin." }, 403);
  const auth = await requestUser(req);
  if (!auth) return reply({ error: "Sign in to check Kalshi." }, 401);
  if (Number(req.headers.get("content-length") || 0) > 10000)
    return reply({ error: "Request too large." }, 413);
  const body = await req.json().catch(() => null);
  const parsed = z
    .object({ keys: z.array(z.string().min(1).max(180)).min(1).max(25) })
    .safeParse(body);
  if (!parsed.success)
    return reply({ error: "Choose published selections." }, 400);
  const keys = [...new Set(parsed.data.keys)];
  const legs = await auth.db
    .from("published_legs")
    .select("leg_key,name,market,game_id,expires_at,result")
    .in("leg_key", keys);
  if (legs.error)
    return reply({ error: "Could not read selections. Please retry." }, 503);
  // Resolve analyst keys from immutable, member-readable tickets, never client targets.
  const analystKeys = keys.map((key) => ({ key, match: /^analyst:([0-9a-f-]{36}):(\d{1,2})$/.exec(key) })).filter((item) => item.match);
  if (analystKeys.length) {
    const tickets = await auth.db.from("nfl_analyst_double_ups")
      .select("id,candidates,expires_at").in("id", [...new Set(analystKeys.map((item) => item.match![1]))]);
    if (tickets.error) return reply({ error: "Could not read selections. Please retry." }, 503);
    for (const { key, match } of analystKeys) {
      const ticket = tickets.data?.find((row) => row.id === match![1]);
      const candidate = ticket?.candidates?.[Number(match![2])];
      if (candidate && typeof candidate.name === "string" && typeof candidate.market === "string") {
        legs.data?.push({ leg_key: key, name: candidate.name, market: candidate.market,
          game_id: candidate.game_id, expires_at: ticket!.expires_at, result: null });
      }
    }
  }
  const ids = [
    ...new Set((legs.data || []).map((l) => l.game_id).filter(Boolean)),
  ];
  const games = ids.length
    ? await auth.db
        .from("games")
        .select("id,away_team,home_team,kickoff,sport")
        .in("id", ids)
    : { data: [], error: null };
  if (games.error)
    return reply({ error: "Could not verify the game. Please retry." }, 503);
  const jobs = keys.map((key) => {
    const leg = legs.data?.find((l) => l.leg_key === key);
    const game = games.data?.find((g) => g.id === leg?.game_id);
    const target = leg ? kalshiTarget(leg.name, leg.market) : null;
    const event =
      target &&
      game &&
      game.sport?.toLowerCase() === "nfl" &&
      !leg?.result &&
      Date.parse(leg?.expires_at || "") > Date.now() &&
      Date.parse(game.kickoff) > Date.now()
        ? kalshiEvent(target, game)
        : null;
    return { key, leg, target, event };
  });
  const events = [
    ...new Set(jobs.map((j) => j.event).filter((v): v is string => !!v)),
  ];
  const snapshots = new Map<string, KalshiMarket[]>();
  let unavailable = false;
  await Promise.all(
    events.map(async (event) => {
      try {
        const r = await fetch(
          `https://external-api.kalshi.com/trade-api/v2/markets?event_ticker=${encodeURIComponent(event)}&status=open&limit=1000`,
          { next: { revalidate: 60 }, signal: AbortSignal.timeout(8000) },
        );
        if (!r.ok) throw Error("Kalshi unavailable");
        const data = await r.json();
        if (!Array.isArray(data.markets) || data.cursor)
          throw Error("Incomplete market response");
        snapshots.set(event, data.markets);
      } catch {
        unavailable = true;
      }
    }),
  );
  const observedAt = new Date().toISOString();
  return reply({
    checked_at: observedAt,
    results: jobs.map((j) => {
      const market =
        j.event && j.target
          ? exactKalshiMarket(j.target, j.event, snapshots.get(j.event) || [])
          : null;
      return {
        key: j.key,
        label: j.leg
          ? `${j.leg.name} · ${j.leg.market}`
          : "Selection unavailable",
        url: market && j.target ? kalshiMarketUrl(market, j.target) : null,
        status: market
          ? "MATCH"
          : j.event && !snapshots.has(j.event)
            ? "UNAVAILABLE"
            : "NO_MATCH",
      };
    }),
    unavailable,
  });
}

import { timingSafeEqual } from "node:crypto";
import { serviceDb } from "@/lib/billing-server";
import { fetchLiveBox, fetchLiveGames } from "@/lib/live-fetch";
import { planAlerts, type AlertCandidate } from "@/lib/live-alerts";
import { dispatchLiveAlerts } from "@/lib/live-alert-dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The existing database job wakes for live candidates or durable Zone retries. The two lanes
 * are independent; a score-feed outage cannot strand accepted results or replay their alerts.
 */
export async function POST(req: Request) {
  const supplied = req.headers.get("x-vq-dispatch");
  if (!supplied || supplied.length > 200)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const db = serviceDb();
    const config = await db.rpc("push_server_config");
    if (config.error || !config.data) throw Error("Unavailable");
    const expected = Buffer.from(config.data.dispatch_secret),
      actual = Buffer.from(supplied);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    const result = await dispatchLiveAlerts({
      candidates: async () => {
        const r = await db.rpc("live_pick_candidates");
        if (r.error) throw Error("Unavailable");
        return (r.data || []) as AlertCandidate[];
      },
      plan: (rows) => planAlerts(rows, fetchLiveGames, fetchLiveBox),
      publish: async (a) => {
        const r = await db.rpc("live_pick_alert", {
          p_sport: a.sport,
          p_pick: a.pick,
          p_message: a.message,
          p_link: a.link,
        });
        if (r.error) throw Error("Unavailable");
      },
      retryZone: async () => {
        const r = await db.rpc("retry_live_pick_zone_posts");
        if (r.error || !r.data) throw Error("Unavailable");
        const { attempted, posted, failed } = r.data;
        return { attempted, posted, failed };
      },
      zoneHealth: async () => {
        const r = await db.rpc("live_pick_zone_health");
        if (r.error || !r.data) throw Error("Unavailable");
        const { pending, due, blocked } = r.data;
        return { pending, due, blocked };
      },
    });
    return Response.json(result, {
      status: result.ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Live alerts unavailable" }, { status: 503 });
  }
}

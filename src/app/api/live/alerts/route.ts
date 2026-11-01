import { timingSafeEqual } from "node:crypto";
import { serviceDb } from "@/lib/billing-server";
import { fetchLiveBox, fetchLiveGames } from "@/lib/live-fetch";
import { planAlerts, type AlertCandidate } from "@/lib/live-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Called every two minutes by the database while picked games are live (same dispatch secret as
 * push delivery). Each decided pick is sent to public.live_pick_alert, which fans it out once.
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
    const c = await db.rpc("live_pick_candidates");
    if (c.error) throw Error("Unavailable");
    const planned = await planAlerts(
      (c.data || []) as AlertCandidate[],
      fetchLiveGames,
      fetchLiveBox,
    );
    let sent = 0,
      failed = 0;
    for (const a of planned) {
      const r = await db.rpc("live_pick_alert", {
        p_sport: a.sport,
        p_pick: a.pick,
        p_message: a.message,
        p_link: a.link,
      });
      if (r.error) failed++;
      else sent++;
    }
    return Response.json(
      {
        candidates: (c.data || []).length,
        decided: planned.length,
        sent,
        failed,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "Live alerts unavailable" }, { status: 503 });
  }
}

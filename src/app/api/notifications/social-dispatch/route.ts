import { timingSafeEqual } from "node:crypto";
import { serviceDb } from "@/lib/billing-server";
import {
  deliverSocialNotification,
  type SocialDeliveryJob,
} from "@/lib/social-notification-delivery";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(req: Request) {
  const supplied = req.headers.get("x-vq-dispatch");
  if (!supplied || supplied.length > 200)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const db = serviceDb(),
      config = await db.rpc("push_server_config");
    if (config.error || !config.data) throw Error("Configuration unavailable");
    const expected = Buffer.from(config.data.dispatch_secret),
      actual = Buffer.from(supplied);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    const claimed = await db.rpc("claim_social_notification_deliveries");
    if (claimed.error) throw Error("Claim failed");
    const jobs = (claimed.data || []) as SocialDeliveryJob[];
    const totals = { sent: 0, retry: 0, blocked: 0, expired: 0, suppressed: 0 };
    // Five concurrent network sends, bounded batch and per-request execution time.
    for (let i = 0; i < jobs.length; i += 5)
      await Promise.all(
        jobs.slice(i, i + 5).map(async (job) => {
          const allowed = await db.rpc("social_notification_delivery_allowed", {
            p_id: job.id,
            p_lease: job.lease,
          });
          if (allowed.error) throw Error("Eligibility unavailable");
          const result = allowed.data
            ? await deliverSocialNotification(job, config.data)
            : { status: "suppressed" as const, error: "no_longer_eligible" };
          const finished = await db.rpc("finish_social_notification_delivery", {
            p_id: job.id,
            p_lease: job.lease,
            p_status: result.status,
            p_error: result.error || null,
          });
          if (finished.error) throw Error("Acknowledgment failed");
          totals[result.status]++;
        }),
      );
    return Response.json(totals, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { error: "Notification delivery temporarily unavailable" },
      { status: 503 },
    );
  }
}

import { sendPushTest } from "@/lib/push-test-server";
import { timingSafeEqual } from "node:crypto";
import webpush from "web-push";
import { serviceDb } from "@/lib/billing-server";
import { validPushEndpoint } from "@/lib/push";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
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
    const body = await req.json().catch(() => ({}));
    if (body.test_user_id) {
      if (
        typeof body.test_user_id !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(body.test_user_id)
      )
        return Response.json({ error: "Invalid user" }, { status: 400 });
      return Response.json(await sendPushTest(body.test_user_id), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    const claimed = await db.rpc("claim_push_deliveries");
    if (claimed.error) throw Error("Unavailable");
    let sent = 0,
      failed = 0;
    await Promise.all(
      (
        claimed.data as {
          id: string;
          pick_id: string;
          event_key?: string;
          type: "official" | "research" | "signup" | "health";
          endpoint: string;
          keys: { p256dh: string; auth: string };
        }[]
      ).map(async (job) => {
        let delivered = false,
          expired = false;
        try {
          const eligible = await db.rpc("age_push_delivery_allowed", {
            p_delivery: job.id,
          });
          if (eligible.error) throw Error("Age eligibility unavailable");
          if (!eligible.data) return; // Keep research out of unverified accounts, including queued deliveries.
          if (!validPushEndpoint(job.endpoint)) expired = true;
          else {
            await webpush.sendNotification(
              { endpoint: job.endpoint, keys: job.keys },
              JSON.stringify({
                pick_id: job.pick_id,
                type: job.type,
                ...(job.event_key?.startsWith("app-update:")
                  ? {
                      announcement:
                        "Vegas Quant has been updated. Open the app for the new design, game board and community.",
                    }
                  : {}),
              }),
              {
                TTL: 1800,
                timeout: 8000,
                vapidDetails: {
                  subject: "https://vegasquant.app",
                  publicKey: config.data.public_key,
                  privateKey: config.data.private_key,
                },
              },
            );
            delivered = true;
            sent++;
          }
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          expired = code === 404 || code === 410;
          failed++;
        }
        const result = await db.rpc("finish_push_delivery", {
          p_id: job.id,
          p_sent: delivered,
          p_expired: expired,
        });
        if (result.error) throw Error("Delivery acknowledgment failed");
      }),
    );
    return Response.json(
      { sent, failed },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Notification service unavailable" },
      { status: 503 },
    );
  }
}

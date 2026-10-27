import webpush from "web-push";
import { serviceDb } from "./billing-server";
import { validPushEndpoint } from "./push";
export async function sendPushTest(
  userId: string,
  endpoint: string | null = null,
) {
  const db = serviceDb();
  const config = await db.rpc("push_server_config");
  if (config.error || !config.data)
    throw Error("Push configuration unavailable");
  const jobs = await db.rpc("claim_push_test", {
    p_user: userId,
    p_endpoint: endpoint,
  });
  if (jobs.error) throw Error("Test queue unavailable");
  let sent = 0,
    failed = 0;
  await Promise.all(
    (
      jobs.data as {
        id: string;
        endpoint: string;
        keys: { p256dh: string; auth: string };
      }[]
    ).map(async (job) => {
      try {
        if (!validPushEndpoint(job.endpoint)) throw Error("Invalid endpoint");
        await webpush.sendNotification(
          { endpoint: job.endpoint, keys: job.keys },
          JSON.stringify({ type: "test" }),
          {
            TTL: 300,
            timeout: 8000,
            vapidDetails: {
              subject: "https://vegasquant.app",
              publicKey: config.data.public_key,
              privateKey: config.data.private_key,
            },
          },
        );
        sent++;
      } catch (e) {
        failed++;
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410)
          await db
            .from("push_subscriptions")
            .delete()
            .eq("id", job.id)
            .eq("user_id", userId);
      }
    }),
  );
  return { sent, failed };
}

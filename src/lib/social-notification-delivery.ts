import webpush from "web-push";
import { validPushEndpoint } from "./push";
import { notificationPushPayload, notificationLink } from "./notifications";
export type SocialDeliveryJob = {
  id: string;
  lease: string;
  channel: "push" | "email";
  notification_id: string;
  recipient_id: string;
  type: string;
  priority: string;
  deep_link: string;
  endpoint: string | null;
  keys: { p256dh: string; auth: string };
  email: string;
};
export type DeliveryResult = {
  status: "sent" | "retry" | "blocked" | "expired" | "suppressed";
  error?: string;
};
/** No content previews on lock screens or in email. Provider acceptance is not proof of a device display. */
export async function deliverSocialNotification(
  job: SocialDeliveryJob,
  config: { public_key: string; private_key: string },
): Promise<DeliveryResult> {
  if (job.channel === "push") {
    if (!job.endpoint || !validPushEndpoint(job.endpoint))
      return { status: "expired", error: "invalid_push_endpoint" };
    try {
      await webpush.sendNotification(
        { endpoint: job.endpoint, keys: job.keys },
        JSON.stringify(notificationPushPayload(job)),
        {
          TTL: job.priority === "critical" ? 3600 : 1800,
          timeout: 7000,
          vapidDetails: {
            subject: "https://vegasquant.app",
            publicKey: config.public_key,
            privateKey: config.private_key,
          },
        },
      );
      return { status: "sent" };
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      return {
        status: status === 404 || status === 410 ? "expired" : "retry",
        error: status ? `push_${status}` : "push_network",
      };
    }
  }
  if (!process.env.RESEND_API_KEY || !process.env.NOTIFICATION_EMAIL_FROM)
    return { status: "blocked", error: "email_not_configured" };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `vq-notification-${job.id}`,
      },
      body: JSON.stringify({
        from: process.env.NOTIFICATION_EMAIL_FROM,
        to: [job.email],
        subject: "Important Vegas Quant notification",
        text: `You have an important account or message notification. Review it securely in Vegas Quant:\n\nhttps://vegasquant.app${notificationLink(job.deep_link)}\n\nManage delivery preferences: https://vegasquant.app/notifications`,
      }),
      signal: AbortSignal.timeout(7000),
    });
    if (response.ok) return { status: "sent" };
    return {
      status:
        response.status === 429 || response.status >= 500 ? "retry" : "blocked",
      error: `email_${response.status}`,
    };
  } catch {
    return { status: "retry", error: "email_network" };
  }
}

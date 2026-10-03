import {
  billingEnabled,
  billingMode,
  stripeClient,
  appOrigin,
} from "./billing-server";
const events = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "charge.refunded",
  "charge.dispute.created",
];
type Readiness = {
  account: "ready" | "needs_review" | "not_verified";
  webhook: "ready" | "not_verified";
};
let cached: { until: number; value: Readiness } | undefined;
export async function billingReadiness(): Promise<Readiness> {
  if (!billingEnabled() || billingMode() !== "live")
    return { account: "not_verified", webhook: "not_verified" };
  if (cached && cached.until > Date.now()) return cached.value;
  const stripe = stripeClient();
  const results = await Promise.allSettled([
    stripe.accounts.retrieveCurrent(
      {},
      { timeout: 7000, maxNetworkRetries: 0 },
    ),
    stripe.webhookEndpoints.list(
      { limit: 100 },
      { timeout: 7000, maxNetworkRetries: 0 },
    ),
  ]);
  const account =
    results[0].status === "fulfilled"
      ? results[0].value.charges_enabled
        ? "ready"
        : "needs_review"
      : "not_verified";
  const webhook =
    results[1].status === "fulfilled" &&
    results[1].value.data.some(
      (w) =>
        w.status === "enabled" &&
        w.url === `${appOrigin()}/api/stripe/webhook` &&
        (w.enabled_events.includes("*") ||
          events.every((e) =>
            w.enabled_events.includes(e as (typeof w.enabled_events)[number]),
          )),
    )
      ? "ready"
      : "not_verified";
  const value: Readiness = { account, webhook };
  cached = { until: Date.now() + 300000, value };
  return value;
}

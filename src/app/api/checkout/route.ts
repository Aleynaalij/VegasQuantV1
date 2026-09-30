import { randomUUID } from "node:crypto";
import { passQuote } from "@/lib/membership";
import {
  appOrigin,
  billingEnabled,
  billingMode,
  requestUser,
  serviceDb,
  stripeClient,
} from "@/lib/billing-server";
export async function POST(req: Request) {
  if (!billingEnabled())
    return Response.json(
      { error: "Checkout is not configured yet." },
      { status: 503 },
    );
  if (req.headers.get("origin") !== appOrigin())
    return Response.json({ error: "Invalid origin." }, { status: 403 });
  const auth = await requestUser(req);
  if (!auth)
    return Response.json(
      { error: "Sign in with a confirmed email." },
      { status: 401 },
    );
  try {
    const body = await req.json();
    if (!["full", "half"].includes(body.plan))
      return Response.json({ error: "Invalid pass." }, { status: 400 });
    const quote = passQuote(body.plan);
    if (!quote)
      return Response.json(
        { error: "The 2026 season has ended." },
        { status: 409 },
      );
    const { data: access } = await auth.db.rpc("membership_status");
    if (access?.allowed || access?.admin_account)
      return Response.json(
        { error: "You already have access; no purchase is needed." },
        { status: 409 },
      );
    const db = serviceDb();
    const { data: order, error } = await db.rpc("billing_order", {
      p_id: randomUUID(),
      p_user: auth.user.id,
      p_plan: quote.plan,
      p_expires: quote.expires_at,
    });
    if (error)
      return Response.json(
        {
          error:
            "An active pass or pending checkout may already exist. Retry your original plan or wait 31 minutes.",
        },
        { status: 409 },
      );
    const stripe = stripeClient();
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: auth.user.email,
        client_reference_id: auth.user.id,
        expires_at:
          Math.floor(new Date(order.created_at).getTime() / 1000) + 1800,
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: order.amount,
              product_data: {
                name: `Vegas Quant — 2026 ${quote.plan === "full" ? "full" : "half"} season access`,
                description: `Access expires ${new Date(order.expires_at).toISOString()}. Sports analysis only. No wagers or prizes. No automatic renewal.`,
              },
            },
            quantity: 1,
          },
        ],
        metadata: {
          order_id: order.id,
          user_id: auth.user.id,
          mode: billingMode(),
        },
        payment_intent_data: { metadata: { order_id: order.id } },
        success_url: `${appOrigin()}/membership?payment=received`,
        cancel_url: `${appOrigin()}/membership?payment=cancelled`,
      },
      { idempotencyKey: `vq-order-${order.id}` },
    );
    const linked = await db.rpc("billing_link", {
      p_order: order.id,
      p_checkout: session.id,
    });
    if (linked.error) throw linked.error;
    return Response.json(
      { url: session.url },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Checkout could not be started. Please try again." },
      { status: 502 },
    );
  }
}

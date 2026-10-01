import Stripe from "stripe";
import {syncSubscription, idOf} from "@/lib/subscription-sync";
import {
  billingEnabled,
  billingMode,
  serviceDb,
  stripeClient,
} from "@/lib/billing-server";
export async function POST(req: Request) {
  if (!billingEnabled())
    return new Response("Billing unavailable", { status: 503 });
  const stripe = stripeClient();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      await req.text(),
      req.headers.get("stripe-signature") || "",
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  if (event.livemode !== (billingMode() === "live"))
    return new Response("Wrong payment mode", { status: 400 });
  // Test money must never unlock production research.
  if (!event.livemode)
    return Response.json({ received: true, test_only: true });
  const db = serviceDb();
  try {
    if (event.type.startsWith("customer.subscription.")) {
      await syncSubscription(stripe, (event.data.object as Stripe.Subscription).id, event);
      return Response.json({received:true});
    }
    if (["invoice.paid", "invoice.payment_failed", "invoice.payment_action_required"].includes(event.type)) {
      const inv = await stripe.invoices.retrieve((event.data.object as Stripe.Invoice).id);
      const sid = idOf(inv.parent?.subscription_details?.subscription);
      if(sid) await syncSubscription(stripe, sid, event, inv.id);
      return Response.json({received:true});
    }
    if (
      [
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
      ].includes(event.type)
    ) {
      const object = event.data.object as Stripe.Checkout.Session;
      const session = await stripe.checkout.sessions.retrieve(object.id);
      if (session.mode === "subscription") {
        const sid = idOf(session.subscription);
        if(sid) await syncSubscription(stripe, sid, event);
        return Response.json({received:true});
      }
      if (session.payment_status !== "paid")
        return Response.json({ received: true });
      const intentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id;
      if (
        !intentId ||
        !session.metadata?.order_id ||
        session.currency !== "usd" ||
        !session.amount_total
      )
        throw new Error("Invalid payment");
      const pi = await stripe.paymentIntents.retrieve(intentId, {
        expand: ["latest_charge"],
      });
      const charge = pi.latest_charge as Stripe.Charge | null;
      if (
        pi.status !== "succeeded" ||
        !charge ||
        charge.refunded ||
        charge.amount_refunded > 0 ||
        charge.disputed
      ) {
        const r = await db.rpc("billing_revoke", {
          p_intent: intentId,
          p_event: event.id,
          p_type: event.type,
        });
        if (r.error) throw r.error;
        return Response.json({ received: true });
      }
      const r = await db.rpc("billing_fulfill", {
        p_order: session.metadata.order_id,
        p_checkout: session.id,
        p_intent: intentId,
        p_amount: session.amount_total,
        p_event: event.id,
        p_type: event.type,
      });
      if (r.error) throw r.error;
    } else if (
      event.type === "charge.refunded" ||
      event.type === "charge.dispute.created"
    ) {
      const object = event.data.object as Stripe.Charge | Stripe.Dispute;
      const id =
        typeof object.payment_intent === "string"
          ? object.payment_intent
          : object.payment_intent?.id;
      if (id) {
        const r = await db.rpc("billing_revoke", {
          p_intent: id,
          p_event: event.id,
          p_type: event.type,
        });
        if (r.error) throw r.error;
      }
    }
    return Response.json({ received: true });
  } catch {
    return new Response("Payment processing failed; retry required", {
      status: 500,
    });
  }
}

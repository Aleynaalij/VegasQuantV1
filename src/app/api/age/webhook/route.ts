import type Stripe from "stripe";
import {
  identityConfigured,
  identityClient,
  synchronizeAge,
  type AgeAttempt,
} from "@/lib/age-server";
import { serviceDb } from "@/lib/billing-server";
export async function POST(req: Request) {
  if (!identityConfigured())
    return new Response("Identity unavailable", { status: 503 });
  const stripe = identityClient();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      await req.text(),
      req.headers.get("stripe-signature") || "",
      process.env.STRIPE_IDENTITY_WEBHOOK_SECRET!,
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  if (!event.livemode)
    return Response.json({ received: true, test_only: true });
  if (
    ![
      "identity.verification_session.verified",
      "identity.verification_session.requires_input",
      "identity.verification_session.processing",
      "identity.verification_session.canceled",
    ].includes(event.type)
  )
    return Response.json({ received: true });
  try {
    const s = event.data.object as Stripe.Identity.VerificationSession;
    if (!s.client_reference_id || !s.metadata.age_attempt_id)
      return Response.json({ received: true });
    const r = await serviceDb().rpc("age_check_latest", {
      p_user: s.client_reference_id,
    });
    if (r.error) throw Error("Database unavailable");
    const attempt = r.data as AgeAttempt | null;
    // Ignore old attempts and deleted accounts; a late event cannot revive access.
    if (
      !attempt ||
      attempt.id !== s.metadata.age_attempt_id ||
      attempt.provider_session !== s.id
    )
      return Response.json({ received: true });
    await synchronizeAge(s.client_reference_id, attempt);
    return Response.json({ received: true });
  } catch {
    return new Response("Verification could not be recorded; retry", {
      status: 503,
    });
  }
}

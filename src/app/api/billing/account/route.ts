import {
  appOrigin,
  billingEnabled,
  requestUser,
  serviceDb,
  stripeClient,
} from "@/lib/billing-server";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const auth = await requestUser(req);
  if (!auth)
    return Response.json({ error: "Sign in required" }, { status: 401 });
  try {
    const { data, error } = await serviceDb().rpc("billing_account", {
      p_user: auth.user.id,
    });
    if (error) throw error;
    return Response.json(
      {
        subscription: data
          ? {
              status: data.status,
              cancel_at_period_end: data.cancel_at_period_end,
              paid_until: data.paid_until,
              blocked: data.blocked,
            }
          : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Billing status unavailable" },
      { status: 503 },
    );
  }
}
export async function POST(req: Request) {
  if (req.headers.get("origin") !== appOrigin())
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  const auth = await requestUser(req);
  if (!auth)
    return Response.json({ error: "Sign in required" }, { status: 401 });
  if (!billingEnabled())
    return Response.json(
      { error: "Billing is not configured" },
      { status: 503 },
    );
  try {
    const { data, error } = await serviceDb().rpc("billing_account", {
      p_user: auth.user.id,
    });
    if (error || !data)
      return Response.json({ error: "No subscription found" }, { status: 404 });
    const stripe = stripeClient();
    // Customer comes exclusively from our server-side account mapping, never the browser.
    const portal = await stripe.billingPortal.sessions.create({
      customer: data.customer_id,
      return_url: `${appOrigin()}/membership`,
    });
    return Response.json(
      { url: portal.url },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Billing portal unavailable. Please contact support." },
      { status: 502 },
    );
  }
}

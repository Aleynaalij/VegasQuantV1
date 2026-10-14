export type ErasurePlan = {
  lease: string;
  storage_paths?: string[];
  orders: { id: string; checkout_id: string | null }[];
  subscriptions: { id: string; order_id: string; customer_id: string }[];
};
type Reference = string | { id: string } | null;
type Checkout = {
  status: string | null;
  metadata: Record<string, string> | null;
  client_reference_id: string | null;
  subscription: Reference;
};
type Subscription = {
  status: string;
  metadata: Record<string, string>;
  customer: Reference;
};
export type ErasureBilling = {
  checkout: {
    retrieve(id: string): Promise<Checkout>;
    expire(id: string): Promise<unknown>;
  };
  subscriptions: {
    retrieve(id: string): Promise<Subscription>;
    cancel(
      id: string,
      params: { invoice_now: false; prorate: false },
    ): Promise<unknown>;
  };
};
const ref = (value: Reference) =>
  typeof value === "string" ? value : value?.id;
/** Cancel only verified Vegas Quant resources belonging to this account. */
export async function stopErasureBilling(
  user: string,
  plan: ErasurePlan,
  billing: ErasureBilling,
) {
  const orders = new Set(plan.orders.map((o) => o.id));
  const subscriptions = new Map(
    plan.subscriptions.map((s) => [s.id, s.customer_id]),
  );
  for (const order of plan.orders) {
    if (!order.checkout_id) continue;
    let session = await billing.checkout.retrieve(order.checkout_id);
    const check = () => {
      if (
        session.metadata?.order_id !== order.id ||
        (session.client_reference_id && session.client_reference_id !== user) ||
        (session.metadata?.user_id && session.metadata.user_id !== user)
      )
        throw Error("Billing owner mismatch");
    };
    check();
    if (session.status === "open") {
      try {
        await billing.checkout.expire(order.checkout_id);
      } catch {
        // Checkout might have completed between retrieval and expiration.
        session = await billing.checkout.retrieve(order.checkout_id);
        check();
        if (session.status !== "complete" && session.status !== "expired")
          throw Error("Checkout could not be stopped");
      }
    }
    const id = ref(session.subscription);
    if (id && !subscriptions.has(id)) subscriptions.set(id, "");
  }
  // Verify the entire batch before cancelling any subscription.
  const cancel: string[] = [];
  for (const [id, customer] of subscriptions) {
    const sub = await billing.subscriptions.retrieve(id);
    if (
      !orders.has(sub.metadata.order_id) ||
      (sub.metadata.user_id && sub.metadata.user_id !== user) ||
      (customer && customer !== ref(sub.customer))
    )
      throw Error("Billing owner mismatch");
    if (sub.status !== "canceled" && sub.status !== "incomplete_expired")
      cancel.push(id);
  }
  for (const id of cancel)
    await billing.subscriptions.cancel(id, {
      invoice_now: false,
      prorate: false,
    });
}

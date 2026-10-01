import Stripe from 'stripe';
import { serviceDb } from './billing-server';
const idOf = (v: string | {id:string} | null | undefined) => typeof v === 'string' ? v : v?.id;
export async function syncSubscription(stripe: Stripe, id: string, event: Stripe.Event, invoiceId?: string) {
  const sub = await stripe.subscriptions.retrieve(id);
  if (!sub.metadata.order_id) return; // Other products on the owner's Stripe account.
  const item = sub.items.data[0];
  if (sub.items.data.length !== 1 || item.quantity !== 1 || item.price.unit_amount !== 500 || item.price.currency !== 'usd' || item.price.recurring?.interval !== 'month' || item.price.recurring.interval_count !== 1) throw Error('Unexpected subscription price');
  const payload: Record<string, unknown> = { id: sub.id, order_id: sub.metadata.order_id, customer_id: idOf(sub.customer), status: sub.status, cancel_at_period_end: sub.cancel_at_period_end, event_id: event.id, event_type: event.type };
  const invoice = invoiceId || idOf(sub.latest_invoice);
  if (invoice) {
    const inv = await stripe.invoices.retrieve(invoice, {expand:['payments']});
    if (idOf(inv.parent?.subscription_details?.subscription) !== sub.id || idOf(inv.customer) !== idOf(sub.customer)) throw Error('Invoice owner mismatch');
    if (inv.status === 'paid' && inv.amount_paid === 500 && inv.currency === 'usd') {
      const line = inv.lines.data.find(l => l.parent?.subscription_item_details?.subscription_item === item.id);
      const payment = inv.payments?.data.find(p => p.status === 'paid' && p.payment.type === 'payment_intent');
      const intentId = idOf(payment?.payment.payment_intent);
      if (!line || !intentId) throw Error('Verified card payment required');
      const pi = await stripe.paymentIntents.retrieve(intentId, {expand:['latest_charge']});
      const charge = pi.latest_charge as Stripe.Charge | null;
      if (pi.status !== 'succeeded' || !charge || charge.refunded || charge.amount_refunded > 0 || charge.disputed) {
        // Insert no entitlement for an already refunded payment.
        const result = await serviceDb().rpc('billing_subscription_sync', {p:payload});
        if(result.error) throw result.error;
        const revoked = await serviceDb().rpc('billing_subscription_block', {p_id:sub.id, p_event:event.id, p_type:event.type});
        if(revoked.error) throw revoked.error;
        return;
      }
      Object.assign(payload, {invoice_id:inv.id, payment_intent:intentId, amount_paid:inv.amount_paid, period_end:new Date(line.period.end*1000).toISOString()});
    }
  }
  const result = await serviceDb().rpc('billing_subscription_sync', {p:payload});
  if(result.error) throw result.error;
}
export {idOf};

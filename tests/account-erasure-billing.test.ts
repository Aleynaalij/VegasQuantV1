import test from "node:test";
import assert from "node:assert/strict";
import {
  stopErasureBilling,
  type ErasurePlan,
  type ErasureBilling,
} from "../src/lib/account-erasure-billing";
const plan: ErasurePlan = {
  lease: "lease",
  orders: [{ id: "order-a", checkout_id: "checkout-a" }],
  subscriptions: [
    { id: "sub-a", order_id: "order-a", customer_id: "customer-a" },
  ],
};
function provider() {
  const calls: string[] = [];
  const api: ErasureBilling = {
    checkout: {
      retrieve: async () => ({
        status: "open",
        metadata: { order_id: "order-a", user_id: "user-a" },
        client_reference_id: "user-a",
        subscription: null,
      }),
      expire: async () => {
        calls.push("expire");
      },
    },
    subscriptions: {
      retrieve: async () => ({
        status: "active",
        metadata: { order_id: "order-a", user_id: "user-a" },
        customer: "customer-a",
      }),
      cancel: async (id, params) => {
        assert.deepEqual(params, { invoice_now: false, prorate: false });
        calls.push(`cancel:${id}`);
      },
    },
  };
  return { calls, api };
}
test("expiration precedes renewal cancellation and requests no invoice/proration", async () => {
  const { calls, api } = provider();
  await stopErasureBilling("user-a", plan, api);
  assert.deepEqual(calls, ["expire", "cancel:sub-a"]);
});
test("mismatched checkout owner aborts without cancellation", async () => {
  const { calls, api } = provider();
  api.checkout.retrieve = async () => ({
    status: "open",
    metadata: { order_id: "order-a", user_id: "other-user" },
    client_reference_id: "other-user",
    subscription: null,
  });
  await assert.rejects(
    stopErasureBilling("user-a", plan, api),
    /owner mismatch/,
  );
  assert.deepEqual(calls, []);
});
test("verifies every subscription before cancelling any", async () => {
  const { calls, api } = provider();
  api.subscriptions.retrieve = async (id) => ({
    status: "active",
    metadata: { order_id: id === "sub-a" ? "order-a" : "foreign-order" },
    customer: id === "sub-a" ? "customer-a" : "foreign-customer",
  });
  const p = {
    ...plan,
    subscriptions: [
      ...plan.subscriptions,
      { id: "sub-b", order_id: "order-a", customer_id: "foreign-customer" },
    ],
  };
  await assert.rejects(stopErasureBilling("user-a", p, api), /owner mismatch/);
  assert.deepEqual(calls, ["expire"]);
});
test("a checkout completing during expiration reveals a subscription to cancel", async () => {
  const { calls, api } = provider();
  let count = 0;
  api.checkout.retrieve = async () => ({
    status: count++ ? "complete" : "open",
    metadata: { order_id: "order-a" },
    client_reference_id: "user-a",
    subscription: count > 1 ? "sub-new" : null,
  });
  api.checkout.expire = async () => {
    throw Error("already complete");
  };
  api.subscriptions.retrieve = async () => ({
    status: "active",
    metadata: { order_id: "order-a", user_id: "user-a" },
    customer: "new-customer",
  });
  await stopErasureBilling("user-a", { ...plan, subscriptions: [] }, api);
  assert.deepEqual(calls, ["cancel:sub-new"]);
});
test("an expiration failure leaves cancellation untouched and propagates failure", async () => {
  const { calls, api } = provider();
  api.checkout.expire = async () => {
    throw Error("network failure");
  };
  await assert.rejects(
    stopErasureBilling("user-a", plan, api),
    /could not be stopped/,
  );
  assert.deepEqual(calls, []);
});
test("already canceled subscriptions can be retried without another cancellation", async () => {
  const { calls, api } = provider();
  api.checkout.retrieve = async () => ({
    status: "expired",
    metadata: { order_id: "order-a" },
    client_reference_id: null,
    subscription: null,
  });
  api.subscriptions.retrieve = async () => ({
    status: "canceled",
    metadata: { order_id: "order-a" },
    customer: "customer-a",
  });
  await stopErasureBilling("user-a", plan, api);
  assert.deepEqual(calls, []);
});

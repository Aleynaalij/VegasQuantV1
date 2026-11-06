import test from "node:test";
import assert from "node:assert/strict";
import { resolveWorkshopAccess } from "../src/lib/parlay-workshop-access";
const signedIn = {
  data: { session: { user: { id: "account-a" } } },
  error: null,
};
test("workshop waits for session before membership and does not read protected data for visitors", async () => {
  let checks = 0;
  const visitor = await resolveWorkshopAccess(
    async () => ({ data: { session: null }, error: null }),
    async () => {
      checks++;
      return { data: { allowed: true }, error: null };
    },
  );
  assert.equal(visitor.state, "signed-out");
  assert.equal(checks, 0);
  let release!: (value: typeof signedIn) => void;
  const pending = resolveWorkshopAccess(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
    async () => {
      checks++;
      return { data: { allowed: true }, error: null };
    },
  );
  await Promise.resolve();
  assert.equal(checks, 0);
  release(signedIn);
  assert.deepEqual(await pending, {
    state: "ready",
    owner: "account-a",
    message: "",
  });
  assert.equal(checks, 1);
});
test("failed and malformed access checks never masquerade as denial or signed out; retry can recover", async () => {
  for (const result of [
    { data: null, error: Error("offline") },
    { data: {}, error: null },
  ]) {
    const state = await resolveWorkshopAccess(
      async () => signedIn,
      async () => result,
    );
    assert.equal(state.state, "failed");
    assert.equal(state.owner, "account-a");
    assert.doesNotMatch(state.message, /sign in/i);
  }
  assert.equal(
    (
      await resolveWorkshopAccess(
        async () => signedIn,
        async () => ({ data: { allowed: false }, error: null }),
      )
    ).state,
    "denied",
  );
  assert.equal(
    (
      await resolveWorkshopAccess(
        async () => signedIn,
        async () => ({ data: { allowed: true }, error: null }),
      )
    ).state,
    "ready",
  );
  assert.equal(
    (
      await resolveWorkshopAccess(
        async () => {
          throw Error("offline");
        },
        async () => {
          throw Error("should not run");
        },
      )
    ).state,
    "failed",
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import { latestRequest } from "../src/lib/latest-request";

// The Prop Finder's load lifecycle: an old member load that resolves after a newer signed-out
// load must not land, and nothing lands after unmount.
test("latestRequest: a slower older response never overwrites a newer one", async () => {
  const gate = latestRequest();
  let shown: string | null = null;
  const deferred = () => {
    let resolve!: (v: string) => void;
    let reject!: (e: Error) => void;
    const promise = new Promise<string>(
      (res, rej) => ((resolve = res), (reject = rej)),
    );
    return { promise, resolve, reject };
  };
  const load = async (d: ReturnType<typeof deferred>) => {
    const current = gate.start();
    try {
      const v = await d.promise;
      if (current()) shown = v;
    } catch {
      if (current()) shown = "error";
    }
  };
  const member = deferred();
  const memberLoad = load(member);
  // Sign-out: cancel, clear, start the replacement load.
  gate.cancel();
  shown = null;
  const visitor = deferred();
  const visitorLoad = load(visitor);
  visitor.resolve("visitor");
  await visitorLoad;
  member.resolve("member slate");
  await memberLoad;
  assert.equal(shown, "visitor");

  // A replacement load that fails still beats the stale one.
  const old = deferred();
  const oldLoad = load(old);
  const failing = deferred();
  const failingLoad = load(failing);
  failing.reject(new Error("network"));
  await failingLoad;
  old.resolve("stale");
  await oldLoad;
  assert.equal(shown, "error");

  // Unmount: nothing lands afterwards.
  const late = deferred();
  const lateLoad = load(late);
  gate.cancel();
  late.resolve("after unmount");
  await lateLoad;
  assert.equal(shown, "error");
});

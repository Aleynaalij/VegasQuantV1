import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { confirmParlaySave } from "../src/lib/parlay-save-confirmation";
import type { MemberParlay } from "../src/lib/parlay-builder";

const parlay: MemberParlay = {
  id: "saved-card",
  title: "Saved snapshot",
  legs: [],
  created_at: "2026-11-06T10:00:00Z",
  expires_at: "2026-11-07T10:00:00Z",
};
const ok = <T>(data: T) => Promise.resolve({ data, error: null });

test("confirmation retains the exact saved card and a successful list read", async () => {
  const result = await confirmParlaySave(
    parlay.id,
    () => ok(parlay),
    () => ok([parlay]),
  );
  assert.deepEqual(result, { confirmed: parlay, saved: [parlay] });
});

test("a stalled confirmation stops at the shared deadline, even if abort is ignored", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const signals: AbortSignal[] = [];
  let release!: (value: { data: MemberParlay; error: null }) => void;
  const pending = confirmParlaySave(
    parlay.id,
    (signal) => {
      signals.push(signal);
      return new Promise((resolve) => {
        release = resolve;
      });
    },
    (signal) => {
      signals.push(signal);
      return ok([parlay]);
    },
  );
  await setImmediate();
  assert.equal(signals[0], signals[1], "both reads share cancellation");
  t.mock.timers.tick(20000);
  const result = await pending;
  assert.deepEqual(result, { confirmed: null, saved: [parlay] });
  assert.equal(signals[0].aborted, true);
  release({ data: parlay, error: null });
  await setImmediate();
  assert.equal(
    result.confirmed,
    null,
    "late success cannot change a completed result",
  );
});

test("a stalled list cannot discard an independently confirmed save", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let listSignal!: AbortSignal;
  const pending = confirmParlaySave(
    parlay.id,
    () => ok(parlay),
    (signal) => {
      listSignal = signal;
      return new Promise(() => {});
    },
  );
  await setImmediate();
  t.mock.timers.tick(20000);
  assert.deepEqual(await pending, { confirmed: parlay, saved: null });
  assert.equal(listSignal.aborted, true);
});

test("two stalled reads share one deadline and do not wait sequentially", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = confirmParlaySave(
    parlay.id,
    () => new Promise(() => {}),
    () => new Promise(() => {}),
  );
  await setImmediate();
  t.mock.timers.tick(20000);
  assert.deepEqual(await pending, { confirmed: null, saved: null });
});

test("failed, missing and mismatched exact-ID reads never infer success from the list", async () => {
  for (const read of [
    () => Promise.resolve({ data: parlay, error: Error("failed read") }),
    () => ok(null),
    () => ok({ ...parlay, id: "another-card" }),
    () => Promise.reject(Error("disconnected")),
    () => {
      throw Error("client unavailable");
    },
  ]) {
    assert.deepEqual(
      await confirmParlaySave(parlay.id, read, () => ok([parlay])),
      { confirmed: null, saved: [parlay] },
    );
  }
});

test("list failure does not convert an exact-ID confirmation into an unknown save", async () => {
  const result = await confirmParlaySave(
    parlay.id,
    () => ok(parlay),
    () => Promise.reject(Error("list unavailable")),
  );
  assert.deepEqual(result, { confirmed: parlay, saved: null });
});

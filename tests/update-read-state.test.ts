import test from "node:test";
import assert from "node:assert/strict";
import { UpdateReadState } from "../src/lib/update-read-state";

test("opening an inbox clears only loaded updates, idempotently", () => {
  const state = new UpdateReadState();
  state.reset("member-a");
  state.merge(["older"]);
  const batch = state.begin(["older", "new", "new"])!;
  assert.deepEqual(batch.ids, ["new"]);
  assert.equal(state.begin(["new"]), null);
  assert.deepEqual(state.ids().sort(), ["new", "older"]);
  state.finish(batch, true);
  assert.deepEqual(state.merge(["older"]).sort(), ["new", "older"]);
  assert.deepEqual(state.begin(["next-publication"])?.ids, [
    "next-publication",
  ]);
});

test("failed writes restore unread and can be retried", () => {
  const state = new UpdateReadState();
  state.reset("member-a");
  const batch = state.begin(["new"])!;
  state.finish(batch, false);
  assert.deepEqual(state.ids(), []);
  const retry = state.begin(["new"])!;
  state.finish(retry, true);
  assert.deepEqual(state.ids(), ["new"]);
});

test("late writes cannot leak read state across sign-out/account changes", () => {
  const state = new UpdateReadState();
  state.reset("member-a");
  const batch = state.begin(["new"])!;
  state.reset(null);
  assert.equal(state.begin(["new"]), null);
  state.reset("member-b");
  assert.equal(state.finish(batch, true), false);
  assert.deepEqual(state.ids(), []);
  state.reset("member-a");
  assert.equal(state.finish(batch, true), false);
});

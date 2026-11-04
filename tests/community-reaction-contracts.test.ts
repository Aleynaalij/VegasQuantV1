import test from "node:test";
import assert from "node:assert/strict";
import { nextReaction, reactionState } from "../src/lib/community-reaction-contracts";
const state = { version: 1, post_id: "post", total: 2, counts: { heart: 1, fire: 1, thinking: 0, celebrate: 0 }, mine: "heart" };
test("reaction choose/change/remove is an explicit desired-state contract", () => {
  assert.equal(nextReaction(null, "heart"), "heart");
  assert.equal(nextReaction("heart", "fire"), "fire");
  assert.equal(nextReaction("fire", "fire"), null);
});
test("only canonical post-matched truthful counts are accepted", () => {
  assert.deepEqual(reactionState(state, "post"), state);
  for (const v of [null, {}, { ...state, post_id: "another" }, { ...state, total: 3 }, { ...state, mine: "fake" }, { ...state, counts: { ...state.counts, heart: -1 } }, { ...state, mine: "thinking" }])
    assert.equal(reactionState(v, "post"), null);
});

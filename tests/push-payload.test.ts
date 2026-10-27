import test from "node:test";
import assert from "node:assert/strict";
import { priceAlertRelease, priceMoveMessage, pushPayload } from "../src/lib/push";

const id = "1dd98df7-49cd-4a7b-813b-2ffad0a2d472";
test("price alerts carry only a well-formed release id", () => {
  assert.equal(priceAlertRelease(`price:${id}`), id);
  assert.equal(priceAlertRelease(`price:${id.toUpperCase()}`), id);
  assert.equal(priceAlertRelease("price:../admin"), null);
  assert.equal(priceAlertRelease("research:123"), null);
  assert.deepEqual(pushPayload({ pick_id: null, type: "price", event_key: `price:${id}` }), { pick_id: null, type: "price", release: id });
});
test("other payloads keep their existing shape", () => {
  assert.deepEqual(pushPayload({ pick_id: "p", type: "official" }), { pick_id: "p", type: "official" });
  assert.equal(pushPayload({ pick_id: null, type: "research", event_key: "app-update:1" }).announcement?.startsWith("Vegas Quant has been updated"), true);
});
test("price move alerts explain the move from validated numbers only", () => {
  const against = `price:${id}:move:2:against:-240:-220`;
  assert.equal(priceAlertRelease(against), id);
  assert.equal(priceMoveMessage(against), "A leg you're on moved -240 → -220, 20 cents against the pick. Recheck it before kickoff.");
  assert.equal(priceMoveMessage(`price:${id}:move:2:toward:-110:-130`), "A leg you're on moved -110 → -130: the market moved 20 cents toward the pick.");
  assert.equal(priceMoveMessage(`price:${id}:move:2:against:-105:115`), "A leg you're on moved -105 → +115, 20 cents against the pick. Recheck it before kickoff.");
  assert.deepEqual(pushPayload({ pick_id: null, type: "price", event_key: against }), {
    pick_id: null, type: "price", release: id, announcement: priceMoveMessage(against),
  });
  for (const bad of [`price:${id}`, `price:${id}:move:2:sideways:-240:-220`, `price:${id}:move:2:against:-240:<b>`,
    `price:../x:move:2:against:-240:-220`, `price:${id}:move:2:against:-240:-220:extra`, `price:${id}:move:x:against:-240:-220`, `price:${id}:move:against:-240:-220`, `research:${id}:move:2:against:-240:-220`])
    assert.equal(priceMoveMessage(bad), null, bad);
  assert.equal("announcement" in pushPayload({ pick_id: null, type: "price", event_key: `price:${id}` }), false);
});

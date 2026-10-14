import test from "node:test";
import assert from "node:assert/strict";
import { priceAlertRelease, pushPayload } from "../src/lib/push";

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

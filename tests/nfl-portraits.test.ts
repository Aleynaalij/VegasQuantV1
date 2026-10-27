import test from "node:test";
import assert from "node:assert/strict";
import registry from "../src/lib/nfl-portraits.json";
test("sourced identity registry has provenance and numeric ESPN IDs", () => {
  assert.match(registry.source, /^https:\/\/github.com\/nflverse\//);
  assert.match(registry.sha256, /^[a-f0-9]{64}$/);
  assert.ok(Date.parse(registry.retrieved_at));
  assert.ok(Object.keys(registry.portraits).length > 100);
  for (const id of Object.values(registry.portraits)) assert.match(id, /^\d+$/);
  assert.equal(registry.portraits["bryce young"], "4685720");
});

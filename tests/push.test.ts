import test from "node:test";
import assert from "node:assert/strict";
import { validPushEndpoint } from "../src/lib/push";
test("push destinations reject local services, credentials, lookalikes and non-HTTPS", () => {
  for (const url of [
    "http://fcm.googleapis.com/a",
    "https://127.0.0.1/a",
    "https://fcm.googleapis.com.evil.test/a",
    "https://user:pass@web.push.apple.com/a",
    "https://web.push.apple.com:8443/a",
  ])
    assert.equal(validPushEndpoint(url), false);
  for (const url of [
    "https://fcm.googleapis.com/a",
    "https://updates.push.services.mozilla.com/a",
    "https://web.push.apple.com/a",
  ])
    assert.equal(validPushEndpoint(url), true);
});

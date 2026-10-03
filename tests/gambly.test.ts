import { test } from "node:test";
import assert from "node:assert/strict";
import { isGamblyUrl } from "../src/lib/gambly";
test("Gambly links accept only the official HTTPS host", () => {
  assert.equal(isGamblyUrl("https://gambly.com/share/example"), true);
  assert.equal(isGamblyUrl("https://www.gambly.com/share/example"), true);
  for (const value of [null, "javascript:alert(1)", "http://gambly.com/a", "https://gambly.com.evil.com/a", "https://user@gambly.com/a", "https://gambly.com:444/a", "https://evil.com/?gambly.com", "https://gambly.com/a b"]) assert.equal(isGamblyUrl(value), false);
});

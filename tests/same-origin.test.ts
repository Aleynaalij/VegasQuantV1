import test from "node:test";
import assert from "node:assert/strict";
import { sameOrigin } from "../src/lib/billing-server";

// appOrigin() reads APP_URL at call time.
process.env.APP_URL = "https://vegasquant.app";

// Like a request arriving through the platform: the URL can be an internal address, while the
// Host headers carry what the browser asked for.
const post = (url: string, origin?: string) => {
  const target = new URL(url);
  return new Request(`http://127.0.0.1:3000${target.pathname}`, {
    method: "POST",
    headers: {
      ...(origin ? { origin } : {}),
      "x-forwarded-host": target.host,
      "x-forwarded-proto": target.protocol.replace(":", ""),
    },
  });
};

test("the configured app origin is accepted", () => {
  assert.equal(
    sameOrigin(post("https://vegasquant.app/api/x", "https://vegasquant.app")),
    true,
  );
});

test("another domain serving this deployment is accepted for its own requests", () => {
  assert.equal(
    sameOrigin(
      post(
        "https://www.vegasquant.app/api/community/photo",
        "https://www.vegasquant.app",
      ),
    ),
    true,
  );
});

test("cross-site and origin-less requests are refused", () => {
  assert.equal(
    sameOrigin(post("https://vegasquant.app/api/x", "https://evil.example")),
    false,
  );
  assert.equal(
    sameOrigin(
      post("https://www.vegasquant.app/api/x", "https://vegasquant.app.evil"),
    ),
    false,
  );
  assert.equal(sameOrigin(post("https://vegasquant.app/api/x")), false);
  assert.equal(sameOrigin(post("https://vegasquant.app/api/x", "null")), false);
});

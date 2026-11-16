import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy, config } from "../src/proxy";
const keys = [
  "VERCEL_ENV",
  "STAGING_DISCOVERY_ENABLED",
  "STAGING_DISCOVERY_PROJECT",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
];
test("staging proxy denies only staging routes and preserves the root redirect", () => {
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const check = (path: string) =>
    proxy(new NextRequest(`https://example.test${path}`));
  try {
    Object.assign(process.env, {
      VERCEL_ENV: "preview",
      STAGING_DISCOVERY_ENABLED: "false",
      STAGING_DISCOVERY_PROJECT: "synthetic",
      NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-public-fixture",
    });
    for (const route of [
      "/staging/discovery",
      "/staging/discovery/",
      "/staging/discovery/access-denied?game=abc",
    ])
      assert.equal(check(route).status, 404);
    for (const route of [
      "/",
      "/research?game=abc",
      "/community",
      "/staging/discovery-other?game=abc",
    ])
      assert.equal(check(route).status, 200);
    const redirect = check("/?game=abc&sport=nfl");
    assert.equal(redirect.status, 308);
    assert.equal(
      redirect.headers.get("location"),
      "https://example.test/nfl?game=abc&sport=nfl#home-games",
    );
    process.env.STAGING_DISCOVERY_ENABLED = "true";
    for (const route of [
      "/staging/discovery?game=abc",
      "/staging/discovery/access-denied",
    ])
      assert.equal(check(route).headers.get("x-middleware-next"), "1");
    process.env.VERCEL_ENV = "production";
    assert.equal(check("/staging/discovery").status, 404);
    assert.deepEqual(config.matcher, ["/", "/staging/discovery/:path*"]);
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  ROUTE_EXPECTATIONS,
  STAGE_REF,
  assetUrls,
  isVercelProtection,
  scanShipped,
} from "../scripts/operations/atlas-staging-probes.mjs";

const h = (o: Record<string, string> = {}) => new Headers(o);

test("Vercel protection: SSO redirects and Vercel 401 pages count, app responses never do", () => {
  assert.ok(
    isVercelProtection(
      307,
      h({ location: "https://vercel.com/sso-api?url=x" }),
    ),
  );
  assert.ok(
    isVercelProtection(302, h({ location: "https://vercel.com/login?next=x" })),
  );
  assert.ok(
    isVercelProtection(
      401,
      h(),
      "<title>Authentication Required</title> Vercel",
    ),
  );
  assert.equal(isVercelProtection(200, h(), "<html>Vegas Quant</html>"), false);
  assert.equal(isVercelProtection(503, h(), "Billing unavailable"), false);
  assert.equal(
    isVercelProtection(401, h(), '{"error":"Unauthorized"}'),
    false,
    "app 401 is not protection",
  );
  assert.equal(
    isVercelProtection(307, h({ location: "/login" })),
    false,
    "app redirect is not protection",
  );
});

test("shipped-bundle scan: staging ref is clean; production refs, URLs and secrets are flagged", () => {
  const clean = scanShipped(
    `fetch("https://${STAGE_REF}.supabase.co/rest/v1/x")`,
  );
  assert.deepEqual(clean, { problems: [], projects: [STAGE_REF] });

  const bad = scanShipped(
    [
      "https://uowearboulykfcwnuirn.supabase.co",
      "https://vegasquant.app/api/notifications/dispatch",
      "sk_live_abcdefghij",
      "pk_live_abcdefghij",
      "sb_secret_abcdefghij",
      "postgresql://u:p@h/db",
      '{"role":"service_role"}',
      "https://abcdefghijklmnopqrst.supabase.co",
    ].join(" "),
  );
  for (const what of [
    "production Supabase ref",
    "production API URL",
    "Stripe live secret",
    "Stripe live publishable key",
    "Supabase secret key",
    "database URL",
    "service-role claim",
    "other Supabase project abcdefghijklmnopqrst",
  ])
    assert.ok(bad.problems.includes(what), what);
});

test("asset discovery keeps same-origin scripts only", () => {
  const html =
    '<script src="/_next/static/chunks/a.js"></script><script src="https://cdn.example.com/b.js"></script>' +
    '<link rel="preload" href="/_next/static/chunks/c.js?dpl=1&amp;v=2">';
  assert.deepEqual(assetUrls(html, "https://x.vercel.app/"), [
    "https://x.vercel.app/_next/static/chunks/a.js",
    "https://x.vercel.app/_next/static/chunks/c.js?dpl=1&v=2",
  ]);
});

test("route expectations cover every production side-effect route the candidate keeps", () => {
  const paths = ROUTE_EXPECTATIONS.map((r) => r.path.split("?")[0]);
  for (const p of [
    "/api/stripe/webhook",
    "/api/age/webhook",
    "/api/notifications/dispatch",
    "/api/notifications/social-dispatch",
    "/api/live/alerts",
    "/api/live",
    "/api/live/box",
  ])
    assert.ok(paths.includes(p), p);
  for (const r of ROUTE_EXPECTATIONS)
    assert.ok(
      !r.expect.some((s) => s >= 200 && s < 300) || r.body,
      `${r.path}: a 2xx needs a body check`,
    );
});

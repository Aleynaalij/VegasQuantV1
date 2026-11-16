// Connected consumer components, intercepted synthetic provider transport only.
// Requires CONSUMER_UI_ENABLED=true, STAGING_DISCOVERY_FIXTURES=false and synthetic Supabase build.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = new URL(process.env.CONSUMER_TEST_URL || "http://127.0.0.1:3201");
assert(
  ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname),
  "Loopback only",
);
const out = process.env.CONSUMER_AUDIT_OUTPUT || "/tmp/consumer-auth-lifecycle";
await fs.mkdir(out, { recursive: true });
const report = {
  scope:
    "Synthetic account-switch and interrupted-response rendering only. Not hosted RLS, MFA, session-token validity, social mutation or download authorization proof.",
  cases: [],
  failures: [],
};
const id = (n) => `00000000-0000-4000-8000-00000000000${n}`;
const session = (n) => ({
  access_token: `synthetic-token-${n}`,
  refresh_token: `synthetic-refresh-${n}`,
  token_type: "bearer",
  expires_in: 86400,
  expires_at: Math.floor(Date.now() / 1000) + 86400,
  user: {
    id: id(n),
    aud: "authenticated",
    role: "authenticated",
    email: `fixture${n}@example.invalid`,
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  },
});
let browser, releaseHeld;
try {
  browser = await chromium.launch(
    process.env.PLAYWRIGHT_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
      : {},
  );
  for (const target of ["home", "room"]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
    });
    await context.addInitScript(
      (s) => localStorage.setItem("sb-synthetic-auth-token", JSON.stringify(s)),
      session(1),
    );
    let account = 1,
      allowed = true,
      holdNext = false,
      held = false,
      researchCalls = 0,
      dealerCalls = 0;
    const at = new Date(Date.now() + 3600000).toISOString();
    const marker = (n) => `SYNTHETIC ACCOUNT ${n} PRIVATE MARKER`;
    await context.route("**/*", async (route) => {
      const req = route.request(),
        u = new URL(req.url()),
        path = u.pathname;
      const json = (body) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "*",
            "access-control-allow-methods": "GET,POST,OPTIONS",
          },
          body: JSON.stringify(body),
        });
      if (
        u.origin === base.origin &&
        !path.startsWith("/api/") &&
        ["GET", "HEAD"].includes(req.method())
      )
        return route.continue();
      if (u.origin !== "https://synthetic.supabase.co") return route.abort();
      if (req.method() === "OPTIONS") return json({});
      if (path === "/auth/v1/user") return json(session(account).user);
      if (path.endsWith("/age_verification_status"))
        return json({ required: true, verified: true });
      if (path.endsWith("/membership_status")) return json({ allowed });
      if (path.endsWith("/tester_feature_access")) return json(false);
      if (path.endsWith("/sports_slate"))
        return json({
          version: 1,
          sport: req.postDataJSON().p_sport,
          access: false,
          games: [],
        });
      if (path.endsWith("/nba_games"))
        return json([
          {
            id: "synthetic-nba",
            slug: "synthetic-nba",
            away_team: "Sample Visitors",
            home_team: "Sample Hosts",
            tipoff: at,
            status: "SCHEDULED",
          },
        ]);
      const dealer = path.endsWith("/community_dealer_feed");
      const injury =
        path.endsWith("/nba_observations") &&
        u.searchParams.get("kind") === "eq.injury";
      if (dealer || injury) {
        if (dealer) dealerCalls++;
        else researchCalls++;
        const captured = account,
          permitted = allowed;
        if (
          holdNext &&
          ((target === "home" && dealer) || (target === "room" && injury))
        ) {
          holdNext = false;
          held = true;
          await new Promise((resolve) => {
            releaseHeld = resolve;
          });
        }
        if (!permitted) return json([]);
        return json(
          dealer
            ? [
                {
                  id: id(captured + 2),
                  sport: "nba",
                  title: marker(captured),
                  body: "Explicit synthetic publication",
                  created_at: at,
                },
              ]
            : [
                {
                  id: "synthetic-injury",
                  game_id: "synthetic-nba",
                  kind: "injury",
                  provider: "Synthetic",
                  source: null,
                  observed_at: at,
                  recorded_at: at,
                  payload: {
                    team: "Sample Hosts",
                    player: marker(captured),
                    status: "Questionable",
                  },
                },
              ],
        );
      }
      if (path.startsWith("/rest/v1/")) return json([]);
      return route.abort();
    });
    const page = await context.newPage();
    const root = target === "home" ? ".home2" : ".gr";
    const visibleMarker = (n) =>
      page.locator(root).getByText(marker(n), { exact: false }).first();
    const focus = () =>
      page.evaluate(() => window.dispatchEvent(new Event("focus")));
    const authEvent = async (event, s) =>
      page.evaluate(
        ({ event, s }) => {
          if (s)
            localStorage.setItem("sb-synthetic-auth-token", JSON.stringify(s));
          else localStorage.removeItem("sb-synthetic-auth-token");
          const c = new BroadcastChannel("sb-synthetic-auth-token");
          c.postMessage({ event, session: s });
          setTimeout(() => c.close(), 100);
        },
        { event, s },
      );
    await page.goto(
      base.origin +
        (target === "home"
          ? "/"
          : "/staging/discovery/rooms/nba/synthetic-nba"),
    );
    if (target === "room") {
      await page
        .getByText("Existing authorized staging reader. Not production.", {
          exact: false,
        })
        .waitFor();
    }
    await visibleMarker(1).waitFor({ state: "visible", timeout: 15000 });
    holdNext = true;
    await focus();
    for (let i = 0; i < 150 && !held; i++) await page.waitForTimeout(100);
    assert(
      held,
      `${target}: an account-1 protected response must be in flight`,
    );
    account = 2;
    await authEvent("SIGNED_IN", session(2));
    await visibleMarker(2).waitFor({ state: "visible", timeout: 15000 });
    assert.equal(
      await page.locator(root).getByText(marker(1), { exact: false }).count(),
      0,
    );
    releaseHeld();
    releaseHeld = null;
    await page.waitForTimeout(300);
    assert.equal(
      await page.locator(root).getByText(marker(1), { exact: false }).count(),
      0,
      "Late account-1 response must not restore previous account content",
    );
    await visibleMarker(2).waitFor({ state: "visible" });
    report.cases.push(
      `${target}: account switch clears old content and rejects delayed old response`,
    );
    allowed = false;
    await authEvent("SIGNED_OUT", null);
    if (target === "room")
      await page.waitForURL(
        "**/staging/discovery/access-denied?reason=denied",
        { timeout: 15000 },
      );
    else
      await page
        .getByText("Sign in to view available Dealer publications.", {
          exact: true,
        })
        .waitFor();
    assert.equal(await page.getByText(marker(2), { exact: false }).count(), 0);
    assert(researchCalls > 0, "Connected research reader must have executed");
    if (target === "home")
      assert(dealerCalls >= 3, "Dealer account reread must execute");
    report.cases.push(`${target}: sign-out removes protected content`);
    await context.close();
  }
} catch (error) {
  report.failures.push(error.stack || String(error));
} finally {
  releaseHeld?.();
  await browser?.close();
  await fs.writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
if (report.failures.length) process.exitCode = 1;

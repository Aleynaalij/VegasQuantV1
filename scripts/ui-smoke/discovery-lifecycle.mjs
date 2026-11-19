// Connected reader + real Supabase auth events, with ALL provider transport synthetic/intercepted.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = new URL(process.env.DISCOVERY_TEST_URL || "http://127.0.0.1:3197");
assert(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname));
const output = process.env.DISCOVERY_A11Y_OUTPUT || "/tmp/discovery-lifecycle";
await fs.mkdir(output, { recursive: true });
const result = { cases: [], failures: [], requests: [] };
let browser, releaseHeld;
try {
  browser = await chromium.launch(
    process.env.PLAYWRIGHT_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
      : {},
  );
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  const session = {
    access_token: "synthetic-test-token",
    refresh_token: "synthetic-refresh",
    token_type: "bearer",
    expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400,
    user: {
      id: "00000000-0000-0000-0000-000000000001",
      aud: "authenticated",
      role: "authenticated",
      email: "fixture@example.invalid",
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };
  await ctx.addInitScript((s) => {
    if (!sessionStorage.getItem("test-anonymous"))
      localStorage.setItem("sb-synthetic-auth-token", JSON.stringify(s));
  }, session);
  let allowed = true,
    accessError = false,
    invalidAccess = false,
    membershipCalls = 0,
    holdNext = false,
    held = false;
  const at = new Date(Date.now() + 3600000).toISOString();
  const observation = {
    id: "synthetic-injury",
    game_id: "synthetic-nba",
    kind: "injury",
    provider: "Synthetic",
    source: null,
    observed_at: at,
    recorded_at: at,
    payload: {
      team: "Sample Hosts",
      player: "SYNTHETIC PRIVATE RESEARCH MARKER",
      status: "Questionable",
    },
  };
  await ctx.route("**/*", async (route) => {
    const u = new URL(route.request().url()),
      path = u.pathname;
    result.requests.push(u.origin + path);
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
      ["GET", "HEAD"].includes(route.request().method())
    )
      return route.continue();
    if (u.origin !== "https://synthetic.supabase.co") return route.abort();
    if (route.request().method() === "OPTIONS") return json({});
    if (path.endsWith("/age_verification_status"))
      return json({ required: true, verified: true });
    if (path.endsWith("/membership_status")) {
      membershipCalls++;
      if (accessError)
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ message: "Synthetic access unavailable" }),
        });
      return json({ allowed: invalidAccess ? "true" : allowed });
    }
    if (path.endsWith("/tester_feature_access")) return json(false);
    if (path.endsWith("/sports_slate")) {
      const args = route.request().postDataJSON();
      return json({
        version: 1,
        sport: args.p_sport,
        access: false,
        games: [],
      });
    }
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
    if (path.endsWith("/nba_observations")) {
      const isInjury = u.searchParams.get("kind") === "eq.injury";
      if (isInjury && holdNext) {
        holdNext = false;
        held = true;
        await new Promise((resolve) => (releaseHeld = resolve));
        return json([observation]);
      }
      return json(isInjury && allowed ? [observation] : []);
    }
    if (path.endsWith("/game_zone_posts")) {
      result.failures.push("Link-only branch requested game_zone_posts");
      return route.abort();
    }
    if (path.startsWith("/rest/v1/")) return json([]);
    return route.abort();
  });
  const page = await ctx.newPage();
  await page.clock.install();
  const marker = page
    .locator(".d1-research-card")
    .filter({ hasText: "SYNTHETIC PRIVATE RESEARCH MARKER" });
  const waitAllowed = async () => {
    await marker.first().waitFor({ state: "visible" });
  };
  const waitDenied = async (reason = "denied") => {
    await page.waitForURL(
      `**/staging/discovery/access-denied?reason=${reason}`,
    );
    await page
      .getByRole("heading", {
        name:
          reason === "denied"
            ? "Research access is no longer available"
            : "Research access could not be verified",
        exact: true,
      })
      .waitFor();
    assert.equal(await marker.count(), 0);
  };
  const reopen = async () => {
    allowed = true;
    accessError = false;
    invalidAccess = false;
    await page.goto(
      base.origin + "/staging/discovery?event=nba%3Asynthetic-nba",
    );
    await waitAllowed();
  };
  const focus = () =>
    page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const hide = () =>
    page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
  const show = () =>
    page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
  await page.goto(base.origin + "/staging/discovery?event=nba%3Asynthetic-nba");
  await page
    .getByText(
      "Connected to the configured staging project. Not production. Existing access rules apply.",
      { exact: true },
    )
    .waitFor();
  await waitAllowed();
  result.cases.push("Connected synthetic reader displays permitted research");
  assert.equal(
    result.requests.filter((x) => x.endsWith("/game_zone_posts")).length,
    0,
  );
  await page
    .getByRole("heading", {
      name: "Original research & conversations",
      exact: true,
    })
    .waitFor();
  result.cases.push(
    "Link-only mode makes no game_zone_posts request and retains canonical navigation",
  );
  allowed = false;
  await focus();
  await waitDenied();
  result.cases.push("Focus rechecks access and removes revoked research");
  const notificationRequests = () =>
    result.requests.filter((url) =>
      /\/(notification_counts|notification_pulse|notification_sync_updates)$/.test(
        url,
      ),
    ).length;
  const stoppedCount = notificationRequests();
  assert(
    stoppedCount > 0,
    "Normal shell must have made notification requests before denial",
  );
  await focus();
  await page.clock.fastForward(90_000);
  assert.equal(
    notificationRequests(),
    stoppedCount,
    "Denied shell must not poll or heartbeat after unmount",
  );
  result.cases.push(
    "Denied staging shell stops notification polling and heartbeat",
  );
  allowed = true;
  await page
    .getByRole("link", {
      name: "Retry discovery with a fresh access check",
      exact: true,
    })
    .click();
  await page.waitForFunction(() =>
    document
      .querySelector(".d1-status")
      ?.textContent.includes("Showing research"),
  );
  await page.waitForTimeout(100);
  assert(
    notificationRequests() > stoppedCount,
    "Retry must remount normal shell with fresh requests",
  );
  result.cases.push(
    "Retry remounts normal shell with fresh authorization and notifications",
  );

  await reopen();
  await hide();
  await marker.first().waitFor({ state: "hidden" });
  const beforeHidden = membershipCalls;
  await page.waitForTimeout(100);
  assert.equal(membershipCalls, beforeHidden);
  allowed = false;
  await show();
  await waitDenied();
  result.cases.push(
    "Hidden tab clears research; visible return rereads denial",
  );
  await reopen();
  // Use the actual Supabase client cross-tab event channel, not a component test hook.
  allowed = false;
  const beforeAuth = membershipCalls;
  await page.evaluate((s) => {
    const c = new BroadcastChannel("sb-synthetic-auth-token");
    c.postMessage({ event: "TOKEN_REFRESHED", session: s });
    setTimeout(() => c.close(), 100);
  }, session);
  await waitDenied();
  assert(membershipCalls > beforeAuth, "Same-user auth event must revalidate");
  result.cases.push(
    "Same-user TOKEN_REFRESHED revalidates and clears denied research",
  );
  await reopen();
  holdNext = true;
  await focus();
  for (let i = 0; i < 100 && !held; i++) await page.waitForTimeout(20);
  assert(held, "Delayed protected reader response must be in flight");
  allowed = false;
  await focus();
  await waitDenied();
  releaseHeld();
  releaseHeld = null;
  await page.waitForTimeout(200);
  assert.equal(await marker.count(), 0);
  await waitDenied();
  result.cases.push(
    "Late permitted response cannot restore content after newer denial",
  );
  await reopen();
  accessError = true;
  await focus();
  await waitDenied("unverified");
  result.cases.push(
    "Prior-authorized access verification failure redirects fail-closed",
  );
  await reopen();
  invalidAccess = true;
  allowed = false;
  await focus();
  await waitDenied();
  result.cases.push(
    "Malformed allowed flag cannot grant or retain authorization",
  );
  accessError = false;
  invalidAccess = false;
  allowed = false;
  await page.evaluate(() => {
    sessionStorage.setItem("test-anonymous", "1");
    localStorage.removeItem("sb-synthetic-auth-token");
  });
  await page.goto(base.origin + "/staging/discovery?event=nba%3Asynthetic-nba");
  await page.waitForFunction(() =>
    document
      .querySelector(".d1-status")
      ?.textContent.includes("Sign in to view permitted research"),
  );
  assert.equal(new URL(page.url()).pathname, "/staging/discovery");
  assert.equal(await marker.count(), 0);
  result.cases.push(
    "Initial anonymous visitor remains on discovery with sign-in state, no protected research",
  );
  assert.equal(
    result.requests.filter((x) => x.endsWith("/game_zone_posts")).length,
    0,
  );
  await page.screenshot({
    path: output + "/revoked-mobile.png",
    fullPage: true,
  });
  await ctx.close();
} catch (error) {
  result.failures.push(error.stack || String(error));
} finally {
  releaseHeld?.();
  await browser?.close();
  await fs.writeFile(output + "/report.json", JSON.stringify(result, null, 2));
}
console.log(
  JSON.stringify({ cases: result.cases, failures: result.failures }, null, 2),
);
if (result.failures.length) process.exitCode = 1;

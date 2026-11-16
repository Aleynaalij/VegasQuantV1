import assert from "node:assert/strict";
import { chromium } from "playwright";
const base = process.env.CONSUMER_TEST_URL || "http://127.0.0.1:3201";
assert(
  ["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname),
  "Consumer synthetic acceptance is restricted to loopback, never a deployed service",
);
const enabled = process.env.EXPECT_CONSUMER_UI === "true";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
    : {}),
});
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  // This suite is routing/rollback evidence, never a live account test. No external calls.
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === new URL(base).origin &&
    !new URL(route.request().url()).pathname.startsWith("/api/") &&
    ["GET", "HEAD"].includes(route.request().method())
      ? route.continue()
      : route.abort(),
  );
  const page = await context.newPage();
  await page.goto(base, { waitUntil: "domcontentloaded" });
  if (enabled) await page.locator("#home2-title").waitFor();
  else await page.locator("#vq-lobby-title").waitFor();
  assert.equal(
    await page.locator(enabled ? "#vq-lobby-title" : "#home2-title").count(),
    0,
  );
  const post = "00000000-0000-4000-8000-000000000001";
  await page.goto(
    base +
      `/community?sport=nba&view=vip&post=${post}&comment=00000000-0000-4000-8000-000000000002#post-${post}`,
  );
  await page.getByRole("heading", { name: "The Zone", exact: true }).waitFor();
  assert.equal(
    await page.locator(".zone2-experience").count(),
    enabled ? 1 : 0,
  );
  assert.equal(new URL(page.url()).searchParams.get("post"), post);
  assert.equal(new URL(page.url()).hash, `#post-${post}`);
  await page.goto(base + "/?game=synthetic&x=1&x=2");
  assert.equal(new URL(page.url()).pathname, "/nfl");
  assert.deepEqual(new URL(page.url()).searchParams.getAll("x"), ["1", "2"]);
  await page.goto(base + "/#home-games");
  await page.waitForURL("**/nfl#home-games");
  await page.goto(base + "/community?saved=synthetic");
  // Next may stream this redirect after the initial 200 shell. Await navigation, not just load.
  await page.waitForURL("**/parlays?saved=synthetic#my-parlay-synthetic", {
    timeout: 15000,
  });
  assert.equal(new URL(page.url()).pathname, "/parlays");
  assert.equal(new URL(page.url()).hash, "#my-parlay-synthetic");
  console.log(
    `Consumer ${enabled ? "candidate activation" : "legacy rollback"} routing passed (synthetic, unauthenticated).`,
  );
} finally {
  await browser.close();
}

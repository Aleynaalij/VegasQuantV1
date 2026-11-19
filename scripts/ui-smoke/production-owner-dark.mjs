// Local synthetic/signed-out browser check. No real account or remote requests.
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const base = "http://127.0.0.1:3218";
  const context = await browser.newContext();
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === base) return route.continue();
    if (url.hostname === "127.0.0.1" && url.port === "54321")
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
    return route.abort();
  });
  await context.addCookies([{ name: "home2", value: "owners", url: base }]);
  const page = await context.newPage();
  let ownerRequests = 0;
  page.on("request", (req) => {
    if (new URL(req.url()).pathname === "/api/consumer/owner-preview")
      ownerRequests++;
  });
  await page.goto(base + "/?HOME2_PRODUCTION=owners");
  await page.locator("#vq-lobby-title").waitFor({ state: "visible" });
  assert.equal(await page.locator("#home2-title").count(), 0);
  console.log("PASS hydrated classic Home with forged query/cookie");
  await page.goto(base + "/community?owner=true");
  await page.locator(".community-feed.zone-feed").waitFor({ state: "visible" });
  assert.equal(await page.locator(".zone2-experience").count(), 0);
  assert.equal(ownerRequests, 0);
  console.log(
    "PASS hydrated classic Zone; zero owner-preview requests when off",
  );
  await page.goto(base + "/community?saved=fixture");
  await page.waitForURL(base + "/parlays?saved=fixture#my-parlay-fixture");
  console.log("PASS hydrated legacy saved-lay redirect");
  await context.close();
} finally {
  await browser.close();
}

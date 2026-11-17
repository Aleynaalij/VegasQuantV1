// Connected combined build + actual Next reader routes; backend transport is synthetic only.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = "http://127.0.0.1:3217";
const out = process.env.ATLAS_BROWSER_OUTPUT || "/tmp/atlas-connected-home";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
    : {}),
});
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  // Synthetic gate cookie; this is not real-token/MFA acceptance.
  await context.addCookies([
    {
      name: "__Host-vq-private-access",
      value: "fixture.owner.token",
      domain: "127.0.0.1",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);
  const external = [];
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === base || ["data:", "blob:"].includes(url.protocol))
      return route.continue();
    external.push(url.origin + url.pathname);
    return route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  const response = await page.goto(base);
  assert.equal(response.status(), 200);
  const game = page.locator(".h2-games .h2-game");
  await game.first().waitFor();
  assert.equal(await game.count(), 1);
  assert.match(await game.first().innerText(), /Atlas Away[\s\S]*Atlas Home/);
  assert.match(
    await game.first().getAttribute("href"),
    /^\/staging\/discovery\/rooms\/nba\/11111111-1111-4111-8111-111111111111\?date=/,
  );
  await page.screenshot({ path: `${out}/home-phone.png`, fullPage: true });
  await game.first().click();
  await page.locator(".gr-hero h1").filter({ hasText: "Atlas Away" }).waitFor();
  assert.match(
    await page.locator(".gr-hero h1").innerText(),
    /Atlas Away[\s\S]*Atlas Home/,
  );
  assert.equal(
    external.filter((url) => url.includes("supabase.co")).length,
    0,
    "No second browser Supabase identity or schedule transport",
  );
  await page.screenshot({ path: `${out}/room-phone.png`, fullPage: true });
  await fs.writeFile(
    `${out}/report.json`,
    JSON.stringify(
      {
        scope:
          "Connected combined synthetic Home-to-Room; not hosted identity proof",
        externalBackendRequests: external.filter((url) =>
          url.includes("supabase.co"),
        ),
        passed: true,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      scope:
        "Connected combined synthetic Home-to-Room only; no hosted identity proof",
      cases: [
        "guarded schedule populates Home",
        "exact game ID opens connected Room",
        "external backend transport remains blocked",
      ],
      failures: [],
    }),
  );
  await context.close();
} finally {
  await browser.close();
}

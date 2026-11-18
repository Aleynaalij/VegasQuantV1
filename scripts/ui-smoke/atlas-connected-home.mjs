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
  for (const storage of ["fresh", "stale"]) {
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
    const storageKey = "sb-caynldluziwrzmvuslzg-auth-token";
    if (storage === "stale")
      await context.addInitScript(
        ({ key }) => {
          localStorage.setItem(
            key,
            JSON.stringify({
              access_token: "synthetic.old.session",
              refresh_token: "synthetic-old-refresh",
              token_type: "bearer",
              expires_in: 3600,
              expires_at: Math.floor(Date.now() / 1000) + 3600,
              user: {
                id: "22222222-2222-4222-8222-222222222222",
                aud: "authenticated",
                role: "authenticated",
                app_metadata: {},
                user_metadata: {},
                created_at: "2026-11-01T12:00:00Z",
              },
            }),
          );
        },
        { key: storageKey },
      );
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
    await page
      .locator(".vq-brand-opening")
      .waitFor({ state: "detached", timeout: 5000 });
    await page.screenshot({
      path: `${out}/${storage}-home-phone.png`,
      fullPage: true,
    });
    await game.first().click();
    await page
      .locator(".gr-hero h1")
      .filter({ hasText: "Atlas Away" })
      .waitFor();
    assert.match(
      await page.locator(".gr-hero h1").innerText(),
      /Atlas Away[\s\S]*Atlas Home/,
    );
    assert.equal(
      external.filter((url) => url.includes("supabase.co")).length,
      0,
      "No second browser Supabase identity or schedule transport",
    );
    await page
      .locator(".vq-brand-opening")
      .waitFor({ state: "detached", timeout: 5000 });
    if (storage === "stale")
      assert.match(
        await page.evaluate((key) => localStorage.getItem(key), storageKey),
        /synthetic.old.session/,
        "Staging must ignore rather than erase the separate browser session",
      );
    await page.screenshot({
      path: `${out}/${storage}-room-phone.png`,
      fullPage: true,
    });
    await fs.writeFile(
      `${out}/${storage}-report.json`,
      JSON.stringify(
        {
          scope:
            "Connected combined synthetic Home-to-Room; not hosted identity proof",
          storage,
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
        storage,
        cases: [
          "guarded schedule populates Home",
          "exact game ID opens connected Room",
          "external backend transport remains blocked",
        ],
        failures: [],
      }),
    );
    await context.close();
  }
} finally {
  await browser.close();
}

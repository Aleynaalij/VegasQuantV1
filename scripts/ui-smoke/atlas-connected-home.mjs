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
      // Local HTTP serves a synthetic HTTPS deployment fixture. Match that
      // configured Origin for the data bridge only; production guard is unchanged.
      if (
        url.origin === base &&
        url.pathname === "/staging/discovery/data" &&
        route.request().method() === "POST"
      )
        return route.continue({
          headers: {
            ...route.request().headers(),
            origin: "https://atlas-fixture.vercel.app",
          },
        });
      if (url.origin === base || ["data:", "blob:"].includes(url.protocol))
        return route.continue();
      external.push(url.origin + url.pathname);
      return route.abort("blockedbyclient");
    });
    const page = await context.newPage();
    const response = await page.goto(base);
    assert.equal(response.status(), 200);
    const allGames = page.locator(".h2-games .h2-game");
    const game = allGames.filter({ hasText: "Atlas Away" });
    await game.first().waitFor();
    await allGames.nth(3).waitFor();
    assert.equal(await allGames.count(), 4);
    assert.match(await game.first().innerText(), /Atlas Away[\s\S]*Atlas Home/);
    assert.match(
      await game.first().getAttribute("href"),
      /^\/staging\/discovery\/rooms\/nba\/11111111-1111-4111-8111-111111111111\?date=/,
    );
    await page
      .locator(".vq-brand-opening")
      .waitFor({ state: "detached", timeout: 5000 });
    await page
      .locator("[data-viewer-state=ready]")
      .filter({ hasText: "Account" })
      .waitFor();
    assert.equal(
      await page.getByRole("link", { name: "Login", exact: true }).count(),
      0,
    );
    assert.match(
      await page
        .getByRole("link", {
          name: "Notifications · unavailable in isolated staging",
        })
        .getAttribute("href"),
      /^\/notifications$/,
    );
    await page
      .locator(".lobby-community-stories")
      .getByRole("button", { name: "Stories unavailable · Retry", exact: true })
      .waitFor();
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
    for (const [sport, id] of [
      ["nhl", "22222222-2222-4222-8222-222222222222"],
      ["ncaab", "33333333-3333-4333-8333-333333333333"],
      ["nfl", "44444444-4444-4444-8444-444444444444"],
    ]) {
      await page.goto(
        base +
          `/staging/discovery/rooms/${sport}/${id}?date=` +
          new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/New_York",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date()),
      );
      await page
        .locator(".gr-hero h1")
        .filter({ hasText: `Atlas ${sport} Away` })
        .waitFor();
      // Standalone Rooms intentionally omit the global Account link. Verify the
      // same server identity directly rather than assuming a different shell.
      const identity = await page.evaluate(async () => {
        const r = await fetch("/staging/discovery/session", {
          credentials: "same-origin",
          cache: "no-store",
        });
        return { status: r.status, body: await r.json() };
      });
      assert.equal(identity.status, 200);
      assert.equal(
        identity.body.session.user.id,
        "11111111-1111-4111-8111-111111111111",
      );
      assert.equal(identity.body.session.transport, "httpOnly-stage");
      assert.equal("access_token" in identity.body.session, false);
      await page
        .locator(".vq-brand-opening")
        .waitFor({ state: "detached", timeout: 5000 });
      await page.screenshot({
        path: `${out}/${storage}-${sport}-room-phone.png`,
        fullPage: true,
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
    }
    await page.goto(base + "/membership");
    await page.getByRole("heading", { name: "Account", exact: true }).waitFor();
    await page.getByText("fixture@example.invalid", { exact: true }).waitFor();
    await page.goto(base + "/saved");
    const savedUnavailable = page
      .locator(".published-board p[role=status]")
      .filter({ hasText: "Saved legs could not load." });
    await savedUnavailable.waitFor();
    assert.match(
      await savedUnavailable.innerText(),
      /^Saved legs could not load\.\s*Retry$/,
    );
    assert.equal(
      await savedUnavailable
        .getByRole("button", { name: "Retry", exact: true })
        .count(),
      1,
    );
    assert.equal(
      await page
        .getByText(
          "Sign in to view published selections and your saved legs.",
          { exact: true },
        )
        .count(),
      0,
    );
    assert.doesNotMatch(
      await page.locator(".published-board").innerText(),
      /Sign in to view published selections/,
    );
    assert.equal(
      await page
        .locator(".published-board")
        .getByRole("link", {
          name: "Sign in or create a free account →",
          exact: true,
        })
        .count(),
      0,
    );
    await page.goto(base + "/parlays?build=1");
    await page
      .getByRole("alert")
      .filter({
        hasText: "Your leg library or saved lays could not load. Please retry.",
      })
      .waitFor();
    await page
      .getByRole("button", { name: "Retry library", exact: true })
      .waitFor();
    await page.goto(base + "/notifications");
    await page.getByText(/Unread count is unknown/).waitFor();
    await page
      .locator(".vq-brand-opening")
      .waitFor({ state: "detached", timeout: 5000 });
    await page.screenshot({
      path: `${out}/${storage}-notifications-phone.png`,
      fullPage: true,
    });
    assert.equal(
      external.filter((url) => url.includes("supabase.co")).length,
      0,
      "Every connected journey must avoid a second browser backend identity",
    );
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
          "verified shell Account without second SDK identity",
          "verified story identity with explicit unavailable isolated story contract",
          "four guarded schedules and all-sport Room navigation",
          "account identity and explicit unavailable notifications",
          "saved legs and My Lays distinguish missing contracts from signed-out",
          "guarded schedule populates Home",
          "exact game ID opens connected Room",
          "external backend transport remains blocked",
        ],
        failures: [],
      }),
    );
    await context.close();
  }
} catch (error) {
  // Preserve the actual failing UI for diagnosis without altering any assertion.
  for (const [i, context] of browser.contexts().entries()) {
    for (const [j, page] of context.pages().entries()) {
      await fs
        .writeFile(`${out}/failure-${i}-${j}.html`, await page.content())
        .catch(() => {});
      await fs
        .writeFile(
          `${out}/failure-${i}-${j}.json`,
          JSON.stringify(
            {
              url: page.url(),
              error: String(error),
              body: (await page.locator("body").innerText()).slice(0, 12000),
            },
            null,
            2,
          ),
        )
        .catch(() => {});
      await page
        .screenshot({
          path: `${out}/failure-${i}-${j}.png`,
          fullPage: true,
          timeout: 5000,
        })
        .catch(() => {});
    }
  }
  throw error;
} finally {
  await browser.close();
}

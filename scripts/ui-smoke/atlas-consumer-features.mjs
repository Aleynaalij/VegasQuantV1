// Original consumer UI + actual original SQL contracts. All identities and content are synthetic.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = "http://127.0.0.1:3217";
const out = process.env.ATLAS_FEATURE_OUTPUT || "/tmp/atlas-consumer-features";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
    : {}),
});
const results = [];
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 1000 },
  ]) {
    const context = await browser.newContext({ viewport });
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
    const errors = [];
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
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
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(30000);
    console.log(`Testing synthetic consumer journeys at ${viewport.width}px`);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    await page.locator("[data-viewer-state=ready]").first().waitFor();
    const story = page.getByRole("button", {
      name: /Open (OwnerOne|MobileOwner)'s recent community posts/,
      exact: true,
    });
    await story.first().waitFor();
    await story.first().click();
    await page
      .getByRole("dialog", { name: "Recent community posts" })
      .waitFor();
    await page.keyboard.press("Escape");
    await page
      .getByRole("dialog", { name: "Recent community posts" })
      .waitFor({ state: "detached" });
    await page.goto(`${base}/membership`);
    await page
      .getByRole("heading", { name: "Your community identity" })
      .waitFor();
    const username = page.getByLabel("Username", { exact: true });
    await username.fill(
      viewport.width === 390 ? "MobileOwner" : "DesktopOwner",
    );
    await page
      .locator("#community-settings")
      .getByRole("button", { name: /Save/ })
      .click();
    await page
      .getByText(
        "Profile saved. Your profile is visible to signed-in members.",
        { exact: true },
      )
      .waitFor();
    await page.goto(
      `${base}/community?post=00000000-0000-4000-8000-000000000020`,
    );
    await page
      .getByText("Original synthetic discussion", { exact: true })
      .first()
      .waitFor();
    await page
      .getByRole("button", { name: "Comments", exact: true })
      .first()
      .click();
    const comment = page.getByPlaceholder(/comment/i).first();
    await comment.fill(`Synthetic browser ${viewport.width}`);
    await comment.press("Tab");
    const commentForm = comment.locator("xpath=ancestor::form");
    await commentForm.getByRole("button", { name: /Post|Send|Reply/ }).click();
    await page
      .getByText(`Synthetic browser ${viewport.width}`, { exact: true })
      .waitFor();
    await page.goto(`${base}/saved`);
    await page.getByText("Sample Player", { exact: false }).first().waitFor();
    await page.goto(`${base}/parlays`);
    const savedLay = page
      .locator("details.workshop-leg > summary")
      .filter({ hasText: "Synthetic saved lay" });
    await savedLay.waitFor();
    await savedLay.click();
    await page
      .locator("details.workshop-leg[open] .vqc-title")
      .filter({ hasText: "Synthetic saved lay" })
      .waitFor();
    await page.goto(`${base}/notifications`);
    await page
      .getByRole("heading", { name: "Notifications", exact: true })
      .waitFor();
    await page
      .getByText(/OwnerTwo.*follow|follow.*OwnerTwo/i)
      .first()
      .waitFor();
    await page.screenshot({
      path: `${out}/${viewport.width}-inbox.png`,
      fullPage: true,
    });
    await page.keyboard.press("Tab");
    const keyboardFocus = await page.evaluate(() => {
      const el = document.activeElement;
      return !!el && el !== document.body && el.getClientRects().length > 0;
    });
    assert.equal(
      keyboardFocus,
      true,
      "keyboard focus reaches a visible interactive destination",
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    );
    assert.equal(overflow, false);
    assert.deepEqual(
      external,
      [],
      "no external browser transports, worker registration or production access",
    );
    assert.deepEqual(errors, []);
    results.push({
      viewport,
      home: true,
      story: true,
      profileEdit: true,
      comment: true,
      saved: true,
      myLays: true,
      inbox: true,
      keyboardStoryDismiss: true,
      keyboardFocusVisible: keyboardFocus,
      horizontalOverflow: false,
      externalRequests: external,
      pageErrors: errors,
      evidence:
        "LOCAL SYNTHETIC original SQL and real Next handlers; not hosted/MFA acceptance",
    });
    await context.close();
  }
  await fs.writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  await fs.writeFile(`${out}/failure.txt`, String(error));
  for (const [i, page] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries()) {
    await page
      .screenshot({ path: `${out}/failure-${i}.png`, fullPage: true })
      .catch(() => {});
    await fs.writeFile(
      `${out}/failure-${i}.txt`,
      await page
        .locator("body")
        .innerText()
        .catch(() => "Body unavailable"),
    );
  }
  throw error;
} finally {
  await browser.close();
}

// Real DOM / synthetic data acceptance for the arena lobby. No production writes.
// Run with the app + stub from scripts/ui-smoke/check.mjs. Screenshots are actual viewports.
// Negative control: UI_SMOKE_NEGATIVE=oversized-intro must fail the first-fold assertion.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH || process.env.PLAYWRIGHT_EXECUTABLE,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const base = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const out = process.env.UI_ARTIFACT_DIR || "artifacts/lobby-mobile";
const now = new Date("2026-10-14T02:00:00Z");
const nba = Array.from({ length: 5 }, (_, i) => ({
  id: `lobby-nba-${i}`,
  slug: `sample-lobby-game-${i}`,
  away_team: `Sample Away ${i}`,
  home_team: `Sample Home ${i}`,
  tipoff: `2026-10-14T0${i % 3}:30:00Z`,
  tipoff_tbd: false,
  status: i === 0 ? "STATUS_FINAL" : "STATUS_SCHEDULED",
}));
await mkdir(out, { recursive: true });
const metrics = [];
try {
  for (const [width, height] of [
    [360, 800],
    [390, 844],
    [1280, 900],
  ]) {
    const ctx = await browser.newContext({
      viewport: { width, height },
      reducedMotion: "reduce",
    });
    let state = "ready";
    let releaseLoading;
    let loadingGate;
    const privateRequests = [];
    await ctx.route("**/rest/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (
        /\/(community_feed|community_activity|community_stories|community_profiles|member_parlays|published_leg_catalog)$/.test(
          path,
        )
      )
        privateRequests.push(path);
      if (path.endsWith("nba_games")) {
        if (state === "loading") await loadingGate;
        if (state === "failed")
          return route.fulfill({
            status: 500,
            json: { message: "Synthetic schedule failure" },
          });
        return route.fulfill({ json: state === "empty" ? [] : nba });
      }
      if (path.endsWith("sports_home"))
        return route.fulfill({
          json: {
            version: 1,
            sport: route.request().postDataJSON()?.p_sport,
            games: [],
          },
        });
      if (path.endsWith("membership_status"))
        return route.fulfill({ json: { allowed: false, admin: false } });
      if (path.endsWith("community_story_clock"))
        return route.fulfill({ json: { server_now: now.toISOString() } });
      return route.fulfill({ json: [] });
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    await page.clock.setFixedTime(now);
    const open = async () => {
      await page.goto(base + "/");
      await page
        .getByRole("heading", {
          name: "Your sports research starts here.",
          exact: true,
        })
        .waitFor();
      await page.locator(".vq-brand-opening").waitFor({ state: "hidden" });
    };
    await open();
    await page
      .getByRole("button", { name: "Show all 5 games", exact: true })
      .waitFor();
    if (process.env.UI_SMOKE_NEGATIVE === "oversized-intro") {
      await page.addStyleTag({
        content: ".vq-lobby-skybox { min-height: 1000px !important; }",
      });
    }
    assert.equal(
      await page.locator('.sport-switch [aria-current="page"]').count(),
      0,
      "Home remains neutral",
    );
    assert.equal(
      await page.locator(".vq-tonight-game").count(),
      3,
      "initial preview contains three actual schedule rows",
    );
    const layout = await page.evaluate(() => {
      const rect = (sel) => {
        const r = document.querySelector(sel).getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, height: r.height };
      };
      const nav = document.querySelector(".mobile-nav");
      const navTop =
        nav && getComputedStyle(nav).display !== "none"
          ? nav.getBoundingClientRect().top
          : innerHeight;
      return {
        width: innerWidth,
        height: innerHeight,
        board: rect(".vq-tonight-board"),
        firstGame: rect(".vq-tonight-game"),
        navTop,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });
    assert.ok(
      layout.scrollWidth <= width + 1,
      "arena lobby must not overflow horizontally",
    );
    assert.ok(
      layout.firstGame.bottom <= layout.navTop,
      "first schedule row must be fully above the fixed mobile navigation",
    );
    metrics.push(layout);
    await page.screenshot({ path: `${out}/${width}-arena-ready.png` });
    const desks = page.getByRole("navigation", { name: "Sport desks" });
    await page.keyboard.press("Tab");
    for (const [key, name] of [
      ["nfl", "NFL"],
      ["nba", "NBA"],
      ["nhl", "NHL"],
      ["ncaab", "NCAAB college basketball"],
    ]) {
      const link = desks.getByRole("link", {
        name: `Open ${name} desk`,
        exact: true,
      });
      assert.equal(await link.getAttribute("href"), "/" + key);
      const box = await link.boundingBox();
      assert.ok(
        box.width >= 44 && box.height >= 44,
        `${key} room must have a usable touch target`,
      );
      await link.focus();
      assert.equal(
        await link.evaluate((el) => document.activeElement === el),
        true,
      );
      assert.notEqual(
        await link.evaluate((el) => getComputedStyle(el).outlineStyle),
        "none",
        "keyboard focus must be visible",
      );
    }
    await page.getByRole("link", { name: "All sports", exact: true }).click();
    assert.equal(
      new URL(page.url()).hash,
      "#vq-tonight",
      "all sports leads to the real board",
    );
    const more = page.getByRole("button", {
      name: "Show all 5 games",
      exact: true,
    });
    await more.click();
    assert.equal(await page.locator(".vq-tonight-game").count(), 5);
    assert.equal(
      await page
        .getByRole("button", { name: "Show fewer games" })
        .getAttribute("aria-expanded"),
      "true",
    );
    await page.getByRole("button", { name: "Show fewer games" }).click();
    assert.equal(
      await page.locator(".vq-tonight-game").count(),
      3,
      "repeated expansion returns to the compact preview",
    );
    assert.equal(
      await page
        .locator(".vq-tonight-next")
        .getByRole("link", { name: /^Research/ })
        .getAttribute("href"),
      "/feed?view=latest",
    );
    assert.equal(
      await page
        .locator(".vq-tonight-next")
        .getByRole("link", { name: /^My lays/ })
        .getAttribute("href"),
      "/parlays",
    );
    assert.equal(
      await page
        .locator(".vq-tonight-next")
        .getByRole("link", { name: /^The Zone · sign in/ })
        .getAttribute("href"),
      "/membership",
    );
    const game = page.locator(".vq-tonight-game").first();
    const href = await game.getAttribute("href");
    await game.click();
    await page.waitForURL(new URL(href, base).href);
    await page.goBack();
    await page
      .getByRole("heading", { name: "VQ Tonight", exact: true })
      .waitFor();
    assert.equal(
      new URL(page.url()).pathname,
      "/",
      "Back returns to the neutral lobby",
    );
    state = "empty";
    await open();
    await page
      .getByText("No games are scheduled today.", { exact: true })
      .waitFor();
    assert.equal(
      await page.locator(".vq-tonight-game").count(),
      0,
      "empty state must not invent fixtures",
    );
    await page.screenshot({ path: `${out}/${width}-arena-empty.png` });
    state = "failed";
    await open();
    await page
      .getByRole("alert")
      .filter({ hasText: "NBA games could not load." })
      .waitFor();
    await page.screenshot({ path: `${out}/${width}-arena-failed.png` });
    state = "ready";
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page
      .getByRole("button", { name: "Show all 5 games", exact: true })
      .waitFor();
    state = "loading";
    loadingGate = new Promise((resolve) => {
      releaseLoading = resolve;
    });
    await open();
    await page.getByText("Loading today’s games…", { exact: true }).waitFor();
    await page.screenshot({ path: `${out}/${width}-arena-loading.png` });
    state = "ready";
    releaseLoading();
    await page
      .getByRole("button", { name: "Show all 5 games", exact: true })
      .waitFor();
    assert.equal(
      privateRequests.length,
      0,
      "signed-out lobby must not request private member content",
    );
    console.log(
      `PASS arena lobby at ${width}px: fold, touch targets, focus, routes, preview, empty, failure/retry, loading and privacy`,
    );
    await ctx.close();
  }
  await writeFile(
    `${out}/layout-metrics.json`,
    JSON.stringify(metrics, null, 2),
  );
} finally {
  await browser.close();
}

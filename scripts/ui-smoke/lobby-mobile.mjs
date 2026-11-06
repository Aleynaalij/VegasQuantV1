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
const nba = Array.from({ length: 3 }, (_, i) => ({
  id: `lobby-nba-${i}`,
  slug: `sample-lobby-game-${i}`,
  away_team: `Sample Away ${i}`,
  home_team: `Sample Home ${i}`,
  tipoff: `2026-10-14T0${i % 3}:30:00Z`,
  tipoff_tbd: false,
  status: i === 0 ? "STATUS_FINAL" : "STATUS_SCHEDULED",
}));
const otherSports = {
  nhl: [
    {
      id: "lobby-nhl-0",
      slug: "sample-lobby-nhl-0",
      start_time: "2026-10-14T00:45:00Z",
      status: "STATUS_SCHEDULED",
      away: { short_name: "Sample NHL Away" },
      home: { short_name: "Sample NHL Home" },
    },
  ],
  ncaab: [
    {
      id: "lobby-college-0",
      slug: "sample-lobby-college-0",
      start_time: "2026-10-14T01:45:00Z",
      status: "STATUS_SCHEDULED",
      away: { short_name: "Sample College Away" },
      home: { short_name: "Sample College Home" },
    },
  ],
};
const chronologicalHrefs = [
  `/nba/games/${nba[0].slug}`,
  `/nhl/games/${otherSports.nhl[0].slug}`,
  `/nba/games/${nba[1].slug}`,
  `/ncaab/games/${otherSports.ncaab[0].slug}`,
  `/nba/games/${nba[2].slug}`,
];
await mkdir(out, { recursive: true });
const metrics = [];
let activePage;
let activeWidth;
let stage = "starting";
const navigationEvents = [];
const pageErrors = [];
const historySnapshots = [];
try {
  for (const [width, height] of [
    [360, 800],
    [390, 844],
    [1280, 900],
  ]) {
    activeWidth = width;
    stage = "creating context";
    const ctx = await browser.newContext({
      viewport: { width, height },
      reducedMotion: "reduce",
    });
    let state = "ready";
    let releaseLoading;
    let loadingGate;
    const privateRequests = [];
    await ctx.route("**/rest/v1/**", async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      if (
        /\/(community_feed|community_activity|community_stories|community_profiles|member_parlays|published_leg_catalog)$/.test(
          path,
        )
      )
        privateRequests.push(path);
      if (path.endsWith("nba_games")) {
        // The lobby reads a list; the game destination reads one exact slug with
        // maybeSingle(). Return that actual fixture rather than an invalid five-row result.
        const requestedSlug = url.searchParams.get("slug");
        if (requestedSlug?.startsWith("eq.")) {
          return route.fulfill({
            json:
              nba.find((game) => game.slug === requestedSlug.slice(3)) ?? null,
          });
        }
        if (state === "loading") await loadingGate;
        if (state === "failed")
          return route.fulfill({
            status: 500,
            json: { message: "Synthetic schedule failure" },
          });
        return route.fulfill({ json: state === "empty" ? [] : nba });
      }
      if (path.endsWith("sports_home")) {
        if (state === "loading") await loadingGate;
        const sport = route.request().postDataJSON()?.p_sport;
        return route.fulfill({
          json: {
            version: 1,
            sport,
            games: state === "empty" ? [] : (otherSports[sport] ?? []),
          },
        });
      }
      if (path.endsWith("membership_status"))
        return route.fulfill({ json: { allowed: false, admin: false } });
      if (path.endsWith("community_story_clock"))
        return route.fulfill({ json: { server_now: now.toISOString() } });
      return route.fulfill({ json: [] });
    });
    const page = await ctx.newPage();
    activePage = page;
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame())
        navigationEvents.push({ width, stage, url: frame.url() });
    });
    page.on("pageerror", (error) =>
      pageErrors.push({ width, stage, message: error.message }),
    );
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
    const recordHistory = async () => {
      const snapshot = await page.evaluate(() => ({
        url: window.location.href,
        length: window.history.length,
        state: window.history.state,
      }));
      historySnapshots.push({ width, stage, ...snapshot });
      return snapshot;
    };
    const expectLobby = async (url) => {
      await page.waitForURL(url);
      await page
        .getByRole("heading", {
          name: "Your sports research starts here.",
          exact: true,
        })
        .waitFor();
      await page
        .getByRole("heading", { name: "VQ Tonight", exact: true })
        .waitFor();
      assert.equal(
        await page.locator(".nba-matchup-page").count(),
        0,
        "history must restore lobby DOM, not only its URL",
      );
      assert.equal(
        await page.locator('.sport-switch [aria-current="page"]').count(),
        0,
        "restored lobby is neutral",
      );
      await recordHistory();
    };
    const verifyGameHistory = async (label) => {
      stage = `${label}: open exact game`;
      const returnUrl = page.url();
      await page
        .getByRole("button", { name: "Show all 5 games", exact: true })
        .waitFor();
      const game = page.locator(".vq-tonight-game").first();
      const href = await game.getAttribute("href");
      const selected = nba.find(
        (fixture) => href === `/nba/games/${fixture.slug}`,
      );
      assert.ok(selected, "game link must identify an actual fixture");
      const gameUrl = new URL(href, base).href;
      const expectGame = async () => {
        await page.waitForURL(gameUrl);
        await page
          .getByRole("heading", {
            name: `${selected.away_team} @ ${selected.home_team}`,
            exact: true,
          })
          .waitFor();
        await recordHistory();
      };
      await game.click();
      await expectGame();
      stage = `${label}: Back restores exact lobby content`;
      await page.goBack();
      await expectLobby(returnUrl);
      stage = `${label}: Forward restores exact game content`;
      await page.goForward();
      await expectGame();
      stage = `${label}: second Back restores exact lobby content`;
      await page.goBack();
      await expectLobby(returnUrl);
    };
    stage = "initial lobby title";
    await open();
    // Verify the styled title before any navigation as well as on Back. A name
    // regression must not masquerade as a browser-history failure.
    await page
      .getByRole("heading", { name: "VQ Tonight", exact: true })
      .waitFor();
    stage = "initial schedule and fold";
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
    assert.deepEqual(
      await page
        .locator(".vq-tonight-game")
        .evaluateAll((links) => links.map((link) => link.getAttribute("href"))),
      chronologicalHrefs.slice(0, 3),
      "mixed-sport preview must preserve chronological order",
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
    stage = "dimensional enclosure evidence";
    const casing = page.locator(".vq-jumbotron-casing");
    assert.equal(
      await casing.getAttribute("aria-hidden"),
      "true",
      "decorative enclosure stays out of the accessibility tree",
    );
    assert.equal(
      await casing.evaluate((node) => getComputedStyle(node).pointerEvents),
      "none",
      "frame must not intercept game controls",
    );
    assert.equal(
      await casing.locator('[data-skybox-lights="cluster"]').count(),
      5,
      "five separate downlight clusters under the hanging box",
    );
    for (const plane of ["left", "right"]) {
      const side = await casing
        .locator(`[data-skybox-plane="${plane}"]`)
        .boundingBox();
      assert.ok(
        side.width >= 25 && side.height >= 100,
        `${plane} side must have visible perspective depth`,
      );
    }
    assert.ok(
      (await casing.locator(".vq-jumbotron-top").boundingBox()).height >= 40,
      "top fascia is a separate dimensional cap",
    );
    assert.ok(
      (await casing.locator(".vq-jumbotron-underside").boundingBox()).height >=
        35,
      "underside must have visible depth",
    );
    await page.screenshot({
      path: `${out}/${width}-arena-full.png`,
      fullPage: true,
    });
    await page
      .locator(".vq-tonight-board")
      .evaluate((board) =>
        window.scrollTo(
          0,
          window.scrollY + board.getBoundingClientRect().top - 140,
        ),
      );
    await page.screenshot({ path: `${out}/${width}-jumbotron-focused.png` });
    await page
      .locator(".vq-tonight-board")
      .screenshot({ path: `${out}/${width}-jumbotron-enclosure.png` });
    await page.evaluate(() => window.scrollTo(0, 0));
    stage = "sport targets and focus";
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
    await verifyGameHistory("ordinary no-hash journey");
    const plainLobbyUrl = page.url();
    stage = "All sports creates restorable hash entry";
    await recordHistory();
    await page.getByRole("link", { name: "All sports", exact: true }).click();
    await page.waitForURL(new URL("#vq-tonight", plainLobbyUrl).href);
    const hashEntry = await recordHistory();
    assert.ok(
      hashEntry.state?.__NA,
      "All sports must retain the App Router's history state",
    );
    stage = "Repeated All sports keeps the same history entry";
    await page.getByRole("link", { name: "All sports", exact: true }).click();
    const repeatedHashEntry = await recordHistory();
    assert.equal(
      repeatedHashEntry.length,
      hashEntry.length,
      "repeated All sports clicks must not accumulate history entries",
    );
    stage = "all sports and schedule expansion";
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
    assert.deepEqual(
      await page
        .locator(".vq-tonight-game")
        .evaluateAll((links) => links.map((link) => link.getAttribute("href"))),
      chronologicalHrefs,
      "expanded mixed-sport board must keep chronological order",
    );
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
    await verifyGameHistory("All sports hash journey");
    const hashLobbyUrl = page.url();
    stage = "Back through the hash restores the original lobby entry";
    await page.goBack();
    await expectLobby(plainLobbyUrl);
    stage = "Forward restores the hash and lobby together";
    await page.goForward();
    await expectLobby(hashLobbyUrl);
    await page.screenshot({
      path: `${out}/${width}-arena-history-restored.png`,
    });
    stage = "empty schedule";
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
    stage = "failed schedule";
    state = "failed";
    await open();
    await page
      .getByRole("alert")
      .filter({ hasText: "NBA games could not load." })
      .waitFor();
    await page.screenshot({ path: `${out}/${width}-arena-failed.png` });
    stage = "retry schedule";
    state = "ready";
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page
      .getByRole("button", { name: "Show all 5 games", exact: true })
      .waitFor();
    stage = "loading schedule";
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
    `${out}/history-snapshots.json`,
    JSON.stringify(historySnapshots, null, 2),
  );
  await writeFile(
    `${out}/layout-metrics.json`,
    JSON.stringify(metrics, null, 2),
  );
} catch (error) {
  // Preserve evidence before closing Chromium, including the actual URL and
  // accessible names. A timeout alone cannot distinguish history, rendering and naming.
  const prefix = `${out}/${activeWidth ?? "unknown"}-failure`;
  const captureErrors = [];
  const save = async (name, run) => {
    try {
      await run();
    } catch (failure) {
      captureErrors.push(`${name}: ${String(failure)}`);
    }
  };
  if (activePage && !activePage.isClosed()) {
    await save("history state", async () => {
      historySnapshots.push({
        width: activeWidth,
        stage,
        failure: true,
        ...(await activePage.evaluate(() => ({
          url: window.location.href,
          length: window.history.length,
          state: window.history.state,
        }))),
      });
    });
    await save("viewport screenshot", () =>
      activePage.screenshot({ path: `${prefix}.png`, timeout: 5000 }),
    );
    await save("DOM", async () =>
      writeFile(`${prefix}.html`, await activePage.content()),
    );
    await save("ARIA snapshot", async () =>
      writeFile(
        `${prefix}-aria.txt`,
        await activePage.locator("body").ariaSnapshot({ timeout: 5000 }),
      ),
    );
    await save("heading diagnostics", async () =>
      writeFile(
        `${prefix}-headings.json`,
        JSON.stringify(
          await activePage.locator("h1, h2, h3").evaluateAll((headings) =>
            headings.map((heading) => ({
              id: heading.id,
              text: heading.textContent,
              renderedText: heading.innerText,
              ariaLabel: heading.getAttribute("aria-label"),
              ariaLabelledBy: heading.getAttribute("aria-labelledby"),
              display: getComputedStyle(heading).display,
              visibility: getComputedStyle(heading).visibility,
              rect: heading.getBoundingClientRect().toJSON(),
            })),
          ),
          null,
          2,
        ),
      ),
    );
  }
  const diagnostic = {
    width: activeWidth,
    stage,
    url: activePage?.url(),
    error: String(error),
    stack: error?.stack,
    navigationEvents,
    historySnapshots,
    pageErrors,
    captureErrors,
  };
  await writeFile(`${prefix}.json`, JSON.stringify(diagnostic, null, 2));
  await writeFile(
    `${out}/layout-metrics.json`,
    JSON.stringify(metrics, null, 2),
  );
  console.error(
    `FAIL arena lobby at ${activeWidth}px during ${stage}: ${activePage?.url()}. Evidence: ${prefix}.*`,
  );
  throw error;
} finally {
  await browser.close();
}

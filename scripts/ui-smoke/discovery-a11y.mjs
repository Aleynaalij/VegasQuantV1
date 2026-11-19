// Synthetic-only browser acceptance. Run against a local, fixture-enabled build.
// Install pinned playwright and axe-core in CI; never point this at a deployed service.
import fs from "node:fs/promises";
import { heroContrast } from "./contrast-bound.mjs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const axePath =
  process.env.AXE_CORE_PATH || require.resolve("axe-core/axe.min.js");
const base = new URL(process.env.DISCOVERY_TEST_URL || "http://127.0.0.1:3197");
assert(
  ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname),
  "Only loopback fixtures allowed",
);
const out = process.env.DISCOVERY_A11Y_OUTPUT || "/tmp/discovery-a11y";
await fs.mkdir(out, { recursive: true });
const report = {
  scope:
    "Synthetic discovery only; no live auth, production data, physical touch or screen-reader claims",
  cases: [],
  failures: [],
  blockedRequests: [],
};
let browser;
try {
  browser = await chromium.launch(
    process.env.PLAYWRIGHT_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
      : {},
  );
  for (const width of [360, 390, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    await context.route("**/*", async (route) => {
      const req = route.request(),
        u = new URL(req.url());
      if (
        u.origin !== base.origin ||
        u.pathname.startsWith("/api/") ||
        !["GET", "HEAD"].includes(req.method())
      ) {
        report.blockedRequests.push({
          url: u.origin + u.pathname,
          method: req.method(),
        });
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    const scenarios = [
      ["slate", ""],
      ...["nba", "nhl", "nfl", "ncaab"].map((s) => [
        s,
        `?event=${s}%3Afixture-${s}`,
      ]),
      ...["empty", "signed-out", "denied", "unavailable"].map((s) => [
        s,
        `?scenario=${s}`,
      ]),
      ["unresolved", "?event=nba%3Adoes-not-exist"],
    ];
    for (const [name, query] of scenarios) {
      const response = await page.goto(
        base.origin + "/staging/discovery" + query,
        { waitUntil: "networkidle" },
      );
      assert.equal(
        response.status(),
        200,
        `Fixture route gated or unavailable: ${name}`,
      );
      await page
        .getByText(
          "SYNTHETIC FIXTURES · Not live research, records or permissions.",
          { exact: true },
        )
        .waitFor();
      await page.waitForFunction(
        () =>
          !document
            .querySelector(".d1-status")
            ?.textContent?.startsWith("Loading"),
      );
      const root = page.locator(".d1");
      assert.equal(
        await root.locator("h1").count(),
        1,
        "Exactly one discovery h1",
      );
      assert.equal(
        await root
          .locator(
            'form[action*="api"],button[type="submit"][formaction*="api"]',
          )
          .count(),
        0,
      );
      await page.addScriptTag({ path: axePath });
      const axe = await page.evaluate(async () =>
        window.axe.run(".d1", {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        }),
      );
      const geometry = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
        moving: [...document.querySelectorAll(".d1 *")].filter((e) => {
          const s = getComputedStyle(e);
          return (
            s.animationName !== "none" ||
            s.transitionDuration.split(",").some((v) => parseFloat(v) > 0)
          );
        }).length,
      }));
      const controls = await root
        .locator(
          "button,input,select,summary,.d1-link,.d1-tools a,.d1-breadcrumb a",
        )
        .evaluateAll((nodes) =>
          nodes
            .filter((e) => e.getClientRects().length)
            .map((e) => ({
              text: e.textContent?.trim().slice(0, 80),
              height: e.getBoundingClientRect().height,
              width: e.getBoundingClientRect().width,
            }))
            .filter((b) => b.height < 44 || b.width < 44),
        );
      const heroSnapshot = await page.locator(".d1-hero").evaluate((hero) => {
        const overlay = getComputedStyle(hero, "::after");
        return {
          gradient: getComputedStyle(hero).backgroundImage,
          overlay: {
            borderColor: overlay.borderTopColor,
            opacity: overlay.opacity,
            image: overlay.backgroundImage,
            background: overlay.backgroundColor,
          },
          nodes: [...hero.children].map((node) => {
            const s = getComputedStyle(node);
            return {
              tag: node.tagName,
              text: node.textContent,
              color: s.color,
              fontSize: s.fontSize,
              fontWeight: s.fontWeight,
              opacity: s.opacity,
              filter: s.filter,
              mixBlendMode: s.mixBlendMode,
            };
          }),
        };
      });
      const computedHeroContrast = heroContrast(heroSnapshot);
      if (computedHeroContrast.some((node) => !node.pass))
        report.failures.push(
          `${name}@${width}: conservative computed gradient contrast failed`,
        );
      report.cases.push({
        name,
        width,
        geometry,
        heroSnapshot,
        computedHeroContrast,
        smallPrimaryTargets: controls,
        violations: axe.violations,
        incomplete: axe.incomplete,
      });
      if (
        axe.violations.length ||
        geometry.overflow ||
        !geometry.reduced ||
        geometry.moving ||
        controls.length
      )
        report.failures.push(
          `${name}@${width}: accessibility/geometry acceptance failed`,
        );
      await page.screenshot({
        path: `${out}/${name}-${width}.png`,
        fullPage: true,
      });
    }
    await page.goto(base.origin + "/staging/discovery", {
      waitUntil: "networkidle",
    });
    await page.locator(".d1-skip").focus();
    await page.keyboard.press("Enter");
    assert.equal(
      await page
        .locator("#d1-title")
        .evaluate((e) => e === document.activeElement),
      true,
      "Skip link focus",
    );
    await page.getByLabel("Sport", { exact: true }).selectOption("nba");
    await page.getByRole("button", { name: "Find games", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.waitForURL("**sport=nba**");
    await page.locator(".d1-game").first().waitFor();
    assert.equal(await page.locator(".d1-game").count(), 1, "NBA filter");
    await page
      .getByRole("link", { name: "Explore this game", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await page.waitForURL("**event=nba**");
    await page
      .getByRole("heading", { name: "Research overview", exact: true })
      .waitFor();
    assert.equal(
      await page
        .locator("#d1-title")
        .evaluate((e) => e === document.activeElement),
      true,
      "Client room navigation focus",
    );
    const summary = page.locator(".d1-research-card summary").first();
    await summary.focus();
    await page.keyboard.press("Enter");
    assert.equal(
      await summary.evaluate((e) => e.parentElement.open),
      true,
      "Keyboard disclosure",
    );
    assert.match(
      await page.locator(".d1").innerText(),
      /Sample correction notice/,
    );
    await context.close();
  }
} catch (error) {
  report.failures.push(error.stack || String(error));
} finally {
  await browser?.close();
  await fs.writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
}
console.log(
  JSON.stringify(
    {
      cases: report.cases.length,
      failures: report.failures,
      report: `${out}/report.json`,
    },
    null,
    2,
  ),
);
if (report.failures.length) process.exitCode = 1;

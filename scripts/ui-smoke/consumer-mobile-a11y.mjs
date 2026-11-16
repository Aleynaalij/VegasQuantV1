// Local synthetic layout audit, not hosted authorization or assistive-technology certification.
// Requires CONSUMER_UI_ENABLED=true, STAGING_DISCOVERY_ENABLED=true,
// STAGING_DISCOVERY_FIXTURES=true; build with synthetic Supabase public configuration.
// Runtime dependencies: pinned playwright and axe-core (same as discovery audit).
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const axePath =
  process.env.AXE_CORE_PATH || require.resolve("axe-core/axe.min.js");
const base = new URL(process.env.CONSUMER_TEST_URL || "http://127.0.0.1:3201");
assert(
  ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname),
  "Loopback only",
);
const out = process.env.CONSUMER_AUDIT_OUTPUT || "/tmp/consumer-mobile-a11y";
await fs.mkdir(out, { recursive: true });
const report = {
  scope:
    "Anonymous Home/Zone and explicit fixture Rooms; automated checks only. No physical touch, screen reader, authenticated social, or live permissions claims.",
  cases: [],
  failures: [],
};
let browser;
try {
  browser = await chromium.launch(
    process.env.PLAYWRIGHT_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
      : {},
  );
  for (const width of [360, 390, 768, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    await context.route("**/*", (route) => {
      const req = route.request(),
        u = new URL(req.url());
      return u.origin === base.origin &&
        !u.pathname.startsWith("/api/") &&
        ["GET", "HEAD"].includes(req.method())
        ? route.continue()
        : route.abort();
    });
    const page = await context.newPage();
    for (const [name, path, selector] of [
      ["home", "/", ".home2"],
      ["zone", "/community", ".zone2-experience"],
      ...["nba", "nhl", "nfl", "ncaab"].map((s) => [
        `room-${s}`,
        `/staging/discovery/rooms/${s}/fixture-${s}`,
        ".gr",
      ]),
    ]) {
      const response = await page.goto(base.origin + path, {
        waitUntil: "networkidle",
      });
      assert.equal(response.status(), 200, `${name} must be available`);
      const root = page.locator(selector);
      await root.waitFor();
      if (name.startsWith("room-"))
        await page
          .getByText(
            "Synthetic test records, not live research or permissions.",
            { exact: false },
          )
          .waitFor();
      await page.addScriptTag({ path: axePath });
      const audit = await page.evaluate(async () =>
        window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        }),
      );
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      );
      const smallTargets = await root
        .locator("a,button,input,select,summary")
        .evaluateAll((nodes) =>
          nodes
            .filter((e) => e.getClientRects().length)
            .map((e) => ({
              text: (e.getAttribute("aria-label") || e.textContent || "")
                .trim()
                .slice(0, 80),
              width: e.getBoundingClientRect().width,
              height: e.getBoundingClientRect().height,
            }))
            .filter((e) => e.width < 24 || e.height < 24),
        );
      // Target geometry is reported, not falsely equated to WCAG spacing/exemption failures.
      report.cases.push({
        name,
        width,
        overflow,
        smallTargets,
        violations: audit.violations,
        incomplete: audit.incomplete,
      });
      if (overflow || audit.violations.length)
        report.failures.push(
          `${name}@${width}: ${audit.violations.length} axe violations, overflow=${overflow}`,
        );
      const control = root
        .locator(
          "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),summary",
        )
        .first();
      await control.focus();
      assert(
        await control.evaluate((e) => e === document.activeElement),
        `${name}: control accepts keyboard focus`,
      );
      await page.screenshot({
        path: `${out}/${name}-${width}.png`,
        fullPage: true,
      });
    }
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

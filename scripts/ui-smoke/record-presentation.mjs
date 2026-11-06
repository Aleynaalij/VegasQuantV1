// Isolated record-presentation acceptance. SYNTHETIC fixtures only, never production data.
// Build with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321, run the existing stub + app,
// then UI_SMOKE_URL=http://127.0.0.1:3100 node scripts/ui-smoke/record-presentation.mjs.
// Negative controls: RECORD_NEGATIVE=loss | clv | private. Each must exit nonzero.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
assert.ok(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Use the local synthetic app only",
);
const out = process.env.RECORD_SCREENSHOTS || "/tmp/record-presentation";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_EXECUTABLE || process.env.CHROMIUM_PATH,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const uid = "00000000-0000-0000-0000-000000000001";
const sample = (visible) => ({
  picks: visible ? 150 : 78,
  wins: visible ? 60 : 30,
  losses: visible ? 90 : 48,
  pushes: 0,
  units: visible ? -60 : -33,
  roi: visible ? -40 : -42.3,
  hitRate: visible ? 40 : 38.5,
  breakEvenRate: 66.7,
  clvLegs: 61,
  beatCloseRate: 41,
  avgClvPoints: -0.8,
  since: "2026-10-03T16:00:00Z",
  visible,
});
let cases = 0;
try {
  for (const width of [360, 390, 1280]) {
    for (const state of [
      "hidden-member",
      "preview-admin",
      "public-loss",
      "public-admin",
      "unknown-rates",
      "unavailable",
      "no-data",
    ]) {
      const admin = state.includes("admin");
      const visible = state.startsWith("public") || state === "unknown-rates";
      const ctx = await browser.newContext({
        viewport: { width, height: 900 },
        reducedMotion: "reduce",
      });
      await ctx.addInitScript(
        ({ uid, signedIn }) => {
          localStorage.setItem("vq-theme", "dark");
          localStorage.setItem(`vq-app-refresh:${uid}`, "gold-2026-10-22-v2");
          localStorage.setItem(
            `vq-push-prompt:${uid}`,
            String(Date.now() + 86400000 * 7),
          );
          if (signedIn)
            localStorage.setItem(
              "sb-127-auth-token",
              JSON.stringify({
                access_token: "smoke",
                refresh_token: "smoke",
                token_type: "bearer",
                expires_in: 86400,
                expires_at: Math.floor(Date.now() / 1000) + 86400 * 400,
                user: {
                  id: uid,
                  aud: "authenticated",
                  role: "authenticated",
                  email: "smoke@example.com",
                  app_metadata: {},
                  user_metadata: { vq_welcome_version: 1 },
                },
              }),
            );
        },
        { uid, signedIn: admin || state === "hidden-member" },
      );
      const record = sample(visible);
      if (state === "unknown-rates")
        Object.assign(record, {
          roi: null,
          hitRate: null,
          breakEvenRate: null,
          beatCloseRate: null,
          clvLegs: 0,
        });
      await ctx.route("**/api/track-record", (r) =>
        r.fulfill({
          status: state === "unavailable" ? 500 : 200,
          json: state === "no-data" ? null : record,
        }),
      );
      await ctx.route("**/rest/v1/rpc/is_admin", (r) =>
        r.fulfill({ json: admin }),
      );
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      for (const route of ["/", "/nfl"]) {
        const loaded = page.waitForResponse((response) =>
          response.url().endsWith("/api/track-record"),
        );
        await page.goto(base + route, { waitUntil: "domcontentloaded" });
        await loaded;
        await page.locator(".vq-brand-opening").waitFor({ state: "hidden" });
        await page.waitForTimeout(700);
        const card = page.locator(".home-record");
        if (!visible && !admin)
          assert.equal(await card.count(), 0, `${state} ${route} ${width}`);
        else {
          await card.waitFor({ state: "visible" });
          await card.scrollIntoViewIfNeeded();
          if (process.env.RECORD_NEGATIVE === "loss")
            await card
              .locator("dd")
              .first()
              .evaluate((el) => {
                el.textContent = "60 wins";
              });
          if (process.env.RECORD_NEGATIVE === "clv")
            await card
              .locator(".home-record-stats > div")
              .last()
              .evaluate((el) => el.remove());
          const text = await card.innerText();
          for (const required of [
            "Record",
            "Hit rate",
            "Units",
            "ROI",
            "Beat the close",
            "needed",
            "Past results don’t guarantee future ones.",
          ])
            assert.ok(
              text.includes(required),
              `${required}: ${state} ${route} ${width}`,
            );
          assert.ok(
            text.includes(`${record.wins}–${record.losses}`),
            "All losses retained beside wins",
          );
          assert.ok(
            text.includes(
              `${record.units < 0 ? "−" : "+"}${Math.abs(record.units).toFixed(1)}u`,
            ),
            "Negative units retained",
          );
          assert.equal(
            await card.locator(".home-record-preview").count(),
            visible ? 0 : 1,
          );
          assert.equal(
            await card.locator('a[href="/history"]').count(),
            admin ? 1 : 0,
          );
          if (state === "unknown-rates")
            assert.ok(
              (text.match(/—/g) || []).length >= 4,
              "Unknown rates stay unknown",
            );
          assert.ok(
            await card
              .locator("dt")
              .evaluateAll((els) =>
                els.every(
                  (el) => parseFloat(getComputedStyle(el).fontSize) >= 11,
                ),
              ),
            "Labels remain readable",
          );
          if (admin) {
            const link = card.getByRole("link", { name: "Full record" });
            await link.focus();
            assert.equal(
              await link.evaluate((el) => el === document.activeElement),
              true,
              "Full record keyboard reachable",
            );
          }
          await page.screenshot({
            path: path.join(
              out,
              `${route === "/" ? "lobby" : "nfl"}-${state}-${width}.png`,
            ),
            fullPage: true,
          });
          await card.screenshot({
            path: path.join(
              out,
              `card-${route === "/" ? "lobby" : "nfl"}-${state}-${width}.png`,
            ),
          });
        }
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          `No horizontal overflow ${state} ${route} ${width}`,
        );
        cases++;
      }
      if (
        state === "public-admin" ||
        state === "public-loss" ||
        state === "hidden-member"
      ) {
        await page.goto(base + "/history", { waitUntil: "domcontentloaded" });
        await page.locator(".vq-brand-opening").waitFor({ state: "hidden" });
        if (admin) {
          await page.locator(".priced-record").first().waitFor();
          const price = page.getByRole("region", {
            name: "Profit at published prices",
            exact: true,
          });
          assert.match(await price.innerText(), /1–1/);
          assert.match(await price.innerText(), /without a price/);
          assert.match(await price.innerText(), /Not a record of placed bets/);
          await page
            .getByText("Full ledger, leg board & audit", { exact: false })
            .click();
          await page
            .getByLabel("Filter", { exact: true })
            .selectOption("Losses");
          await page.getByLabel("Filter", { exact: true }).selectOption("All");
          await page.screenshot({
            path: path.join(out, `history-admin-${width}.png`),
            fullPage: true,
          });
        } else {
          await page
            .getByText("Records are private.", { exact: true })
            .waitFor();
          if (process.env.RECORD_NEGATIVE === "private")
            await page.evaluate(() => {
              const el = document.createElement("section");
              el.className = "priced-record";
              document.querySelector("main").append(el);
            });
          assert.equal(
            await page.locator(".priced-record, .records-dash").count(),
            0,
            "Private record remains restricted",
          );
        }
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          `History overflow ${width}`,
        );
        cases++;
      }
      assert.deepEqual(errors, [], `${state} @${width}`);
      await ctx.close();
    }
  }
  console.log(
    `Record presentation: ${cases} synthetic route/state/viewport cases passed. Images: ${out}`,
  );
} finally {
  await browser.close();
}

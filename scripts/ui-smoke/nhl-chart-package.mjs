import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const fixture = JSON.parse(
  fs.readFileSync("tests/fixtures/nhl-chart.json", "utf8"),
);
const uid = "00000000-0000-4000-8000-000000000001";
const version = fs
  .readFileSync("src/components/app-refresh-notice.tsx", "utf8")
  .match(/const VERSION = "([^"]+)"/)[1];
const post = {
  id: "nhl-smoke",
  user_id: uid,
  author_name: "TheDealer",
  sport: "nhl",
  kind: "talk",
  title: "NHL Charts · Sample Away @ Sample Home",
  body: "Frozen chart research. No selections or odds.",
  card: "nhl-charts:" + fixture.id,
  legs: [],
  stake: null,
  created_at: fixture.collected_at,
  reactions: 0,
  comments: 0,
  following: false,
  reacted: false,
  photo_path: null,
};
const hash = (b) => crypto.createHash("sha256").update(b).digest("hex");
const pngs = [];
for (let page = 1; page <= 9; page++) {
  const r = await fetch(`${base}/api/nhl/chart/${fixture.id}/${page}`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /image\/png/);
  const b = Buffer.from(await r.arrayBuffer());
  assert.equal(b.readUInt32BE(16), 1080);
  assert.equal(b.readUInt32BE(20), 1350);
  pngs.push(b);
}
assert.equal(
  (await fetch(`${base}/api/nhl/chart/${fixture.id}/10`)).status,
  404,
);
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE,
  headless: true,
  args: ["--no-sandbox"],
});
try {
  for (const width of [360, 390, 1280]) {
    const ctx = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
      acceptDownloads: true,
    });
    await ctx.addInitScript(
      ({ uid, version }) => {
        sessionStorage.setItem("vq-prompt-shown", "fixture");
        localStorage.setItem("vq-app-refresh:" + uid, version);
        localStorage.setItem(
          "sb-127-auth-token",
          JSON.stringify({
            access_token: "smoke",
            refresh_token: "smoke",
            token_type: "bearer",
            expires_in: 86400,
            expires_at: Math.floor(Date.now() / 1000) + 86400,
            user: {
              id: uid,
              aud: "authenticated",
              role: "authenticated",
              app_metadata: {},
              user_metadata: { vq_welcome_version: 1 },
            },
          }),
        );
      },
      { uid, version },
    );
    await ctx.route("**/rest/v1/rpc/community_feed", (r) =>
      r.fulfill({ json: [post] }),
    );
    await ctx.route("**/rest/v1/rpc/community_dealer_feed", (r) =>
      r.fulfill({ json: [] }),
    );
    await ctx.route("**/rest/v1/rpc/frank_anniversary", (r) =>
      r.fulfill({ json: { state: "hidden" } }),
    );
    let failed = false;
    await ctx.route("**/rest/v1/rpc/nhl_chart_snapshot", (r) =>
      r.fulfill({ json: failed ? null : fixture }),
    );
    const page = await ctx.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base + "/community", { waitUntil: "networkidle" });
    const chart = page.locator(".nhl-chart-package");
    await chart.waitFor();
    await chart.scrollIntoViewIfNeeded();
    for (let i = 1; i <= 9; i++) {
      const img = chart.locator(`img[src$="/${i}"]`);
      await img.waitFor();
      await img.scrollIntoViewIfNeeded();
      await page.waitForFunction(() => {
        const i = document.querySelector(".nhl-chart-package img");
        return i?.complete && i.naturalWidth === 1080;
      });
      const d = page.waitForEvent("download");
      await chart
        .getByRole("link", { name: "Download card", exact: true })
        .click();
      const download = await d;
      const path = await download.path();
      assert.equal(
        hash(fs.readFileSync(path)),
        hash(pngs[i - 1]),
        "download bytes match displayed native chart",
      );
      if (i < 9)
        await chart.getByRole("button", { name: "Next chart" }).click();
    }
    await chart.getByRole("button", { name: "Previous chart" }).click();
    await chart.evaluate((el) => {
      const start = new Touch({
        identifier: 1,
        target: el,
        clientX: 300,
        clientY: 100,
      });
      el.dispatchEvent(
        new TouchEvent("touchstart", { bubbles: true, touches: [start] }),
      );
      const end = new Touch({
        identifier: 1,
        target: el,
        clientX: 100,
        clientY: 100,
      });
      el.dispatchEvent(
        new TouchEvent("touchend", {
          bubbles: true,
          touches: [],
          changedTouches: [end],
        }),
      );
    });
    assert.match(await chart.locator("nav").innerText(), /9 \/ 9/);
    assert.equal(
      new URL(page.url()).pathname,
      "/community",
      "chart swipe must stay in The Zone",
    );
    fs.mkdirSync("artifacts/ui-smoke", { recursive: true });
    await chart.screenshot({
      path: `artifacts/ui-smoke/nhl-charts-${width}-closed.png`,
    });
    await chart.locator("details.publication-analysis > summary").click();
    assert.match(await chart.innerText(), /Data collected/);
    assert.match(await chart.innerText(), /—/);
    assert.equal(
      await chart.locator('a[href^="https://api-web.nhle.com/"]').count(),
      1,
    );
    await chart.scrollIntoViewIfNeeded();
    fs.mkdirSync("artifacts/ui-smoke", { recursive: true });
    await chart.screenshot({
      path: `artifacts/ui-smoke/nhl-charts-${width}.png`,
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "no page overflow",
    );
    failed = true;
    await page.reload({ waitUntil: "networkidle" });
    await chart.locator("details.publication-analysis > summary").click();
    await chart
      .getByText("Chart source details could not load.", { exact: false })
      .waitFor();
    failed = false;
    await chart.getByRole("button", { name: "Retry sources" }).click();
    await chart.getByText(/Data collected/).waitFor();
    assert.deepEqual(errors, []);
    await ctx.close();
    console.log(
      `PASS NHL charts ${width}px: native PNGs, pages/swipe, exact downloads, provenance/missing data, error/retry, no overflow`,
    );
  }
} finally {
  await browser.close();
}

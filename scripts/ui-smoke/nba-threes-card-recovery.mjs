// Isolated real React component acceptance with synthetic network failures and text.
import { build } from "esbuild";
import assert from "node:assert/strict";
import sharp from "sharp";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const result = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {NbaThreesCardPreview} from './src/components/nba-threes-card-preview'; const root=createRoot(document.getElementById('root')); window.mountCard=(day)=>root.render(<figure className="zone-card zone-media"><NbaThreesCardPreview key={day} day={day} body={'Synthetic original research.\\nNo real statistics in this test.'}/></figure>); window.mountCard('2026-11-07');`,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  outfile: "card.js",
  define: { "process.env.NODE_ENV": '"production"' },
});
const js = result.outputFiles.find((f) => f.path.endsWith(".js")).text;
const css = result.outputFiles.find((f) => f.path.endsWith(".css")).text;
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
    : {},
);
const png = await sharp({
  create: { width: 1080, height: 1350, channels: 3, background: "#07090d" },
})
  .png()
  .toBuffer();

try {
  for (const width of [360, 390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    let requests = [],
      mode = "recover";
    await page.route("**/*", async (route) => {
      const url = route.request().url();
      if (url.includes("/api/nba/threes-card/")) {
        requests.push(url);
        if (mode === "fail" || requests.length === 1)
          return route.fulfill({ status: 503, body: "Synthetic failure" });
        return route.fulfill({ contentType: "image/png", body: png });
      }
      return route.fulfill({
        contentType: "text/html",
        body: `<style>body{margin:16px;background:#122b23;color:white;font-family:Arial}figure{margin:0}img{width:100%;height:auto}${css}</style><main class="zone-feed"><div id="root"></div></main>`,
      });
    });
    await page.goto("http://card.test/");
    await page.addScriptTag({ content: js });
    await page.getByText("Card image unavailable").waitFor();
    assert.equal(await page.locator("details").getAttribute("open"), "");
    assert.equal(
      await page.getByRole("link", { name: "Download card" }).count(),
      0,
    );
    await page.getByRole("link", { name: "Download card" }).waitFor();
    assert.equal(requests.length, 2);
    assert.match(requests[1], /retry=/);
    assert.equal(
      await page
        .locator("img")
        .evaluate((img) => img.complete && img.naturalWidth > 0),
      true,
    );
    assert.ok(
      !(await page
        .locator("img")
        .getAttribute("alt")
        .then((v) => v.includes("Synthetic original"))),
    );
    mode = "fail";
    requests = [];
    await page.evaluate(() => window.mountCard("2026-11-08"));
    await page.getByRole("button", { name: "Retry image" }).waitFor();
    assert.equal(requests.length, 2);
    await page.waitForTimeout(1700);
    assert.equal(requests.length, 2, "automatic retries must stop");
    assert.equal(
      await page.locator("img").count(),
      0,
      "no broken image remains",
    );
    assert.equal(
      await page.locator("details p").innerText(),
      "Synthetic original research.\nNo real statistics in this test.",
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.getByRole("button", { name: "Retry image" }).click();
    await page.getByRole("button", { name: "Retry image" }).waitFor();
    assert.equal(requests.length, 3);
    mode = "recover";
    await page.getByRole("button", { name: "Retry image" }).click();
    await page.getByRole("link", { name: "Download card" }).waitFor();
    assert.equal(requests.length, 4);
    assert.equal(
      new Set(requests).size,
      4,
      "retries bypass a cached failed URL",
    );
    assert.match(
      await page
        .getByRole("link", { name: "Download card" })
        .getAttribute("download"),
      /2026-11-08/,
    );
    console.log(
      `PASS ${width}px: transient recovery, bounded failure, original text, repeated manual retry, day remount, no overflow`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}

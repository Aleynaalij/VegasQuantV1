// NBA picks are paused: the NBA chip carries a "Research" sticker and opens the research tab, and every
// old /nba link lands there. Runs against the app on :3100 with the stub.
import assert from "node:assert/strict";
const pw = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const { chromium } = pw.default || pw;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const base = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
for (const width of [390, 1280]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`${base}/feed`, { waitUntil: "networkidle" });
  const chip = p.getByRole("navigation", { name: "Sport selection" }).getByRole("link", { name: /NBA/ });
  assert.match(await chip.innerText(), /Research/i);
  await chip.click();
  await p.waitForURL(`${base}/nba-research`);
  await p.getByRole("heading", { name: "NBA research", level: 1 }).waitFor();
  assert.match(await p.locator(".nbar-badge").innerText(), /not picks/i);
  assert.equal(
    await p.getByRole("navigation", { name: "Sport selection" }).getByRole("link", { name: /NBA/ }).getAttribute("aria-current"),
    "page",
  );
  // The stub has no NBA games, so the tab shows its empty state rather than failing.
  await p.getByText("No NBA games on the board").waitFor();
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth <= 1), true);
  for (const path of ["/nba", "/nba/zone", "/nba/games/any-game"]) {
    await p.goto(base + path, { waitUntil: "networkidle" });
    assert.equal(new URL(p.url()).pathname, "/nba-research", path);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
}
await browser.close();
console.log("NBA paused: Research chip, research tab and /nba redirects passed at phone and desktop width.");

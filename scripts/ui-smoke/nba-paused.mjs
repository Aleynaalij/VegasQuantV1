// NBA is paused: the NBA chip shows a "Soon" sticker and opens the coming-soon note, and every old
// /nba link lands on Home with the note open. Runs against the app on :3100 with the stub.
import assert from "node:assert/strict";
const pw = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const { chromium } = pw.default || pw;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const base = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const note = (p) => p.getByRole("dialog", { name: "NBA is coming soon" });
for (const width of [390, 1280]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${base}/feed`, { waitUntil: "networkidle" });
  const chip = p.getByRole("navigation", { name: "Sport selection" }).getByRole("button", { name: /NBA/ });
  assert.match(await chip.innerText(), /Soon/i);
  assert.equal(await p.getByRole("navigation", { name: "Sport selection" }).getByRole("link", { name: "NBA" }).count(), 0);
  await chip.click();
  await note(p).waitFor();
  assert.match(await note(p).innerText(), /collecting game data every day/);
  assert.match(await note(p).innerText(), /NFL has been great/);
  // The page behind the note is inert: Tab never reaches it (after the last button the browser's own UI
  // may take focus, read as <body>). Focus returns to the chip when the note closes.
  for (let i = 0; i < 6; i++) {
    await p.keyboard.press("Tab");
    const where = await p.evaluate(() => document.activeElement === document.body || !!document.activeElement?.closest("dialog[open]"));
    assert.equal(where, true, "focus reached the page behind the note");
  }
  await p.keyboard.press("Escape");
  await note(p).waitFor({ state: "hidden" });
  assert.equal(await p.evaluate(() => document.activeElement?.classList.contains("nba-soon-chip")), true, "focus not returned to the chip");
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth <= 1), true);
  for (const path of ["/nba", "/nba/zone", "/nba/games/any-game"]) {
    await p.goto(base + path, { waitUntil: "networkidle" });
    assert.equal(new URL(p.url()).pathname, "/", path);
    await note(p).waitFor();
    await note(p).getByRole("button", { name: "Back to NFL" }).click();
    await note(p).waitFor({ state: "hidden" });
  }
  await ctx.close();
}
await browser.close();
console.log("NBA paused: coming-soon chip, note and /nba redirects passed at phone and desktop width.");

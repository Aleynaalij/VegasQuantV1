// Home leads with the official record once it has earned the spot (src/lib/track-record.ts):
// hidden from members until then, a labelled preview for admins, and never wins without units.
// /api/track-record is routed here with synthetic totals. Runs against :3100 with the stub.
import assert from "node:assert/strict";
const pw = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const { chromium } = pw.default || pw;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const base = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const record = (visible) => ({
  picks: visible ? 160 : 78,
  wins: visible ? 112 : 60,
  losses: visible ? 46 : 18,
  pushes: visible ? 2 : 0,
  units: visible ? 6.4 : -3.1,
  roi: visible ? 4 : -4,
  hitRate: visible ? 70.9 : 76.9,
  breakEvenRate: 72.4,
  clvLegs: 61,
  beatCloseRate: 54,
  avgClvPoints: 0.8,
  since: "2026-10-03T16:00:00Z",
  visible,
});
for (const width of [390, 1280])
  for (const [visible, admin] of [
    [false, false],
    [false, true],
    [true, false],
  ]) {
    const label = `@${width} visible=${visible} admin=${admin}`;
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    await ctx.route("**/api/track-record", (r) => r.fulfill({ json: record(visible) }));
    if (admin) {
      await ctx.addInitScript(() =>
        localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: "smoke", token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400 * 400, refresh_token: "smoke", user: { id: "00000000-0000-0000-0000-000000000001", aud: "authenticated", role: "authenticated", email: "smoke@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-10-01T00:00:00Z" } })),
      );
      await ctx.route("**/rest/v1/rpc/is_admin", (r) => r.fulfill({ json: true }));
    }
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(base + "/", { waitUntil: "networkidle" });
    await p.waitForTimeout(800);
    const card = p.locator(".home-record");
    if (!visible && !admin) assert.equal(await card.count(), 0, label);
    else {
      await card.waitFor();
      const text = await card.innerText();
      // Wins never appear without units, ROI and closing-line value.
      for (const t of ["Record", "Units", "Beat the close", "needed"]) assert.ok(new RegExp(t, "i").test(text), `${t} ${label}`);
      assert.equal(await card.locator(".home-record-preview").count(), visible ? 0 : 1, label);
      assert.equal(await card.locator("a[href=\"/history\"]").count(), admin ? 1 : 0, `records link only for admins ${label}`);
      if (!visible) assert.match(text, /−3\.1u/);
      // It leads Home: above the next-kickoff card.
      const order = await p.evaluate(() => {
        const rec = document.querySelector(".home-record"),
          brief = document.querySelector(".home-brief");
        return !brief || !!(rec.compareDocumentPosition(brief) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      assert.ok(order, `record leads ${label}`);
    }
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 1), `overflow ${label}`);
    assert.deepEqual(errors, [], label);
    await ctx.close();
  }
await browser.close();
console.log("Home record: hidden until earned, admin preview, full numbers beside wins, leads Home; phone and desktop pass.");

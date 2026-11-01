// Live game day: the "Live now" strip on NHL and NBA Home. A stubbed /api/live stands in for ESPN;
// nothing here is real data. Runs against the app on :3100 with the stub.
import assert from "node:assert/strict";
import fs from "node:fs";
const pw = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const { chromium } = pw.default || pw;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const base = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const iso = (h) => new Date(Date.now() + h * 3600000).toISOString();
const nhl = JSON.parse(fs.readFileSync("tests/fixtures/sports/nhl/page.json", "utf8"));
const g = nhl.games[0];
const team = (t, score) => ({ name: t.name, abbreviation: t.abbreviation, score });
const liveGames = [
  // The fixture's own game, live: linked to its matchup by slug and flagged "Our pick".
  { id: "401", start: iso(-1), state: "in", detail: "2nd 10:41", away: team(g.away, 2), home: team(g.home, 1) },
  { id: "402", start: iso(-5), state: "post", detail: "Final/OT", away: { name: "Boston Bruins", abbreviation: "BOS", score: 4 }, home: { name: "Toronto Maple Leafs", abbreviation: "TOR", score: 5 } },
  { id: "403", start: iso(2), state: "pre", detail: "8:00 PM", away: { name: "X", abbreviation: "X", score: null }, home: { name: "Y", abbreviation: "Y", score: null } },
];
const page = () => {
  const p = structuredClone(nhl);
  p.games[0].start_time = iso(-1);
  p.selections = [{ ...(p.selections?.[0] || {}), id: "s1", game_id: g.id }];
  return p;
};
for (const width of [390, 1280])
  for (const mode of ["live", "none", "down"]) {
    const label = `nhl ${mode} @${width}`;
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    let reads = 0;
    await ctx.route("**/api/live*", (r) => {
      reads++;
      assert.equal(new URL(r.request().url()).searchParams.get("sport"), "nhl");
      return mode === "down"
        ? r.fulfill({ status: 503, json: { games: [], unavailable: true } })
        : r.fulfill({ json: { sport: "nhl", games: mode === "live" ? liveGames : [liveGames[2]] } });
    });
    await ctx.route("**/rest/v1/rpc/sports_*", (r) => r.fulfill({ json: page() }));
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(`${base}/nhl`, { waitUntil: "networkidle" });
    await p.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
    assert.ok(reads >= 1, `live scores requested ${label}`);
    if (mode === "live") {
      const strip = p.locator(".live-now");
      await strip.waitFor();
      assert.match(await strip.locator(".live-now-title").innerText(), /live now/i);
      const cards = strip.locator(".live-now-game");
      assert.equal(await cards.count(), 2, `pre-game hidden ${label}`);
      const first = await cards.first().innerText();
      for (const t of ["LIVE", "2nd 10:41", "Our pick on this game", "2", "1"]) assert.ok(first.includes(t), `${t} ${label}`);
      assert.match(await cards.nth(1).innerText(), /Final\/OT/);
      assert.equal(await cards.nth(1).locator(".live-now-pick").count(), 0, "no pick flag on other games");
      const href = await cards.first().locator("a").getAttribute("href");
      assert.equal(href, `/nhl/games/${`${g.away.abbreviation}-${g.home.abbreviation}-401`.toLowerCase().replace(/[^a-z0-9-]/g, "")}`);
      assert.equal(await cards.first().locator(".is-leading").innerText().then((t) => t.includes("2")), true, "leader marked");
      // The strip leads the slate.
      assert.ok(await p.evaluate(() => {
        const s = document.querySelector(".live-now"), list = document.querySelector(".vq-game-list, .vq-game-row");
        return !list || !!(s.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING);
      }), `strip above slate ${label}`);
    } else {
      // Nothing live or final (or the feed is down): no empty box.
      await p.waitForTimeout(500);
      assert.equal(await p.locator(".live-now").count(), 0, label);
    }
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 1), `overflow ${label}`);
    assert.deepEqual(errors, [], label);
    await ctx.close();
  }
await browser.close();
console.log("Live now: live and final scores, matchup links, our-pick flag, hidden when quiet or down; phone and desktop pass.");

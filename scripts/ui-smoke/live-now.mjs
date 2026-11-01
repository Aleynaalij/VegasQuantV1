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
  // The fixture's own game, live: linked to its matchup by slug and showing where each pick stands.
  { id: "401", start: iso(-1), state: "in", detail: "2nd 10:41", away: team(g.away, 2), home: team(g.home, 1) },
  { id: "402", start: iso(-5), state: "post", detail: "Final/OT", away: { name: "Boston Bruins", abbreviation: "BOS", score: 4 }, home: { name: "Toronto Maple Leafs", abbreviation: "TOR", score: 5 } },
  { id: "403", start: iso(2), state: "pre", detail: "8:00 PM", away: { name: "X", abbreviation: "X", score: null }, home: { name: "Y", abbreviation: "Y", score: null } },
];
const page = () => {
  const p = structuredClone(nhl);
  p.games[0].start_time = iso(-1);
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
    // Picks are looked up by ESPN id: the live game has one (published before it started).
    const lookups = [];
    await ctx.route("**/rest/v1/sports_games*", (r) => {
      const u = new URL(r.request().url());
      lookups.push(u.searchParams.get("provider_id"));
      assert.equal(u.searchParams.get("sport"), "eq.nhl");
      const m = (market, side, direction, line, player) => ({ market, side, direction, line, player });
      return r.fulfill({
        json: [
          {
            provider_id: "401",
            picks: [
              { id: "s1", market: m("h2h", "away", null, null, null) },
              { id: "s2", market: m("totals", null, "Over", 6.5, null) },
              { id: "s3", market: m("player_points", null, "Over", 0.5, "A Skater") },
            ],
          },
          { provider_id: "402", picks: [] },
        ],
      });
    });
    const boxReads = [];
    await ctx.route("**/api/live/box*", (r) => {
      boxReads.push(new URL(r.request().url()).search);
      return r.fulfill({ json: { players: { "a skater": { points: 1, goals: 1, assists: 0 } } } });
    });
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(`${base}/nhl`, { waitUntil: "networkidle" });
    await p.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
    assert.ok(reads >= 1, `live scores requested ${label}`);
    if (mode === "live") {
      await p.locator(".live-now-picks li").first().waitFor();
      assert.equal(lookups.at(-1), "in.(401,402)", "only live and final games are looked up");
      // Your pick is sweating: each pick's live standing, from the score and the live box score.
      await p.locator(".live-now-picks .is-hit").waitFor();
      const picks = await p.locator(".live-now-picks li").allInnerTexts();
      const away = g.away.abbreviation;
      assert.deepEqual(
        picks.map((t) => t.replace(/\s+/g, " ").trim()),
        [
          `${away} to win leading by 1 · On track`,
          "Over 6.5 3 total, needs 4 · Needs more",
          "Skater O 0.5 pts 1 pts, cleared · Hit",
        ],
        label,
      );
      assert.ok(boxReads.every((q) => q === "?sport=nhl&id=401"), "box score only for the picked game");
      const strip = p.locator(".live-now");
      await strip.waitFor();
      assert.match(await strip.locator(".live-now-title").innerText(), /live now/i);
      const cards = strip.locator(".live-now-game");
      assert.equal(await cards.count(), 2, `pre-game hidden ${label}`);
      const first = await cards.first().innerText();
      for (const t of ["LIVE", "2nd 10:41", "2", "1"]) assert.ok(first.includes(t), `${t} ${label}`);
      assert.match(await cards.nth(1).innerText(), /Final\/OT/);
      assert.equal(await cards.nth(1).locator(".live-now-picks").count(), 0, "no picks on other games");
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
// NBA: a live game whose pick expired at tipoff still sweats and links to its matchup.
for (const width of [390, 1280]) {
  const label = `nba @${width}`;
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
  await ctx.route("**/api/live*", (r) =>
    r.fulfill({
      json: {
        sport: "nba",
        games: [
          { id: "501", start: iso(-1), state: "in", detail: "Q3 4:12", away: { name: "Utah Jazz", abbreviation: "UTA", score: 70 }, home: { name: "Portland Trail Blazers", abbreviation: "POR", score: 74 } },
          { id: "502", start: iso(-1), state: "in", detail: "Q2 1:00", away: { name: "Miami Heat", abbreviation: "MIA", score: 40 }, home: { name: "Orlando Magic", abbreviation: "ORL", score: 41 } },
        ],
      },
    }),
  );
  await ctx.route("**/rest/v1/nba_games*", (r) => {
    const u = new URL(r.request().url());
    if (!(u.searchParams.get("select") || "").includes("picks")) return r.fallback();
    // p1 revised p0: only the revision counts.
    const pk = (id, line, supersedes_id) => ({ id, player: "Deni Avdija", market: "player_points", direction: "Over", line, supersedes_id });
    return r.fulfill({
      json: [
        { provider_id: "501", slug: "uta-por-501", picks: [pk("p0", 24.5, null), pk("p1", 23.5, "p0")] },
        { provider_id: "502", slug: "mia-orl-502", picks: [] },
      ],
    });
  });
  await ctx.route("**/api/live/box*", (r) =>
    r.fulfill({ json: { players: { "deni avdija": { points: 18, rebounds: 7 } } } }),
  );
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`${base}/nba`, { waitUntil: "networkidle" });
  await p.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
  const strip = p.locator(".live-now");
  await strip.locator(".live-now-picks .is-behind").waitFor();
  const cards = strip.locator(".live-now-game");
  assert.match(await cards.first().innerText(), /Avdija O 23\.5 PTS\s+18 PTS, needs 6 · Needs more/, `picked game first ${label}`);
  assert.equal(await cards.first().locator("a").getAttribute("href"), "/nba/games/uta-por-501");
  assert.equal(await cards.nth(1).locator("a").getAttribute("href"), "/nba/games/mia-orl-502");
  assert.equal(await strip.locator(".live-now-picks li").count(), 1, `superseded pick hidden ${label}`);
  assert.deepEqual(errors, [], label);
  await ctx.close();
}
await browser.close();
console.log("Live now: live and final scores, matchup links, pick sweating, hidden when quiet or down; phone and desktop pass.");

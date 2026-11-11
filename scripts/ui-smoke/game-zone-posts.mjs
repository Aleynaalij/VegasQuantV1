// Synthetic browser fixtures only: no production accounts, posts or data.
// Zone posts tied to a game show on that game's matchup page in every sport; the Zone's NFL chip works.
import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || process.env.PLAYWRIGHT_EXECUTABLE,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const base = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const out = process.env.UI_ARTIFACT_DIR || "artifacts/game-zone-posts";
await mkdir(out, { recursive: true });
const UID = "00000000-0000-4000-8000-000000000001";
const refresh = fs.readFileSync("src/components/app-refresh-notice.tsx", "utf8").match(/const VERSION = "([^"]+)"/)[1];
const posts = (sport) => [
  {
    id: "62fddd67-c335-4d23-a28f-f2a0c5c71166", sport, kind: "talk", card: "vq-publication:v1",
    title: "Matchup Cheat Sheet · Sample Away @ Sample Home",
    body: "Research only · Sample venue.\n\nSituation: synthetic fixture line one.\n\nMatchup: synthetic fixture line two.",
    legs: [], photo_path: null, author_name: "TheDealer", created_at: new Date(Date.now() - 3600000).toISOString(), reactions: 3, comments: 2,
  },
  {
    id: "4f4d0197-87a2-434e-88a7-f930e31638f8", sport, kind: "talk", card: "nfl-wr:2026-11-08:1",
    title: "WR matchups 1 of 2 · SUN",
    body: "WR matchups 1 of 2: notable receivers vs the opposing pass defense.\n97 · Sample Receiver (AAA) vs BBB: green",
    legs: [], photo_path: null, author_name: "TheDealer", created_at: new Date(Date.now() - 7200000).toISOString(), reactions: 0, comments: 0,
  },
];
const nbaGame = {
  id: "00000000-0000-4000-8000-0000000000b1", slug: "boston-detroit", provider_id: "test",
  away_team: "Boston Celtics", home_team: "Detroit Pistons", away_abbreviation: "BOS", home_abbreviation: "DET",
  tipoff: new Date(Date.now() + 86400000).toISOString(), tipoff_tbd: false, venue: "Little Caesars Arena",
  season: 2027, season_type: 2, status: "STATUS_SCHEDULED", away_score: null, home_score: null,
  source: "https://www.espn.com/nba/", updated_at: new Date().toISOString(),
};
const nhl = JSON.parse(fs.readFileSync("tests/fixtures/sports/nhl/page.json", "utf8"));
nhl.games = nhl.games.slice(0, 1);
nhl.games[0].start_time = new Date(Date.now() + 6 * 3600000).toISOString();

async function open({ width = 390, signedIn = true, mode }) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
  await ctx.addInitScript(({ uid, signedIn, refresh }) => {
    sessionStorage.setItem("vq-prompt-shown", "fixture");
    localStorage.setItem(`vq-app-refresh:${uid}`, refresh);
    localStorage.setItem(`vq-push-prompt:${uid}`, String(Date.now() + 7 * 86400000));
    if (signedIn)
      localStorage.setItem("sb-127-auth-token", JSON.stringify({
        access_token: "smoke", refresh_token: "smoke", token_type: "bearer", expires_in: 86400,
        expires_at: Math.floor(Date.now() / 1000) + 86400,
        user: { id: uid, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: { vq_welcome_version: 1 } },
      }));
  }, { uid: UID, signedIn, refresh });
  const calls = [];
  await ctx.route("**/rest/v1/**", async (r) => {
    const url = new URL(r.request().url()), path = url.pathname;
    if (path.endsWith("/rpc/game_zone_posts")) {
      const body = r.request().postDataJSON();
      calls.push(body);
      return r.fulfill({ json: posts(body.p_sport) });
    }
    if (mode === "nfl") return r.continue(); // the shared stub serves the NFL desk
    if (path.endsWith("membership_status")) return r.fulfill({ json: { allowed: true, admin: false } });
    if (path.endsWith("age_verification_status")) return r.fulfill({ json: { required: false, verified: true } });
    if (path.endsWith("notification_counts")) return r.fulfill({ json: { unread: 0, unviewed: 0, messages: 0 } });
    if (path.endsWith("community_profiles"))
      return r.fulfill({ json: (r.request().headers().accept || "").includes("vnd.pgrst.object") ? { username: "FixtureUser", avatar: "/brand/vq-icon-192.png", visible: true } : [{ username: "FixtureUser", avatar: "/brand/vq-icon-192.png", visible: true }] });
    if (mode === "nba" && path.endsWith("nba_games")) return r.fulfill({ json: url.searchParams.has("slug") ? nbaGame : [nbaGame] });
    if (mode === "nhl" && path.endsWith("/rpc/sports_game")) return r.fulfill({ json: nhl });
    if (path.includes("/rpc/")) return r.fulfill({ json: null });
    return r.fulfill({ json: [] });
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  return { ctx, page, calls };
}

const pages = [
  { mode: "nfl", sport: "nfl", path: "/matchups/sample-sea-den-2026-10-15" },
  { mode: "nba", sport: "nba", path: `/nba/games/${nbaGame.slug}`, game: nbaGame.id },
  { mode: "nhl", sport: "nhl", path: `/nhl/games/${nhl.games[0].slug}`, game: nhl.games[0].id },
];
for (const t of pages)
  for (const width of [390, 1280]) {
    const { ctx, page, calls } = await open({ width, mode: t.mode });
    await page.goto(base + t.path);
    const section = page.locator("section.game-zone-posts");
    await section.waitFor({ state: "visible" });
    assert.match(await section.innerText(), /From The Zone/i, `${t.sport}: heading`);
    assert.match(await section.innerText(), /2 posts published about this game/, `${t.sport}: count`);
    assert.equal(calls[0].p_sport, t.sport, `${t.sport}: reader asked for its own sport`);
    if (t.game) assert.equal(calls[0].p_game, t.game, `${t.sport}: reader asked for this game`);
    else assert.equal(calls[0].p_game, "g1", "nfl: reader asked for the stub's game id");
    const items = section.locator("ol > li > details");
    assert.equal(await items.count(), 2);
    assert.equal(await items.first().getAttribute("open"), "", "newest post is open");
    assert.equal(await items.first().locator(".zone-publication").count(), 1, `${t.sport}: publication renders as its card`);
    assert.equal(
      await items.first().getByRole("link", { name: /Open in The Zone/ }).getAttribute("href"),
      `/community?sport=${t.sport}&post=62fddd67-c335-4d23-a28f-f2a0c5c71166#post-62fddd67-c335-4d23-a28f-f2a0c5c71166`,
    );
    await items.nth(1).locator("summary").click();
    assert.match(await items.nth(1).innerText(), /Sample Receiver \(AAA\) vs BBB/, "plain posts show their text");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${t.sport} @${width}: no sideways scroll`);
    for (const h of await section.locator("summary, .game-zone-foot a").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height)))
      assert.ok(h >= 44, `${t.sport}: touch target ${Math.round(h)}px`);
    if (width === 390) {
      await items.nth(1).locator("summary").click();
      await section.evaluate((e) => scrollTo(0, e.getBoundingClientRect().top + scrollY - 150));
      await page.screenshot({ path: `${out}/${t.sport}-390.png` });
    }
    console.log(`ok   ${t.sport} matchup page shows its Zone posts @${width}`);
    await ctx.close();
  }

// Signed out: nothing is requested and nothing is shown.
{
  const { ctx, page, calls } = await open({ signedIn: false, mode: "nfl" });
  await page.goto(base + pages[0].path, { waitUntil: "networkidle" });
  assert.equal(await page.locator("section.game-zone-posts").count(), 0);
  assert.equal(calls.length, 0, "signed-out pages do not call the reader");
  console.log("ok   signed out: no Zone section, no request");
  await ctx.close();
}

// The Zone's NFL chip: from the all-sports Zone it must filter to NFL (it used to link to the page itself).
for (const width of [390, 1280]) {
  const { ctx, page } = await open({ width, mode: "nfl" });
  await page.goto(base + "/community");
  const chip = page.locator('nav.sport-switch a[data-sport="nfl"]');
  await chip.waitFor({ state: "visible" });
  assert.equal(await chip.getAttribute("href"), "/community?sport=nfl");
  assert.equal(await chip.getAttribute("aria-current"), null, "no sport is selected in the all-sports Zone");
  await chip.click();
  await page.waitForURL((u) => u.pathname === "/community" && u.searchParams.get("sport") === "nfl");
  await page.locator('nav.sport-switch a[data-sport="nfl"][aria-current="page"]').waitFor();
  console.log(`ok   Zone NFL chip filters to NFL @${width}`);
  await ctx.close();
}
await browser.close();
console.log("\nGame Zone posts checks passed.");

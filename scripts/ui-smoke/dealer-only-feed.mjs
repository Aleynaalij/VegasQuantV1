import assert from "node:assert/strict";
import fs from "node:fs";
import sharp from "sharp";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE,
  headless: true,
  args: ["--no-sandbox"],
});
const base = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const uid = "00000000-0000-4000-8000-000000000001",
  dealer = "00000000-0000-4000-8000-000000000002";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const version = fs
  .readFileSync("src/components/app-refresh-notice.tsx", "utf8")
  .match(/const VERSION = "([^"]+)"/)[1];
const makePost = (n, user = dealer) => ({
  id: id(n),
  user_id: user,
  author_name: user === dealer ? "TheDealer" : "SampleMember",
  sport: n % 2 === 0 ? "nba" : "nfl",
  kind: "talk",
  title: `Synthetic research ${n}`,
  body: "Synthetic research, not a real recommendation.",
  legs: [],
  card: null,
  created_at: new Date(Date.UTC(2026, 10, 9, 12, n)).toISOString(),
  stake: null,
  reactions: 0,
  reacted: false,
  following: false,
  comments: 0,
  photo_path: null,
});
const members = [makePost(99, uid)];
const dealerPosts = Array.from({ length: 24 }, (_, i) => makePost(30 - i));
dealerPosts[0].title = "Live pick update";
dealerPosts[1] = {
  ...dealerPosts[1],
  title: "WR matchups",
  sport: "nfl",
  card: "nfl-wr:2026-11-08:1",
};
dealerPosts[2] = {
  ...dealerPosts[2],
  title: "Defense vs position",
  sport: "nfl",
  card: "nfl-dvp:2026-11-08:1",
};
dealerPosts[3] = {
  ...dealerPosts[3],
  title: "NBA Matchup Cheat Sheet · New York Knicks @ Cleveland Cavaliers",
  sport: "nba",
  card: "vq-publication:v1",
  body: "https://www.espn.com/nba/game/_/gameId/123456789",
};
const sheet = dealerPosts[3];
const png = await sharp({
  create: { width: 1080, height: 1350, channels: 3, background: "#10241c" },
})
  .png()
  .toBuffer();
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1290"><rect width="1200" height="1290" fill="#08120f"/><text x="40" y="80" fill="#a3f4c4">Synthetic NBA chart</text></svg>';
try {
  for (const width of [390, 1280]) {
    const ctx = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
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
    let fail = false,
      delay = 0,
      dealerReads = 0,
      followingReads = 0;
    await ctx.route("**/rest/v1/rpc/community_feed", (r) => {
      if (r.request().postDataJSON().p_following) followingReads++;
      return r.fulfill({ json: members });
    });
    await ctx.route("**/rest/v1/rpc/community_dealer_feed", async (r) => {
      dealerReads++;
      const params = r.request().postDataJSON();
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      if (fail)
        return r.fulfill({
          status: 503,
          json: { message: "Synthetic outage" },
        });
      return r.fulfill({
        json: dealerPosts
          .filter((p) => params.p_sport === "all" || p.sport === params.p_sport)
          .slice(0, params.p_limit),
      });
    });
    await ctx.route("**/rest/v1/rpc/community_post", (r) =>
      r.fulfill({
        json:
          members.find((p) => p.id === r.request().postDataJSON().p_id) || null,
      }),
    );
    await ctx.route("**/rest/v1/ruby_cards**", (r) => r.fulfill({ json: [] }));
    await ctx.route("**/rest/v1/rpc/frank_anniversary", (r) =>
      r.fulfill({ json: { state: "hidden" } }),
    );
    await ctx.route("**/rest/v1/rpc/community_avatars", (r) =>
      r.fulfill({
        json: [
          { user_id: dealer, username: "TheDealer", avatar: null, staff: true },
          {
            user_id: uid,
            username: "SampleMember",
            avatar: null,
            staff: false,
          },
        ],
      }),
    );
    await ctx.route("**/api/nfl/weekly-card/**", (r) =>
      r.fulfill({ contentType: "image/png", body: png }),
    );
    await ctx.route(`**/api/nba/matchup-sheet/${sheet.id}`, (r) =>
      r.fulfill({
        json: {
          title: "New York Knicks at Cleveland Cavaliers",
          summary: "Synthetic only",
          sources: [],
          svg,
        },
      }),
    );
    const page = await ctx.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base + "/community", { waitUntil: "networkidle" });
    await page.locator(`#post-${members[0].id}`).waitFor();
    const tab = page.getByRole("tab", { name: "Dealer only", exact: true });
    assert.equal(
      await page.getByRole("tab", { name: "VIP lays", exact: true }).count(),
      0,
    );
    await tab.click();
    await page.locator(`#post-${dealerPosts[0].id}`).waitFor();
    assert.equal(await tab.getAttribute("aria-selected"), "true");
    assert.equal(await page.locator(`#post-${members[0].id}`).count(), 0);
    assert.equal(await page.locator(".zone-lay").count(), 0);
    assert.equal(await page.locator(".zone-post").count(), 20);
    for (const post of dealerPosts.slice(1, 3)) {
      const img = page.locator(`#post-${post.id} .zone-card img`);
      await img.scrollIntoViewIfNeeded();
      await img.evaluate((img) => img.decode());
    }
    const preview = page.locator(`#post-${sheet.id} .zone-sheet-preview`);
    await preview.scrollIntoViewIfNeeded();
    await preview.locator("img").waitFor();
    await preview.locator("img").evaluate((img) => img.decode());
    assert.equal(
      await page.locator(`#post-${sheet.id} .zone-publication`).count(),
      0,
    );
    await page
      .getByRole("button", { name: "Load more posts", exact: true })
      .click();
    await page.locator(`#post-${dealerPosts.at(-1).id}`).waitFor();
    assert.equal(await page.locator(".zone-post").count(), 24);
    const before = dealerReads;
    await tab.click();
    await page.waitForTimeout(350);
    assert.ok(
      dealerReads > before,
      "selected-tab repeat refreshes without blanking",
    );
    assert.equal(await page.locator(".zone-post").count(), 24);
    fail = true;
    await tab.click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Dealer posts could not refresh" })
      .waitFor();
    assert.equal(await page.locator(`#post-${members[0].id}`).count(), 0);
    assert.equal(
      await page
        .getByText("No Dealer posts for this sport yet.", { exact: true })
        .count(),
      0,
    );
    fail = false;
    await page.getByRole("button", { name: "Retry feed", exact: true }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Dealer posts could not refresh" })
      .waitFor({ state: "hidden" });
    await page
      .locator(".zone-sports button")
      .filter({ hasText: /^NFL$/ })
      .click();
    await page.waitForTimeout(500);
    assert.match(page.url(), /view=dealer/);
    assert.equal(await tab.getAttribute("aria-selected"), "true");
    assert.equal(await page.locator(`#post-${sheet.id}`).count(), 0);
    delay = 500;
    await tab.click();
    await page.getByRole("tab", { name: "For you", exact: true }).click();
    await page.locator(`#post-${members[0].id}`).waitFor();
    await page.waitForTimeout(700);
    assert.equal(await tab.getAttribute("aria-selected"), "false");
    assert.equal(await page.locator(`#post-${dealerPosts[0].id}`).count(), 0);
    delay = 0;
    await page.goto(base + "/community?view=vip", { waitUntil: "networkidle" });
    assert.equal(await tab.getAttribute("aria-selected"), "true");
    await page.locator(`#post-${dealerPosts[0].id}`).waitFor();
    await page.goto(base + `/community?view=dealer&post=${members[0].id}`, {
      waitUntil: "networkidle",
    });
    await page.locator(`#post-${members[0].id}`).waitFor();
    assert.equal(
      await tab.getAttribute("aria-selected"),
      "false",
      "exact post links override incompatible Dealer filter",
    );
    await page.goto(base + "/community?view=dealer", {
      waitUntil: "networkidle",
    });
    await page.locator(`#post-${dealerPosts[0].id}`).waitFor();
    const followingTab = page.getByRole("tab", {
      name: "Following",
      exact: true,
    });
    await followingTab.click();
    await page.locator(`#post-${members[0].id}`).waitFor();
    assert.equal(await followingTab.getAttribute("aria-selected"), "true");
    assert.equal(await tab.getAttribute("aria-selected"), "false");
    assert.ok(
      followingReads > 0,
      "Following uses the normal feed with its server-side follow filter",
    );
    assert.equal(await page.locator(`#post-${dealerPosts[0].id}`).count(), 0);
    await page.goBack({ waitUntil: "networkidle" });
    await page.locator(`#post-${dealerPosts[0].id}`).waitFor();
    assert.equal(await tab.getAttribute("aria-selected"), "true");
    assert.equal(await page.locator(`#post-${members[0].id}`).count(), 0);
    await page.goForward({ waitUntil: "networkidle" });
    await page.locator(`#post-${members[0].id}`).waitFor();
    assert.equal(await followingTab.getAttribute("aria-selected"), "true");
    await tab.click();
    await page.locator(`#post-${dealerPosts[0].id}`).waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    const out = process.env.UI_ARTIFACT_DIR || "artifacts/dealer-feed";
    fs.mkdirSync(out, { recursive: true });
    await page.screenshot({ path: `${out}/${width}-dealer-feed.png` });
    await page.evaluate(() =>
      new BroadcastChannel("sb-127-auth-token").postMessage({
        event: "SIGNED_OUT",
        session: null,
      }),
    );
    await page.locator(".zone-post").first().waitFor({ state: "hidden" });
    assert.deepEqual(errors, []);
    await ctx.close();
    console.log(
      `PASS ${width}px Dealer feed: originals inline, source-only NBA, plays, pagination, repeat tab, outage/retry, sport, stale response, legacy/deep links, Following, Back/Forward, sign out, overflow.`,
    );
  }
} finally {
  await browser.close();
}

// Synthetic accounts and slips only. Never writes to Supabase or sends notifications.
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
// Pages poll in the background, so "network idle" can take longer than a navigation. Navigate on
// load, then give requests a bounded chance to settle; each step still waits for its own content.
const settle = (page) =>
  page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
const go = async (page, url) => {
  await page.goto(url, { waitUntil: "load", timeout: 30000 });
  await settle(page);
};
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const base = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const { default: sharp } = await import("sharp");
// What storage serves back: a decodable JPEG, as the server stores every photo.
const storedSlip = await sharp({
  create: { width: 60, height: 120, channels: 3, background: "white" },
})
  .jpeg()
  .toBuffer();
const { readFile } = await import("node:fs/promises");
const refreshVersion = (
  await readFile(
    new URL("../../src/components/app-refresh-notice.tsx", import.meta.url),
    "utf8",
  )
).match(/const VERSION = "([^"]+)"/)[1];
for (const { width, photoOnly } of [
  { width: 390, photoOnly: true },
  { width: 1280, photoOnly: true },
  { width: 390, photoOnly: false },
  { width: 1280, photoOnly: false },
]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: base,
  });
  await ctx.addInitScript((refresh) => {
    sessionStorage.setItem("vq-prompt-shown", "fixture");
    // This member already acknowledged the app-refresh notice, which otherwise opens over the
    // composer after ~2 s while the large screenshot is being prepared.
    localStorage.setItem(
      "vq-app-refresh:00000000-0000-0000-0000-000000000001",
      refresh,
    );
    localStorage.setItem(
      "sb-127-auth-token",
      JSON.stringify({
        access_token: "smoke",
        refresh_token: "smoke",
        token_type: "bearer",
        expires_in: 86400,
        expires_at: Math.floor(Date.now() / 1000) + 86400,
        user: {
          id: "00000000-0000-0000-0000-000000000001",
          aud: "authenticated",
          role: "authenticated",
          app_metadata: {},
          user_metadata: { vq_welcome_version: 1 },
        },
      }),
    );
  }, refreshVersion);
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const day = "2026-10-23",
    uid = "00000000-0000-0000-0000-000000000001";
  const mine = {
    id: "00000000-0000-4000-8000-0000000000aa",
    user_id: uid, brand: "The GOAT", theme: "diamond", submission_day: day,
    sport: "NFL", title: "The GOAT’s daily lay",
    legs: photoOnly ? [] : ["Sample X 20+ points", "Sample Y 5+ rebounds"],
    note: "", photo_path: photoOnly ? `${uid}/fixture.jpg` : null,
    sportsbook: photoOnly ? null : "Sample Book",
    reported_odds: photoOnly ? null : 250,
    created_at: new Date().toISOString(),
  };
  let submits = 0, member = false, reviewing = false, reported = null;
  let adminView = false, hidden = null, analystActive = false, analystExpired = false;
  const analyst = () => ({
    id: "22222222-2222-4222-8222-222222222222",
    day,
    title: "Daily analyst fixture",
    candidates: ["Sample A", "Sample B", "Sample C"].map((name) => ({
      name,
      market: "Full game · 40+ receiving yards",
      copy_text: `${name} 40+ receiving yards`,
      selection_gate: {
        opportunity_case: "Supported targets and routes",
        failure_path: "Stalled drives",
        game_script_review: "Shared workload reviewed",
        role_source_url: "https://example.invalid/role",
        availability_source_url: "https://example.invalid/active",
        history_source_url: "https://example.invalid/logs",
      },
    })),
    sportsbook: "FanDuel",
    combined_odds: 238,
    source_url: "https://example.invalid/slip",
    observed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    expires_at: new Date(
      Date.now() + (analystExpired ? -60000 : 3600000),
    ).toISOString(),
    review: {
      correlation_review: "Target competition reviewed",
      failure_scenarios: "Shared offensive failure",
      market_context: "Exact fixture quote",
      material_unknowns: "Sample weather unknown",
      sources: [],
    },
  });
  const slips = [
    ["OmaticsZone", "orbit"],
    ["SoDegenerate", "diagonal"],
    ["FranksCorner", "corner"],
    ["HoustonMikesHub", "skyline"],
  ].map(([brand, theme], i) => ({
    id: `11111111-1111-4111-8111-11111111111${i}`,
    user_id: `u${i}`,
    brand,
    theme,
    submission_day: day,
    sport: "NFL",
    title: "Sample daily lay",
    legs: ["Sample A over 10.5 rushing yards", "Sample B 2+ receptions"],
    note: "Synthetic fixture, not a recommendation.",
    photo_path: null,
    sportsbook: "Sample Book",
    reported_odds: 250,
    created_at: new Date().toISOString(),
  }));
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (/\/rpc\/[^/]*kalshi/i.test(path)) {
      kalshiRequests.push(route.request().url());
      return route.fulfill({ status: 503, json: { code: "KALSHI_PAUSED" } });
    }
    let body;
    if (path.endsWith("/community_profiles")) {
      const profile = {
        user_id: uid,
        username: "OmaticsZone",
        avatar: "ruby",
        region: "Sample",
        visible: true,
      };
      body = (route.request().headers()["accept"] || "").includes(
        "vnd.pgrst.object",
      )
        ? profile
        : [profile];
    } else if (path.endsWith("/rpc/ruby_home"))
      body = {
        user_id: uid,
        day,
        contributor: member
          ? null
          : {
              user_id: uid,
              brand: "The GOAT",
              theme: "diamond",
              active: true,
            },
        submitted: mine?.id || null,
        submission_count: 1,
        due:
          reviewing && !reported
            ? [
                {
                  id: "00000000-0000-4000-8000-0000000000aa",
                  brand: "The GOAT",
                  title: "Yesterday’s lay",
                  revision: 0,
                  legs: ["Sample A ML", "Sample B ML"],
                  photo_path: null,
                },
              ]
            : [],
        admin: adminView,
      };
    else if (path.endsWith("/ruby_submissions") || path.endsWith("/ruby_cards")) {
      const id = new URL(route.request().url()).searchParams.get("id")?.replace(/^eq\./, "");
      body = id ? [mine, ...slips].find((card) => card.id === id) || null : [mine, ...slips];
    }
    else if (path.endsWith("/rpc/ruby_record_summary"))
      body = reviewing
        ? [
            {
              brand: "The GOAT",
              wins: reported === "WIN" ? 3 : 2,
              losses: 1,
              voids: 0,
              total: 5,
            },
          ]
        : [];
    else if (path.endsWith("/rpc/report_ruby")) {
      const r = route.request().postDataJSON();
      assert.equal(r.p_submission, "00000000-0000-4000-8000-0000000000aa");
      assert.equal(r.p_revision, 0);
      reported = r.p_outcome;
      body = "00000000-0000-4000-8000-0000000000ab";
    } else if (path.endsWith("/rpc/hide_ruby")) {
      hidden = route.request().postDataJSON();
      body = "00000000-0000-4000-8000-0000000000ac";
    } else if (path.endsWith("/ruby_daily_features"))
      body = analystActive
        ? [
            {
              day,
              submission_id: null,
              analyst_ticket_id: analyst().id,
              verified_odds: 238,
              sportsbook: "FanDuel",
              source_url: "https://example.invalid/slip",
              observed_at: new Date().toISOString(),
            },
          ]
        : [];
    else if (path.endsWith("/nfl_analyst_double_ups"))
      body = analystActive
        ? (route.request().headers()["accept"] || "").includes(
            "vnd.pgrst.object",
          )
          ? analyst()
          : [analyst()]
        : [];
    else if (path.endsWith("/rpc/submit_ruby")) {
      submits++;
      return route.fulfill({ status: 400, json: { message: "Contributor publishing retired" } });
    } else return route.continue();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  const kalshiRequests = [];
  await ctx.route(
    /https?:\/\/[^/]*kalshi\.com\/|\/api\/kalshi(?:[/?]|$)|\/rpc\/[^/?]*kalshi/i,
    (route) => {
      kalshiRequests.push(route.request().url());
      return route.fulfill({ status: 503, json: { code: "KALSHI_PAUSED" } });
    },
  );
  await page.route("**/storage/v1/object/sign/**", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            signedURL:
              "/object/sign/community-photos/fixture.jpg?token=fixture",
          }),
        })
      : route.fulfill({
          status: 200,
          contentType: "image/jpeg",
          body: storedSlip,
        }),
  );
  await go(page, base + "/nfl");
  assert.equal(await page.getByRole("link", { name: "Submit a Lay" }).count(), 0);
  await go(page, base + "/community?view=vip");
  assert.deepEqual(await page.locator(".zone-tabs [role=tab]").allInnerTexts(), ["For you", "Following", "Dealer only"]);
  assert.equal(await page.locator(".ruby-submit-drawer, .ruby-contributors").count(), 0);
  await go(page, base + "/community?view=vip&ruby=" + mine.id);
  const archived = page.locator(".ruby-card.ruby-diamond");
  await archived.waitFor();
  assert.equal(await page.locator(".ruby-submit-drawer, .ruby-contributors").count(), 0);
  if (photoOnly) await archived.locator(".community-photo img").waitFor();
  else assert.match(await archived.innerText(), /Contributor-reported combined odds/);
  assert.equal(submits, 0);
  // Every published lay opens with Gambly: typed legs copy as text, a screenshot-only lay
  // copies the screenshot itself as a PNG.
  await page
    .locator(".ruby-card.ruby-diamond .ruby-gambly")
    .getByRole("button", {
      name: photoOnly
        ? "Copy screenshot & open with Gambly ↗"
        : "Copy lay & open with Gambly ↗",
      exact: true,
    })
    .click();
  await page
    .getByRole("heading", { name: "Copy here. Paste in Gambly." })
    .waitFor();
  if (photoOnly) {
    await page
      .locator("dialog[open]")
      .getByLabel("I confirm I am 21 or older.")
      .check();
    await page
      .locator("dialog[open]")
      .getByRole("button", { name: "Copy screenshot to clipboard" })
      .click();
    await page
      .locator("dialog[open]")
      .getByText("YOUR SCREENSHOT IS COPIED")
      .waitFor();
    assert.deepEqual(
      await page.evaluate(async () =>
        (await navigator.clipboard.read()).flatMap((item) => item.types),
      ),
      ["image/png"],
    );
    await page
      .locator("dialog[open]")
      .getByRole("link", { name: "Open Gambly · Paste screenshot there ↗" })
      .waitFor();
  }
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: "Cancel" })
    .click();
  // Paused everywhere, including both typed and screenshot-only cards.
  assert.equal(await page.getByRole("button", { name: /Kalshi/i }).count(), 0);
  assert.equal(await page.locator('a[href*="kalshi.com"]').count(), 0);
  assert.deepEqual(kalshiRequests, [], "paused Kalshi made a request");
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
  );
  // The next day, Home asks about each earlier slip one at a time; results feed the standings.
  reviewing = true;
  await go(page, base + "/nfl"); // contributor pieces are on the NFL desk
  const prompt = page.getByRole("region", { name: "Confirm your slip result" });
  await prompt.getByRole("heading", { name: "Did this slip clear?" }).waitFor();
  assert.ok((await prompt.innerText()).includes("Yesterday’s lay"));
  const cleared = prompt.getByRole("button", { name: "Cleared", exact: true });
  assert.equal(await cleared.isDisabled(), true);
  await prompt
    .getByLabel("All legs have settled; I checked the ticket.")
    .check();
  await cleared.click();
  await page
    .getByRole("region", { name: "Confirm your slip result" })
    .waitFor({ state: "detached" });
  assert.equal(reported, "WIN");
  // The standings live only at the bottom of Home for contributors.
  await go(page, base + "/nfl"); // contributor pieces are on the NFL desk
  const board = page.locator(".ruby-board");
  await board.waitFor();
  assert.deepEqual(
    await board
      .locator("tbody tr")
      .first()
      .evaluate((row) => [...row.cells].map((c) => c.textContent.trim())),
    ["1", "The GOAT", "3", "1", "0", "1"],
  );
  reviewing = false;
  reported = null;
  // Older links still open the exact historical card, with moderation restricted to admins.
  const legacy = base + "/feed?view=contributors&ruby=" + slips[0].id;
  await go(page, legacy);
  await page.locator(".ruby-card.ruby-orbit").waitFor();
  assert.equal(await page.getByRole("button", { name: "Remove from The Zone" }).count(), 0);
  adminView = true;
  await go(page, legacy);
  const remove = page
    .locator(".ruby-card.ruby-orbit")
    .getByRole("button", { name: "Remove from The Zone" });
  await remove.click();
  await page
    .locator(".ruby-card.ruby-orbit")
    .getByText("Removed from The Zone. History and record retained.")
    .waitFor();
  assert.equal(hidden.p_hidden, true);
  // Double Up is retired: admins get no way to feature a card as one.
  assert.equal(await page.getByText("Feature as Double Up").count(), 0);
  assert.equal(await page.getByText(/DOUBLE UP/).count(), 0);
  adminView = false;
  member = true;
  await go(page, base + "/feed");
  await page.getByRole("heading", { name: "The Zone", exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/community");
  assert.deepEqual(await page.locator(".zone-tabs [role=tab]").allInnerTexts(), ["For you", "Following", "Dealer only"]);
  assert.equal(await page.locator(".ruby-contributors, .ruby-submit-drawer").count(), 0);
  // Neither Zone tab exposes Double Up or the contributor-only leaderboard.
  analystActive = true;
  member = true;
  for (const path of [
    "/community",
    "/community?view=vip",
    "/feed?double_up=" + analyst().id,
  ]) {
    await go(page, base + path);
    assert.equal(
      await page
        .locator(".ruby-double-up, .analyst-double-up, .ruby-board")
        .count(),
      0,
    );
  }
  await go(page, base + "/nfl"); // contributor pieces are on the NFL desk
  assert.equal(await page.locator(".ruby-board").count(), 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(kalshiRequests, [], "paused Kalshi made a request");
  console.log(
    `PASS retired VIP section, historical card access, copy, results and moderation @${width} photoOnly=${photoOnly}`,
  );
  await ctx.close();
}
await browser.close();

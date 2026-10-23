// Synthetic accounts and slips only. Never writes to Supabase or sends notifications.
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const base = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
for (const width of [390, 1280]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("vq-prompt-shown", "fixture");
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
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const day = "2026-10-23",
    uid = "00000000-0000-0000-0000-000000000001";
  let mine = null,
    submits = 0;
  const slips = [
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
        contributor: {
          user_id: uid,
          brand: "OmaticsZone",
          theme: "orbit",
          active: true,
        },
        submitted: mine?.id || null,
        admin: false,
      };
    else if (path.endsWith("/ruby_submissions"))
      body = mine ? [mine, ...slips] : slips;
    else if (path.endsWith("/ruby_daily_features")) body = [];
    else if (path.endsWith("/rpc/submit_ruby")) {
      const p = route.request().postDataJSON();
      assert.equal(p.p_sport, "NBA");
      assert.deepEqual(p.p_legs, [
        "Sample X 20+ points",
        "Sample Y 5+ rebounds",
      ]);
      submits++;
      mine = {
        id: p.p_id,
        user_id: uid,
        brand: "OmaticsZone",
        theme: "orbit",
        submission_day: day,
        sport: p.p_sport,
        title: p.p_title,
        legs: p.p_legs,
        note: p.p_note,
        photo_path: null,
        sportsbook: p.p_book,
        reported_odds: p.p_odds,
        created_at: new Date().toISOString(),
      };
      body = p.p_id;
    } else return route.continue();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Submit today’s lay" }).click();
  await page.getByLabel("Sport", { exact: true }).selectOption("NBA");
  await page.getByLabel("Card title").fill("Sample Ruby drop");
  await page
    .getByLabel("Your legs")
    .fill("Sample X 20+ points\nSample Y 5+ rebounds");
  await page.getByLabel("Sportsbook · optional").fill("Sample Book");
  await page.getByLabel("Combined odds · optional").fill("+250");
  await page.getByText("Preview your Ruby card", { exact: true }).click();
  assert.ok(await page.locator(".ruby-modal .ruby-orbit").count());
  await page
    .getByRole("button", { name: "Publish to The Zone", exact: true })
    .click();
  await page.getByRole("link", { name: "View your lay" }).waitFor();
  assert.equal(submits, 1);
  assert.equal(
    await page.getByRole("button", { name: "Submit today’s lay" }).count(),
    0,
  );
  await page.getByRole("link", { name: "View your lay" }).click();
  await page.locator(".ruby-card.ruby-orbit").waitFor();
  for (const theme of ["orbit", "diagonal", "corner", "skyline"])
    assert.equal(await page.locator(`.ruby-card.ruby-${theme}`).count(), 1);
  assert.ok(
    (await page.locator(".ruby-card.ruby-orbit").innerText()).includes(
      "Contributor-reported combined odds",
    ),
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    `PASS Ruby composer, preview, NBA member submission, daily lock, four templates and Zone link @${width}`,
  );
  await ctx.close();
}
await browser.close();

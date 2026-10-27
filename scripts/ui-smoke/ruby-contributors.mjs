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
const reloadSettled = async (page) => {
  await page.reload({ waitUntil: "load", timeout: 30000 });
  await settle(page);
};
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const base = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
// Noise keeps the PNG over 10 MB, larger than the platform's 4.5 MB request body limit.
const { default: sharp } = await import("sharp");
const phoneScreenshot = await sharp(
  Uint8Array.from({ length: 1320 * 2868 * 3 }, () => (Math.random() * 256) | 0),
  { raw: { width: 1320, height: 2868, channels: 3 } },
)
  .png({ compressionLevel: 1 })
  .toBuffer();
assert.ok(phoneScreenshot.length > 5_000_000);
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
  let mine = null,
    submits = 0,
    member = false,
    full = false,
    reviewing = false,
    reported = null,
    adminView = false,
    hidden = null,
    analystActive = false,
    analystExpired = false;
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
        submission_count: full ? 3 : mine ? 1 : 0,
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
    else if (path.endsWith("/ruby_submissions") || path.endsWith("/ruby_cards"))
      body = mine ? [mine, ...slips] : slips;
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
      const p = route.request().postDataJSON();
      if (photoOnly) {
        assert.equal(p.p_title, "The GOAT’s daily lay");
        assert.equal(p.p_sport, "NFL");
        assert.deepEqual(p.p_legs, []);
        assert.equal(p.p_note, "");
        assert.equal(p.p_book, null);
        assert.equal(p.p_odds, null);
        assert.equal(p.p_photo, `${uid}/${p.p_id}.jpg`);
      } else {
        assert.equal(p.p_sport, "NBA");
        assert.deepEqual(p.p_legs, [
          "Sample X 20+ points",
          "Sample Y 5+ rebounds",
        ]);
      }
      submits++;
      mine = {
        id: p.p_id,
        user_id: uid,
        brand: "The GOAT",
        theme: "diamond",
        submission_day: day,
        sport: p.p_sport,
        title: p.p_title,
        legs: p.p_legs,
        note: p.p_note,
        photo_path: p.p_photo,
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
  let uploadedPhoto = null;
  let kalshiTexts = null;
  await page.route("**/api/kalshi", (route) => {
    const body = route.request().postDataJSON();
    kalshiTexts = body.texts;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        results: [],
        text_results: body.texts.map((t, i) => ({
          key: `text:${i}`,
          label: t,
          url: null,
          status: "NO_MATCH",
        })),
      }),
    });
  });
  await page.route("**/api/community/photo?post=*", (route) => {
    uploadedPhoto = route.request().postDataBuffer();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        path: `${uid}/${new URL(route.request().url()).searchParams.get("post")}.jpg`,
      }),
    });
  });
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
  await go(page, base + "/");
  const submissionDrawer = page.locator(".ruby-submit-drawer");
  await submissionDrawer.waitFor();
  assert.equal(await submissionDrawer.getAttribute("open"), null);
  assert.equal(
    await page
      .locator(".ruby-submit-content")
      .getByRole("button", { name: "Submit today’s lay" })
      .count(),
    0,
  );
  await submissionDrawer.locator("summary").click();
  await page
    .locator(".ruby-submit-content")
    .getByRole("button", { name: "Submit today’s lay" })
    .click();
  if (photoOnly) {
    assert.equal(
      await page
        .locator(
          ".ruby-modal input[required],.ruby-modal textarea[required],.ruby-modal select[required]",
        )
        .count(),
      0,
    );
    if (width < 760) {
      // Phone: copy the slip image elsewhere, then tap Paste screenshot.
      await page.evaluate(async (b64) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        await navigator.clipboard.write([
          new ClipboardItem({
            "image/png": new Blob([bytes], { type: "image/png" }),
          }),
        ]);
      }, phoneScreenshot.toString("base64"));
      await page.getByRole("button", { name: "Paste screenshot" }).click();
      await page.getByAltText("Your original screenshot preview").waitFor();
      await page.getByRole("button", { name: "Remove screenshot" }).click();
      // Press-and-hold Paste (or Ctrl/Cmd+V) anywhere in the composer works too.
      await page.evaluate((b64) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const data = new DataTransfer();
        data.items.add(new File([bytes], "slip.png", { type: "image/png" }));
        document.querySelector(".ruby-modal form").dispatchEvent(
          new ClipboardEvent("paste", {
            clipboardData: data,
            bubbles: true,
            cancelable: true,
          }),
        );
      }, phoneScreenshot.toString("base64"));
    } else
      await page.locator(".ruby-modal input[type=file]").setInputFiles({
        name: "slip.png",
        mimeType: "image/png",
        buffer: phoneScreenshot,
      });
    await page.getByAltText("Your original screenshot preview").waitFor();
  } else {
    await page.getByText("Add details · optional", { exact: true }).click();
    await page.getByLabel("Sport", { exact: true }).selectOption("NBA");
    await page.getByLabel("Card title").fill("Sample Ruby drop");
    await page
      .getByLabel("Your legs")
      .fill("Sample X 20+ points\nSample Y 5+ rebounds");
    await page.getByLabel("Sportsbook · optional").fill("Sample Book");
    await page.getByLabel("Combined odds · optional").fill("+250");
    await page.getByText("Preview your card", { exact: true }).click();
    assert.ok(await page.locator(".ruby-modal .ruby-diamond").count());
    assert.equal(await page.locator(".ruby-modal .ruby-gambly").count(), 0);
  }
  await page
    .getByRole("button", { name: "Publish to The Zone", exact: true })
    .click();
  await page.getByRole("link", { name: "View your lay" }).waitFor();
  assert.equal(submits, 1);
  if (photoOnly) {
    // A full-screen phone screenshot is shrunk in the browser below the 4.5 MB platform limit.
    assert.ok(uploadedPhoto && uploadedPhoto.length < 4_400_000);
    assert.ok(uploadedPhoto.includes(Buffer.from("image/jpeg")));
  }
  assert.equal(
    await page
      .locator(".ruby-submit-content")
      .getByRole("button", { name: "Submit today’s lay" })
      .count(),
    1,
  );
  // After the third slip of the day, "View your lay" becomes the gold button; it keeps its dark
  // label under the dark theme's link color.
  full = true;
  await reloadSettled(page);
  await page.locator(".ruby-submit-drawer > summary").click();
  const viewLay = page.locator("a.ruby-primary", { hasText: "View your lay" });
  await viewLay.waitFor();
  assert.equal(
    await viewLay.evaluate((a) => getComputedStyle(a).color),
    "rgb(32, 25, 13)",
  );
  assert.equal(
    await page
      .locator(".ruby-submit-content")
      .getByRole("button", { name: "Submit today’s lay" })
      .count(),
    0,
  );
  full = false;
  await viewLay.click();
  await page.locator(".ruby-card.ruby-diamond").waitFor();
  for (const theme of ["diamond", "orbit", "diagonal", "corner", "skyline"])
    assert.equal(await page.locator(`.ruby-card.ruby-${theme}`).count(), 1);
  if (photoOnly) {
    assert.ok(
      (await page.locator(".ruby-card.ruby-diamond").innerText()).includes(
        "The GOAT’s daily lay",
      ),
    );
    await page
      .locator(".ruby-card.ruby-diamond .community-photo img")
      .waitFor();
  } else {
    assert.ok(
      (await page.locator(".ruby-card.ruby-diamond").innerText()).includes(
        "Contributor-reported combined odds",
      ),
    );
  }
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
  // Kalshi is offered beside Gambly: typed legs are checked for an exact market; a
  // screenshot-only lay (or no exact match) can still browse Kalshi.
  await page
    .locator(".ruby-card.ruby-diamond .ruby-gambly")
    .getByRole("button", { name: "Kalshi ↗", exact: true })
    .click();
  const kalshi = page.locator("dialog[open]");
  await kalshi
    .getByRole("heading", { name: "Open selections on Kalshi" })
    .waitFor();
  await kalshi
    .getByText(
      photoOnly ? "No typed legs to match." : "No exact Kalshi market",
      {
        exact: false,
      },
    )
    .waitFor();
  if (photoOnly) assert.equal(kalshiTexts, null);
  else {
    assert.deepEqual(kalshiTexts, [
      "Sample X 20+ points",
      "Sample Y 5+ rebounds",
    ]);
    // Kalshi can't take a ticket, so the typed legs are copied for its search.
    await kalshi.getByText("Your legs are copied.", { exact: false }).waitFor();
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      "Sample X 20+ points\nSample Y 5+ rebounds",
    );
  }
  await kalshi.getByLabel(/I am 21\+/).check();
  await kalshi.getByRole("link", { name: "Browse Kalshi ↗" }).waitFor();
  await kalshi.getByRole("button", { name: "Close" }).click();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
  );
  // The next day, Home asks about each earlier slip one at a time; results feed the standings.
  reviewing = true;
  await go(page, base + "/");
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
  await go(page, base + "/");
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
  // Only an admin sees "Remove from The Zone"; it records a hide for that card.
  await go(page, base + "/feed?view=contributors");
  await page.locator(".ruby-contributors").waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Remove from The Zone" }).count(),
    0,
  );
  adminView = true;
  await reloadSettled(page);
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
  // Latest contains posts; contributor cards live only on VIP Lays.
  await go(page, base + "/feed");
  assert.equal(await page.locator(".ruby-contributors").count(), 0);
  member = true;
  reviewing = true;
  reported = "WIN";
  await go(page, base + "/feed");
  await page.getByRole("heading", { name: "The Zone", exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/community");
  assert.deepEqual(await page.locator(".zone-views a").allInnerTexts(), [
    "Latest",
    "VIP Lays",
    "Injuries",
  ]);
  await page
    .locator(".zone-views")
    .getByRole("link", { name: "VIP Lays" })
    .click();
  await page.locator(".ruby-contributors").waitFor();
  // Members don't see the board or records on the row; opening a capper shows their rank.
  await settle(page);
  assert.equal(await page.locator(".ruby-board").count(), 0);
  assert.equal(await page.locator(".ruby-person-record").count(), 0);
  await page
    .locator(".ruby-people")
    .getByRole("button", { name: /The GOAT/ })
    .click();
  const record = page.locator(".ruby-profile-record");
  await record.waitFor();
  assert.match(await record.textContent(), /The GOAT3–1/);
  assert.equal(await record.locator(".ruby-profile-rank").count(), 0);
  member = false;
  reviewing = false;
  reported = null;
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
  await go(page, base + "/");
  assert.equal(await page.locator(".ruby-board").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    `PASS Ruby composer, preview, NBA member submission, daily lock, five templates and Zone link @${width} photoOnly=${photoOnly}`,
  );
  await ctx.close();
}
await browser.close();

// Run with the UI smoke stub and app on port 3100, as scripts/ui-smoke/check.mjs.
const playwrightModule = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const pw = playwrightModule.default || playwrightModule;
import assert from "node:assert/strict";
const browser = await pw.chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
});
const uid = "00000000-0000-4000-8000-000000000001",
  post = "00000000-0000-4000-8000-000000000004",
  comment = "00000000-0000-4000-8000-000000000005";
for (const width of [390, 1280]) {
  const ctx = await browser.newContext({ viewport: { width, height: 950 } });
  await ctx.addInitScript((uid) => {
    localStorage.setItem(
      "sb-127-auth-token",
      JSON.stringify({
        access_token: "smoke",
        token_type: "bearer",
        expires_in: 86400,
        expires_at: Math.floor(Date.now() / 1000) + 86400,
        refresh_token: "smoke",
        user: {
          id: uid,
          aud: "authenticated",
          role: "authenticated",
          email: "fixture@example.com",
          app_metadata: {},
          user_metadata: {},
          created_at: "2026-10-01T00:00:00Z",
        },
      }),
    );
  }, uid);
  let rows = [
    {
      id: "00000000-0000-4000-8000-000000000006",
      recipient_id: uid,
      actor_id: "actor",
      actor_name: "Sarah",
      actor_avatar: null,
      type: "comment",
      content_id: comment,
      message: "commented on your post: This is awesome!",
      priority: "high",
      deep_link: `/community?sport=nfl&post=${post}&comment=${comment}#comment-${comment}`,
      event_count: 1,
      actor_names: ["Sarah"],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      read_at: null,
      viewed_at: null,
    },
    {
      id: "00000000-0000-4000-8000-000000000007",
      recipient_id: uid,
      actor_id: "actor",
      actor_name: "John",
      actor_avatar: null,
      type: "like",
      message: "liked your post.",
      priority: "medium",
      deep_link: `/community?post=${post}`,
      event_count: 29,
      actor_names: ["John", "Sarah"],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      read_at: null,
      viewed_at: null,
    },
  ];
  let prefs = {
    user_id: uid,
    disabled_types: [],
    push_enabled: false,
    email_enabled: false,
    sound_enabled: false,
    haptics_enabled: false,
    batch_minutes: 5,
    timezone: "America/New_York",
    quiet_enabled: false,
    quiet_start: 22,
    quiet_end: 8,
  };
  await ctx.route("**/rest/v1/community_profiles*", (r) =>
    r.fulfill({
      json: {
        username: "FixtureUser",
        avatar: "data:image/jpeg;base64,/9j/2Q==",
        region: "Sample",
        visible: true,
      },
    }),
  );
  await ctx.route("**/rest/v1/notification_preferences*", (r) => {
    if (r.request().method() === "POST") {
      prefs = r.request().postDataJSON();
      return r.fulfill({ status: 201, json: null });
    }
    return r.fulfill({ json: prefs });
  });
  await ctx.route("**/rest/v1/rpc/notification_counts", (r) =>
    r.fulfill({
      json: {
        unread: rows.filter((n) => !n.read_at).length,
        unviewed: rows.filter((n) => !n.viewed_at).length,
        messages: 0,
      },
    }),
  );
  await ctx.route("**/rest/v1/rpc/notification_inbox", (r) => {
    const p = r.request().postDataJSON();
    return r.fulfill({
      json: {
        items: rows.filter(
          (n) =>
            (!p.p_type || n.type === p.p_type) &&
            (!p.p_unread || !n.read_at) &&
            (!p.p_search ||
              (n.actor_name + " " + n.message)
                .toLowerCase()
                .includes(p.p_search.toLowerCase())),
        ),
        snapshot_at: new Date().toISOString(),
      },
    });
  });
  await ctx.route("**/rest/v1/rpc/notification_action", (r) => {
    const p = r.request().postDataJSON();
    if (p.p_action === "delete") rows = rows.filter((n) => n.id !== p.p_id);
    else
      for (const n of rows) {
        if (!p.p_id || n.id === p.p_id)
          n.read_at = p.p_action === "unread" ? null : new Date().toISOString();
      }
    return r.fulfill({ json: null });
  });
  await ctx.route("**/rest/v1/rpc/notification_view", (r) =>
    r.fulfill({ json: null }),
  );
  await ctx.route("**/rest/v1/rpc/notification_sync_updates", (r) =>
    r.fulfill({ json: null }),
  );
  await ctx.route("**/rest/v1/rpc/notification_pulse", (r) =>
    r.fulfill({ json: null }),
  );
  await ctx.route("**/rest/v1/rpc/community_activity", (r) =>
    r.fulfill({ json: [] }),
  );
  await ctx.route("**/api/notifications/channels", (r) =>
    r.fulfill({ json: { email: false, sms: false } }),
  );
  await ctx.route("**/rest/v1/rpc/community_post", (r) =>
    r.fulfill({
      json: {
        id: post,
        user_id: uid,
        author_name: "FixtureUser",
        title: "Community post",
        body: "A linked post",
        sport: "nfl",
        kind: "talk",
        legs: [],
        stake: null,
        created_at: new Date().toISOString(),
        reactions: 0,
        comments: 1,
        following: false,
        photo_path: null,
      },
    }),
  );
  await ctx.route("**/rest/v1/rpc/community_comments", (r) =>
    r.fulfill({
      json: [
        {
          id: comment,
          user_id: "actor",
          author_name: "Sarah",
          body: "This is awesome!",
          created_at: new Date().toISOString(),
          parent_id: null,
          reactions: 0,
          reacted: false,
        },
      ],
    }),
  );
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:3100/notifications", {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(1000);
  await page.evaluate(() =>
    document.querySelectorAll("dialog[open]").forEach((d) => d.close()),
  );
  await page.addStyleTag({ content: "nextjs-portal {display:none!important}" });
  await page
    .getByText("John, Sarah and 27 others liked your post.", { exact: true })
    .waitFor();
  assert.ok(
    (await page
      .getByRole("link", { name: "Notifications · 2 unread", exact: true })
      .count()) > 0,
  );
  await page
    .getByRole("searchbox", { name: "Search notifications" })
    .fill("Sarah");
  await page
    .getByText("Sarah commented on your post: This is awesome!", {
      exact: true,
    })
    .waitFor();
  await page.waitForFunction(
    () => document.querySelectorAll(".notification-item").length === 1,
  );
  await page.getByRole("searchbox", { name: "Search notifications" }).fill("");
  await page
    .getByText("John, Sarah and 27 others liked your post.", { exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Mark all read", exact: true })
    .click();
  await page.waitForTimeout(200);
  assert.ok(rows.every((n) => n.read_at));
  await page
    .locator(".notification-item")
    .first()
    .getByRole("button", { name: "Mark unread", exact: true })
    .click();
  await page.waitForTimeout(200);
  assert.equal(rows[0].read_at, null);
  await page.locator(".notification-settings summary").first().click();
  await page.getByRole("checkbox", { name: "Likes", exact: true }).uncheck();
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await page
    .getByText("Notification preferences saved.", { exact: true })
    .waitFor();
  assert.ok(prefs.disabled_types.includes("like"));
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({ path: `/tmp/vq-notifications-${width}.png` });
  await page.locator(".notification-main").first().click();
  await page.waitForURL("**/community?**");
  await page.locator(`#comment-${comment}`).waitFor();
  assert.equal(
    await page
      .locator(`#comment-${comment}`)
      .getByText("This is awesome!", { exact: true })
      .count(),
    1,
  );
  assert.equal(errors.length, 0, errors.join("\n"));
  await ctx.close();
}
await browser.close();
console.log(
  "PASS mobile/desktop inbox, badges, search, read/unread, preferences and exact comment deep links.",
);

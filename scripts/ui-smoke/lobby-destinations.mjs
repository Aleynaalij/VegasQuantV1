// Synthetic browser-only writes; no production accounts, access changes, posts or wagers.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const base = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const out = process.env.UI_ARTIFACT_DIR || "artifacts/lobby-destinations";
await mkdir(out, { recursive: true });
const a = "00000000-0000-4000-8000-000000000001",
  b = "00000000-0000-4000-8000-000000000002";
function token(id) {
  return {
    access_token: "synthetic",
    refresh_token: "synthetic",
    token_type: "bearer",
    expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400,
    user: {
      id,
      aud: "authenticated",
      role: "authenticated",
      app_metadata: {},
      user_metadata: { vq_welcome_version: 1 },
    },
  };
}

async function verifyCombinedRoutes() {
  for (const width of [360, 390, 1280]) {
    const ctx = await browser.newContext({
      viewport: { width, height: 844 },
      reducedMotion: "reduce",
    });
    let privateRequests = [];
    await ctx.route("**/rest/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (
        /\/(community_feed|community_stories|member_parlays|published_leg_catalog)$/.test(
          path,
        )
      )
        privateRequests.push(path);
      let data = [];
      if (path.endsWith("membership_status"))
        data = { allowed: false, admin: false };
      if (path.endsWith("community_story_clock"))
        data = { server_now: new Date().toISOString() };
      await route.fulfill({ json: data });
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(base + "/");
    const heading = page.getByRole("heading", {
      name: "Every game. One clear read.",
      exact: true,
    });
    await heading.waitFor();
    await page.locator(".vq-brand-opening").waitFor({ state: "hidden" });
    assert.equal(
      await page.locator('.sport-switch [aria-current="page"]').count(),
      0,
      "neutral lobby must not select NFL",
    );
    assert.equal(
      privateRequests.length,
      0,
      "signed-out lobby must not fetch private member content",
    );
    assert.equal(await page.locator(".leg-model").count(), 0);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "lobby must not overflow",
    );
    await page.screenshot({ path: `${out}/${width}-neutral-lobby.png` });
    for (const sport of ["nfl", "nba", "nhl", "ncaab"]) {
      await page.locator(`.sport-switch a[data-sport="${sport}"]`).click();
      await page.waitForURL(new RegExp("/" + sport + "(?:[?#]|$)"));
      await page
        .locator(`.sport-switch a[data-sport="${sport}"][aria-current="page"]`)
        .waitFor();
      await page.locator('a[href="/"]:visible').first().click();
      await heading.waitFor();
      assert.equal(
        await page.locator('.sport-switch [aria-current="page"]').count(),
        0,
      );
    }
    const response = await ctx.request.get(
      base + "/?game=sample-sea-den-2026-10-15&tag=a&tag=b&saved=sample-id",
      { maxRedirects: 0 },
    );
    assert.equal(
      response.status(),
      308,
      "legacy game link must use a real permanent redirect",
    );
    const target = new URL(response.headers().location, base);
    assert.equal(target.pathname, "/nfl");
    assert.deepEqual(target.searchParams.getAll("tag"), ["a", "b"]);
    assert.equal(target.searchParams.get("saved"), "sample-id");
    assert.equal(target.hash, "#home-games");
    await page.goto(
      base + "/?game=sample-sea-den-2026-10-15&tag=a&tag=b#home-games",
    );
    await page.waitForURL(/\/nfl\?.*game=sample-sea-den-2026-10-15/);
    assert.deepEqual(new URL(page.url()).searchParams.getAll("tag"), [
      "a",
      "b",
    ]);
    // Loading a hash-only bookmark must preserve its non-game query identity.
    await page.goto(base + "/?tag=a&tag=b#home-games");
    await page.waitForURL(/\/nfl\?.*tag=a.*#home-games/);
    assert.deepEqual(
      new URL(page.url()).searchParams.getAll("tag"),
      ["a", "b"],
      "legacy hash redirect must preserve query identity",
    );
    // Hash-only changes in an already-mounted lobby must work, including browser history.
    await page.goto(base + "/?from=existing");
    await heading.waitFor();
    await page.evaluate(() => {
      window.location.hash = "home-games";
    });
    await page.waitForURL(/\/nfl\?from=existing#home-games/);
    await page.goBack();
    await heading.waitFor();
    assert.equal(
      new URL(page.url()).pathname,
      "/",
      "Back from a replaced hash destination must not loop",
    );
    await page.goForward();
    await page.waitForURL(/\/nfl\?from=existing#home-games/);
    await page.goto(base + "/community?build=1");
    await page.waitForURL(/\/parlays/);
    await page.getByText(/Sign in to build a lay/).waitFor();
    await page.goto(
      base + "/community?saved=11111111-1111-4111-8111-111111111111",
    );
    await page.waitForURL(/\/parlays\?saved=11111111/);
    await page.goto(
      base + "/feed?view=latest&release=sample-release#release-sample-release",
    );
    assert.equal(
      new URL(page.url()).searchParams.get("release"),
      "sample-release",
    );
    assert.equal(new URL(page.url()).hash, "#release-sample-release");
    await page
      .getByRole("heading", { name: "Published research", exact: true })
      .waitFor();
    console.log(
      `PASS combined neutral/sport/legacy query+hash/history/private entry at ${width}px`,
    );
    await ctx.close();
  }
}

try {
  for (const width of [360, 390, 1280]) {
    const ctx = await browser.newContext({
      viewport: { width, height: 844 },
      reducedMotion: "reduce",
    });
    const now = new Date().toISOString(),
      expires = new Date(Date.now() + 86400000).toISOString();
    const legs = Array.from({ length: 3 }, (_, i) => ({
      leg_key: `fixture:${i}`,
      name: `Sample Player ${i}`,
      market: "Full game · 20+ rushing yards",
      matchup: `Sample Away ${i} @ Sample Home ${i}`,
      game_id: `game-${i}`,
      kind: "RESEARCH",
      odds: -200,
      quote: "Sample -200",
      quote_observed_at: now,
      published_at: now,
      expires_at: expires,
      result: null,
      why: "Sample role",
      risk: "Sample uncertainty",
    }));
    let allowed = true,
      catalogFails = false,
      accessFails = false,
      catalogCalls = 0,
      savedCalls = 0,
      creates = 0,
      shares = 0,
      currentOwner = null,
      inboxMode = "ok",
      excludeSavedFromList = false,
      mine = [];
    await ctx.addInitScript(
      ({ a, b }) => {
        sessionStorage.setItem("vq-prompt-shown", "fixture");
        for (const id of [a, b]) {
          localStorage.setItem(`vq-app-refresh:${id}`, "gold-2026-10-22-v2");
          localStorage.setItem(
            `vq-push-prompt:${id}`,
            String(Date.now() + 7 * 86400000),
          );
        }
      },
      { a, b },
    );
    await ctx.route("**/rest/v1/**", async (route) => {
      const req = route.request(),
        u = new URL(req.url()),
        path = u.pathname;
      let data = [];
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204 });
      if (path.endsWith("membership_status")) {
        if (accessFails)
          return route.fulfill({
            status: 503,
            json: { message: "Synthetic access failure" },
          });
        data = { allowed, admin: false, member_code: "SAMPLE" };
      }
      if (path.endsWith("age_verification_status"))
        data = { required: true, verified: true };
      if (path.endsWith("community_profiles"))
        data = [
          {
            user_id: a,
            username: "FixtureMember",
            avatar: "ruby",
            visible: true,
          },
        ];
      if (path.endsWith("notification_inbox"))
        data =
          inboxMode === "null"
            ? null
            : inboxMode === "malformed"
              ? { items: "invalid", snapshot_at: now }
              : { items: [], snapshot_at: now };
      if (path.endsWith("published_leg_catalog")) {
        catalogCalls++;
        if (catalogFails)
          return route.fulfill({
            status: 503,
            json: { message: "Synthetic catalog failure" },
          });
        data = legs;
      }
      if (path.endsWith("member_parlays")) {
        savedCalls++;
        const own = currentOwner === a ? mine : [];
        data = u.searchParams.has("id")
          ? own.find((p) => `eq.${p.id}` === u.searchParams.get("id")) || null
          : excludeSavedFromList
            ? []
            : own;
      }
      if (path.endsWith("leg_history"))
        data = legs.map((l) => ({
          leg_key: l.leg_key,
          cleared: 5,
          sample: 5,
          median: 80,
          position: "RB",
        }));
      if (path.endsWith("leg_market_prices"))
        data = legs.map((l) => ({
          leg_key: l.leg_key,
          first_price: -200,
          last_price: -200,
        }));
      if (path.endsWith("create_member_parlay")) {
        creates++;
        const body = req.postDataJSON();
        assert.equal(body.p_leg_keys.length, 2);
        const existing = mine.find(
          (p) =>
            p.legs
              .map((l) => l.leg_key)
              .sort()
              .join() === [...body.p_leg_keys].sort().join(),
        );
        if (existing) data = existing.id;
        else {
          const saved = {
            id: "11111111-1111-4111-8111-111111111111",
            title: body.p_title,
            legs: legs.filter((l) => body.p_leg_keys.includes(l.leg_key)),
            created_at: now,
            expires_at: expires,
          };
          mine = [saved];
          data = saved.id;
        }
      }
      if (path.endsWith("share_member_parlay")) {
        shares++;
        data = "sample-post";
      }
      return route.fulfill({ json: data });
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    const workshop = page.locator(".parlay-workshop");
    await page.goto(base + "/parlays?build=1");
    await workshop.getByText(/Sign in to build a lay/).waitFor();
    assert.equal(
      catalogCalls,
      0,
      "signed-out entry must not request protected catalog",
    );
    assert.equal(savedCalls, 0, "signed-out entry must not request saved lays");
    await page.locator(".vq-brand-opening").waitFor({ state: "hidden" });
    await page.screenshot({ path: `${out}/${width}-signed-out.png` });
    async function auth(id, event = "SIGNED_IN") {
      currentOwner = id;
      await page.evaluate(
        ({ session, event }) => {
          if (session)
            localStorage.setItem("sb-127-auth-token", JSON.stringify(session));
          else localStorage.removeItem("sb-127-auth-token");
          const ch = new BroadcastChannel("sb-127-auth-token");
          ch.postMessage({ event, session });
          ch.close();
        },
        { session: id ? token(id) : null, event },
      );
    }
    allowed = false;
    await auth(a);
    await workshop
      .getByText(/does not currently have research access/)
      .waitFor();
    assert.equal(catalogCalls, 0);
    allowed = true;
    accessFails = true;
    await page.reload();
    await workshop.getByText(/access could not be checked/).waitFor();
    assert.equal(catalogCalls, 0);
    accessFails = false;
    catalogFails = true;
    await workshop
      .getByRole("button", { name: "Retry library", exact: true })
      .click();
    await workshop.getByText(/library or saved lays could not load/).waitFor();
    assert.doesNotMatch(await workshop.innerText(), /Sign in and try again/);
    catalogFails = false;
    await workshop
      .getByRole("button", { name: "Retry library", exact: true })
      .click();
    await workshop
      .getByRole("region", { name: "Your lay draft", exact: true })
      .waitFor();
    await workshop
      .getByLabel("Lay name", { exact: true })
      .fill("Sample recovered lay");
    await workshop
      .getByRole("button", { name: "+ Add to lay", exact: true })
      .first()
      .click();
    await workshop
      .getByRole("button", { name: "+ Add to lay", exact: true })
      .first()
      .click();
    const draft = workshop.getByRole("region", {
      name: "Your lay draft",
      exact: true,
    });
    assert.equal(
      await draft.getByRole("button", { name: /^Remove / }).count(),
      2,
    );
    await auth(a, "TOKEN_REFRESHED");
    assert.equal(
      await draft.getByRole("button", { name: /^Remove / }).count(),
      2,
    );
    await page.reload();
    await draft.waitFor();
    assert.equal(
      await draft.getByRole("button", { name: /^Remove / }).count(),
      2,
    );
    assert.equal(
      await workshop.getByLabel("Lay name", { exact: true }).inputValue(),
      "Sample recovered lay",
    );
    await workshop
      .getByRole("button", { name: "Recent form", exact: true })
      .click();
    await workshop.locator(".vq-stamp").first().waitFor();
    if (process.env.UI_SMOKE_NEGATIVE === "approval-label")
      await workshop
        .locator(".vq-stamp")
        .first()
        .evaluate((el) => (el.textContent = "VQ APPROVED"));
    assert.doesNotMatch(
      await workshop.innerText(),
      /VQ APPROVED/i,
      "misleading approval label must be rejected",
    );
    assert.match(
      await workshop.locator("#recent-form-explanation").innerText(),
      /not model approval/,
    );
    await workshop
      .getByRole("button", { name: "Save lay", exact: true })
      .click();
    const dialog = workshop.getByRole("dialog", {
      name: "Lay saved",
      exact: true,
    });
    await dialog.waitFor();
    assert.equal(creates, 1);
    assert.equal(shares, 0);
    assert.equal(await dialog.getByRole("checkbox").isChecked(), false);
    await page.screenshot({ path: `${out}/${width}-save-confirmation.png` });
    await dialog
      .getByRole("button", { name: "View My lays", exact: true })
      .click();
    const card = workshop.locator(".workshop-saved > details").first();
    await card.waitFor();
    assert.equal(await card.getAttribute("open"), "");
    assert.match(page.url(), /saved=11111111/);
    // A saved hash can identify a card outside the newest 50, without a query or recent pointer.
    excludeSavedFromList = true;
    await page.evaluate(
      (uid) => sessionStorage.removeItem(`vq-parlay-recent:${uid}`),
      a,
    );
    await page.goto(
      base + "/parlays#my-parlay-11111111-1111-4111-8111-111111111111",
    );
    await card.waitFor();
    assert.equal(await card.getAttribute("open"), "");
    assert.ok(
      !new URL(page.url()).searchParams.has("saved"),
      "hash identity works without a saved query",
    );
    const catalogBeforeExpiry = catalogCalls;
    allowed = false;
    await page.reload();
    await workshop
      .getByText(/does not currently have research access/)
      .waitFor();
    await card.waitFor();
    assert.equal(
      catalogCalls,
      catalogBeforeExpiry,
      "expired access must not fetch the protected catalog",
    );
    assert.equal(
      await card
        .getByRole("button", { name: "Edit a copy", exact: true })
        .isEnabled(),
      false,
    );
    assert.equal(
      await card
        .getByRole("button", { name: "Post to Community", exact: true })
        .isEnabled(),
      false,
    );
    assert.equal(
      await card.getAttribute("open"),
      "",
      "existing owner-only saved history remains readable after research expiry",
    );
    allowed = true;
    await page.reload();
    await card
      .getByRole("button", { name: "Edit a copy", exact: true })
      .click();
    await draft
      .getByRole("button", { name: /^Remove / })
      .first()
      .click();
    assert.equal(
      mine[0].legs.length,
      2,
      "editing copy must not mutate original",
    );
    await auth(b);
    await workshop
      .getByText("This saved lay is missing or unavailable to this account.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await workshop.locator(".workshop-saved > details").count(),
      0,
    );
    await workshop
      .getByRole("button", { name: "Build a lay", exact: true })
      .click();
    await workshop.getByLabel("Lay name", { exact: true }).waitFor();
    assert.equal(
      await draft.getByRole("button", { name: /^Remove / }).count(),
      0,
      "another account must never inherit draft",
    );
    assert.notEqual(
      await workshop.getByLabel("Lay name", { exact: true }).inputValue(),
      "Sample recovered lay",
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.keyboard.press("Tab");
    assert.ok(
      await page.evaluate(
        () =>
          !!document.activeElement && document.activeElement !== document.body,
      ),
      "keyboard reaches a control",
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "no horizontal overflow",
    );
    await page.screenshot({ path: `${out}/${width}-member-empty-draft.png` });
    await workshop.getByRole("button", { name: "Review", exact: true }).click();
    await workshop
      .getByLabel("Lay name", { exact: true })
      .scrollIntoViewIfNeeded();
    const tray = await workshop.locator(".workshop-save-tray").boundingBox();
    const nav = page.locator(".mobile-nav");
    if (await nav.isVisible()) {
      const box = await nav.boundingBox();
      assert.ok(
        tray.y + tray.height <= box.y,
        "save tray must clear mobile navigation",
      );
    }
    await page.screenshot({ path: `${out}/${width}-builder-controls.png` });
    inboxMode = "null";
    await page.goto(base + "/notifications");
    await page
      .getByText("Notifications could not load. Please retry.", { exact: true })
      .waitFor();
    await page.screenshot({ path: `${out}/${width}-inbox-unavailable.png` });
    inboxMode = "malformed";
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await page
      .getByText("Notifications could not load. Please retry.", { exact: true })
      .waitFor();
    inboxMode = "ok";
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await page.locator(".notification-empty").waitFor();
    assert.match(
      await page.locator(".notification-empty").innerText(),
      /all caught up/,
    );
    await page.goto(base + "/parlays?build=1");
    await auth(null, "SIGNED_OUT");
    await workshop.getByText(/Sign in to build a lay/).waitFor();
    assert.equal(
      await workshop.locator(".workshop-saved > details").count(),
      0,
    );
    console.log(
      `PASS builder states, retry, form label, draft/account isolation, save/reuse/return at ${width}px`,
    );
    await ctx.close();
  }
  if (process.env.LOBBY_COMBINED === "1") await verifyCombinedRoutes();
} finally {
  await browser.close();
}

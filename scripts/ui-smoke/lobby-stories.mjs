// Home story placement and privacy acceptance. All accounts, avatars and posts are synthetic.
// Reuses the production trusted-clock rail/viewer; does not post or modify any real account.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH || process.env.PLAYWRIGHT_EXECUTABLE,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const base = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const out = process.env.UI_ARTIFACT_DIR || "artifacts/lobby-stories";
const now = Date.parse("2026-10-14T02:00:00Z");
const A = "00000000-0000-4000-8000-000000000001",
  B = "00000000-0000-4000-8000-000000000002";
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const names = [
  "SampleAvery",
  "SampleJordan",
  "SampleMorgan",
  "SampleRiley",
  "SampleCasey",
  "SampleAlex",
];
const avatar = (i) =>
  "data:image/svg+xml;base64," +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><rect width="80" height="80" fill="${["#173e35", "#453651", "#204252", "#624126", "#333d62", "#594133"][i % 6]}"/><path d="M10 80q0-29 30-29t30 29" fill="${["#d7b568", "#b2c3ba", "#8eb7c1"][i % 3]}"/><ellipse cx="40" cy="35" rx="18" ry="23" fill="${["#dba67d", "#9a684d", "#ebc5a6"][i % 3]}"/><path d="M22 30Q19 10 40 10t18 20L44 22Z" fill="#25201d"/><circle cx="33" cy="34" r="1.7" fill="#25201d"/><circle cx="47" cy="34" r="1.7" fill="#25201d"/><path d="M34 45q6 5 12 0" fill="none" stroke="#734534" stroke-width="2"/></svg>`,
  ).toString("base64");
const post = (n, name, created) => ({
  id: id(n),
  user_id: id(100 + n),
  author_name: name,
  title: `${name} game notes`,
  body: "Synthetic member discussion for this browser test. Research and community stay separate.",
  sport: ["nfl", "nba", "nhl", "ncaab"][n % 4],
  kind: "talk",
  legs: [],
  stake: null,
  created_at: new Date(created).toISOString(),
  reactions: 0,
  reacted: false,
  comments: 0,
  following: false,
  photo_path: null,
});
const posts = names.map((name, i) => post(i + 1, name, now - (i + 1) * 600000));
const expired = post(50, "SampleExpired", now - 86400000 - 1000);
const otherPost = post(60, "SampleTaylor", now - 300000);
const nearExpiry = post(70, "SampleNearExpiry", now - 86400000 + 60000);
const session = (user) => ({
  access_token: "synthetic",
  refresh_token: "synthetic",
  token_type: "bearer",
  expires_in: 86400,
  expires_at: Math.floor(now / 1000) + 86400,
  user: {
    id: user,
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: { vq_welcome_version: 1 },
  },
});
const evidence = [];
await mkdir(out, { recursive: true });
async function run(
  name,
  { width = 390, signedIn = true, phase = "normal", updatePrompt = false } = {},
  check,
) {
  const ctx = await browser.newContext({
    viewport: { width, height: 844 },
    reducedMotion: "reduce",
  });
  const state = {
    owner: signedIn ? A : null,
    phase,
    clockFailure: false,
    clockOffset: 0,
    detailGate: null,
    privateCalls: [],
    routeEvents: [],
  };
  const rows = (owner) =>
    owner === B
      ? [otherPost]
      : state.phase === "expiry"
        ? [nearExpiry]
        : [...posts, expired];
  // Test-only evidence: distinguish a route that started from a response the app
  // received, and retain visibility/rail changes without reading auth tokens.
  await ctx.addInitScript(() => {
    const trace = (window.__storyDiagnostics = { events: [], requests: [] });
    const stamp = () => ({
      monotonic: performance.now(),
      wall: Date.now(),
      visibility: document.visibilityState,
      focused: document.hasFocus(),
    });
    const event = (type, detail = {}) => {
      trace.events.push({ type, ...stamp(), ...detail });
      if (trace.events.length > 300) trace.events.shift();
    };
    for (const type of ["focus", "blur", "pageshow", "pagehide"])
      window.addEventListener(type, () => event(type));
    document.addEventListener("visibilitychange", () => event("visibilitychange"));
    const fetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const path = new URL(args[0] instanceof Request ? args[0].url : String(args[0]), location.href).pathname;
      if (!/\/(community_activity|community_feed|community_post|community_story_clock)$/.test(path))
        return fetch(...args);
      const request = { path, sent: stamp(), received: null, status: null };
      trace.requests.push(request);
      try {
        const response = await fetch(...args);
        request.received = stamp();
        request.status = response.status;
        // Inspect a clone asynchronously, never consume or delay the app's body.
        void response.clone().json().then(
          (body) => {
            request.body = path.endsWith("community_story_clock")
              ? { version: body?.version, server_now: body?.server_now }
              : { rows: Array.isArray(body) ? body.length : null };
          },
          (error) => { request.bodyError = String(error); },
        );
        return response;
      } catch (error) {
        request.error = String(error);
        throw error;
      }
    };
    let previous = "";
    const observeRail = () => {
      const rail = document.querySelector(".lobby-community-stories");
      const state = JSON.stringify({
        mounted: Boolean(rail),
        rings: rail?.querySelectorAll("button.community-story").length ?? 0,
        fallback: rail?.querySelector(".story-empty")?.textContent ?? null,
      });
      if (state !== previous) {
        previous = state;
        event("rail", JSON.parse(state));
      }
    };
    new MutationObserver(observeRail).observe(document, { childList: true, subtree: true, characterData: true });
    event("init");
  });
  await ctx.addInitScript(
    ({ token, a, b, updatePrompt }) => {
      if (token)
        localStorage.setItem("sb-127-auth-token", JSON.stringify(token));
      sessionStorage.setItem("vq-prompt-shown", "fixture");
      for (const uid of [a, b]) {
        localStorage.setItem(`vq-app-refresh:${uid}`, "gold-2026-10-22-v2");
        localStorage.setItem(
          `vq-phone-later:${uid}`,
          String(Date.now() + 7 * 86400000),
        );
        localStorage.setItem(
          `vq-push-prompt:${uid}`,
          String(Date.now() + 7 * 86400000),
        );
      }
      // Other onboarding is already completed in these synthetic accounts. The
      // populated 390px case must acknowledge this update through real controls.
      if (updatePrompt) localStorage.removeItem(`vq-app-refresh:${a}`);
    },
    { token: signedIn ? session(A) : null, a: A, b: B, updatePrompt },
  );
  await ctx.route("**/rest/v1/**", async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname;
    if (
      /\/(community_activity|community_feed|community_post|community_story_clock)$/.test(
        path,
      )
    )
      state.privateCalls.push(path);
    if (path.endsWith("community_story_clock")) {
      const event = { path, started: performance.now(), phase: "started" };
      state.routeEvents.push(event);
      if (state.clockFailure) {
        event.phase = "fulfilling-failure";
        await route.fulfill({
          status: 500,
          json: { message: "Synthetic clock failure" },
        });
        event.phase = "fulfilled-failure";
        event.finished = performance.now();
        return;
      }
      event.phase = "reading-browser-time";
      const elapsed = await route
        .request()
        .frame()
        .evaluate(() => performance.now())
        .catch(() => 0);
      event.browserMonotonic = elapsed;
      event.serverNow = new Date(now + state.clockOffset + elapsed).toISOString();
      event.phase = "fulfilling";
      await route.fulfill({
        json: { version: 1, server_now: event.serverNow },
      });
      event.phase = "fulfilled";
      event.finished = performance.now();
      return;
    }
    if (path.endsWith("community_activity")) {
      const event = { path, started: performance.now(), phase: "fulfilling" };
      state.routeEvents.push(event);
      await route.fulfill({
        json: state.owner
          ? rows(state.owner).map((p, i) => ({
              post_id: p.id,
              username: p.author_name,
              avatar: avatar(i),
              sport: p.sport,
              created_at: p.created_at,
            }))
          : [],
      });
      event.phase = "fulfilled";
      event.finished = performance.now();
      return;
    }
    if (path.endsWith("community_feed"))
      return route.fulfill({ json: state.owner ? rows(state.owner) : [] });
    if (path.endsWith("community_post")) {
      const result = state.owner
        ? (rows(state.owner).find(
            (p) => p.id === route.request().postDataJSON()?.p_id,
          ) ?? null)
        : null;
      if (state.detailGate) await state.detailGate;
      return route.fulfill({ json: result }).catch(() => {});
    }
    if (path.endsWith("membership_status"))
      return route.fulfill({
        json: {
          allowed: Boolean(state.owner),
          admin: false,
          member_code: "SAMPLE",
        },
      });
    if (path.endsWith("age_verification_status"))
      return route.fulfill({
        json: {
          required: true,
          verified: true,
          state: "verified",
          version: 1,
          retry_after: null,
        },
      });
    if (path.endsWith("community_profiles"))
      return route.fulfill({
        json: {
          username: "SampleViewer",
          avatar: avatar(0),
          region: "Sample",
          visible: true,
        },
      });
    if (path.endsWith("notification_inbox"))
      return route.fulfill({
        json: { items: [], snapshot_at: new Date(now).toISOString() },
      });
    if (path.endsWith("frank_anniversary"))
      return route.fulfill({ json: { state: "hidden" } });
    if (path.endsWith("is_admin")) return route.fulfill({ json: false });
    if (path.endsWith("sports_home"))
      return route.fulfill({
        json: {
          version: 1,
          sport: route.request().postDataJSON()?.p_sport,
          games: [],
        },
      });
    if (path.endsWith("nba_games"))
      return route.fulfill({
        json: Array.from({ length: 5 }, (_, i) => ({
          id: `story-game-${i}`,
          slug: `sample-story-game-${i}`,
          away_team: `Sample Away ${i}`,
          home_team: `Sample Home ${i}`,
          tipoff: new Date(now + (30 + i * 15) * 60000).toISOString(),
          status: "STATUS_SCHEDULED",
          tipoff_tbd: false,
        })),
      });
    return route.fulfill({ json: [] });
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  await page.clock.setFixedTime(new Date(now));
  const errors = [];
  const networkEvents = [];
  for (const type of ["request", "response", "requestfinished", "requestfailed"])
    page.on(type, (value) => {
      const request = type === "response" ? value.request() : value;
      const path = new URL(request.url()).pathname;
      if (/\/(community_activity|community_feed|community_post|community_story_clock)$/.test(path))
        networkEvents.push({
          type,
          path,
          at: performance.now(),
          ...(type === "response" ? { status: value.status() } : {}),
          ...(type === "requestfailed" ? { failure: request.failure() } : {}),
        });
    });
  const diagnostics = async () => ({
    routeEvents: state.routeEvents,
    networkEvents,
    browser: await page.evaluate(() => ({
      ...window.__storyDiagnostics,
      final: { monotonic: performance.now(), wall: Date.now(), visibility: document.visibilityState, focused: document.hasFocus() },
    })).catch((error) => ({ error: String(error) })),
  });
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(base + "/?stories=fixture");
    await page
      .getByRole("heading", {
        name: "Your sports research starts here.",
        exact: true,
      })
      .waitFor();
    await page.locator(".vq-brand-opening").waitFor({ state: "hidden" });
    if (updatePrompt) {
      const prompt = page.getByRole("dialog", {
        name: "Get the new gold Vegas Quant app",
        exact: true,
      });
      await prompt.waitFor();
      const continueButton = prompt.getByRole("button", {
        name: "Continue to Vegas Quant",
        exact: true,
      });
      assert.ok(
        await continueButton.isDisabled(),
        "update requires acknowledgement",
      );
      await prompt.getByRole("checkbox").check();
      await continueButton.click();
      await prompt.waitFor({ state: "hidden" });
      assert.equal(
        await page.evaluate(
          (uid) => localStorage.getItem(`vq-app-refresh:${uid}`),
          A,
        ),
        "gold-2026-10-22-v2",
        "the real Continue action must persist the acknowledgement",
      );
    }
    assert.equal(
      await page.locator("dialog[open]").count(),
      0,
      "the lobby must be usable without forcibly dismissing a dialog",
    );
    await check({ page, ctx, state });
    assert.deepEqual(errors, [], "no browser errors");
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "no horizontal page overflow",
    );
    await writeFile(
      `${out}/${width}-${name}-diagnostics.json`,
      JSON.stringify(await diagnostics(), null, 2),
    );
    console.log(`PASS ${name} at ${width}px`);
  } catch (error) {
    await page
      .screenshot({
        path: `${out}/${width}-${name}-failure.png`,
        fullPage: true,
      })
      .catch(() => {});
    await writeFile(
      `${out}/${width}-${name}-failure.html`,
      await page.content(),
    ).catch(() => {});
    await writeFile(
      `${out}/${width}-${name}-failure.json`,
      JSON.stringify(
        {
          url: page.url(),
          error: String(error),
          errors,
          privateCalls: state.privateCalls,
          diagnostics: await diagnostics(),
        },
        null,
        2,
      ),
    );
    throw error;
  } finally {
    await ctx.close();
  }
}
const rail = (page) =>
  page.getByRole("region", { name: "Recent member stories", exact: true });
const viewer = (page) => page.locator("dialog.story-viewer[open]");
const ring = (page, name) =>
  rail(page).getByRole("button", {
    name: `Open ${name}'s recent community posts`,
    exact: true,
  });
const reads = (page, uid) =>
  page.evaluate(
    (user) =>
      JSON.parse(localStorage.getItem(`vq-community-read:${user}`) || "[]"),
    uid,
  );
const switchAccount = async (page, state, user) => {
  state.owner = user;
  await page.evaluate(
    ({ token }) => {
      if (token)
        localStorage.setItem("sb-127-auth-token", JSON.stringify(token));
      else localStorage.removeItem("sb-127-auth-token");
      const channel = new BroadcastChannel("sb-127-auth-token");
      channel.postMessage({
        event: token ? "SIGNED_IN" : "SIGNED_OUT",
        session: token,
      });
      setTimeout(() => channel.close(), 100);
    },
    { token: user ? session(user) : null },
  );
};
try {
  for (const width of [360, 390])
    await run(
      "populated-placement-history-privacy",
      { width, updatePrompt: width === 390 },
      async ({ page, state }) => {
        await ring(page, names[0]).waitFor();
        assert.equal(
          await rail(page).locator("button.community-story").count(),
          6,
        );
        assert.equal(
          await page.locator(".sport-switch .community-story-wrap").count(),
          0,
          "Home must mount the rail only once, below the rooms",
        );
        assert.equal(
          await page.getByRole("button", { name: /SampleExpired/ }).count(),
          0,
          "already expired activity must not appear",
        );
        await page.waitForFunction(() =>
          [
            ...document.querySelectorAll(
              ".lobby-community-stories .story-ring img",
            ),
          ].every((image) => image.complete && image.naturalWidth > 0),
        );
        await page.locator(".vq-tonight-game").first().waitFor();
        assert.equal(
          await page.locator(".vq-tonight-game").count(),
          3,
          "show three scheduled games initially",
        );
        await page
          .getByRole("button", { name: "Show all 5 games", exact: true })
          .waitFor();
        const geometry = await page.evaluate(() => {
          const rect = (selector) => {
            const r = document.querySelector(selector).getBoundingClientRect();
            return { top: r.top, bottom: r.bottom, height: r.height };
          };
          const circles = [...document.querySelectorAll(".lobby-community-stories .story-ring")].map((el) => el.getBoundingClientRect());
          const pennants = [...document.querySelectorAll(".vq-pennant")].map((el) => el.getBoundingClientRect());
          return {
            width: innerWidth,
            rooms: rect(".vq-lobby-all-sports"),
            stories: rect(".lobby-community-stories"),
            board: rect(".vq-tonight-board"),
            firstGame: rect(".vq-tonight-game"),
            fixedNav: rect(".mobile-nav"),
            pennantsOverlapStories: pennants.some((p) => circles.some((c) => p.left < c.right && c.left < p.right && p.top < c.bottom && c.top < p.bottom)),
          };
        });
        evidence.push(geometry);
        await writeFile(
          `${out}/populated-layout-metrics.json`,
          JSON.stringify(evidence, null, 2),
        );
        console.log(
          `GEOMETRY ${width}px: rail ${geometry.stories.height}px; first game bottom ${geometry.firstGame.bottom}px; fixed navigation starts ${geometry.fixedNav.top}px`,
        );
        assert.ok(
          geometry.stories.top >= geometry.rooms.bottom,
          "member stories belong below All sports",
        );
        assert.ok(
          geometry.stories.bottom < geometry.board.top,
          "member stories belong above VQ Tonight",
        );
        assert.ok(
          geometry.stories.height <= 90,
          "populated rail stays compact",
        );
        assert.equal(geometry.pennantsOverlapStories, false, "hanging pennants stay clear of every populated story circle");
        await page.screenshot({
          path: `${out}/${width}-signed-in-populated.png`,
        });
        await page.screenshot({
          path: `${out}/${width}-signed-in-populated-full.png`,
          fullPage: true,
        });
        assert.ok(
          geometry.firstGame.bottom <= geometry.fixedNav.top,
          `the first scheduled game must fit above fixed navigation with populated stories: game bottom ${geometry.firstGame.bottom}px, navigation top ${geometry.fixedNav.top}px`,
        );
        if (width === 390) {
          await page.locator(".vq-tonight-board").screenshot({
            path: `${out}/390-signed-in-populated-enclosure.png`,
          });
        }
        const strip = rail(page).locator(".community-stories");
        assert.ok(
          await strip.evaluate((node) => node.scrollWidth > node.clientWidth),
          "populated story row scrolls horizontally",
        );
        await strip.evaluate((node) => {
          node.scrollLeft = node.scrollWidth;
        });
        assert.ok(await strip.evaluate((node) => node.scrollLeft > 0));
        await strip.evaluate((node) => {
          node.scrollLeft = 0;
        });
        const origin = page.url();
        let release;
        state.detailGate = new Promise((resolve) => {
          release = resolve;
        });
        const requested = page.waitForRequest("**/rest/v1/rpc/community_post");
        await ring(page, names[0]).click();
        await requested;
        await viewer(page)
          .getByRole("button", { name: "Close recent posts" })
          .click();
        await page.waitForURL(origin);
        release();
        state.detailGate = null;
        await page.waitForTimeout(150);
        assert.equal(
          await viewer(page).count(),
          0,
          "interrupted detail must not reopen a closed viewer",
        );
        assert.ok(
          !(await reads(page, A)).includes(posts[0].id),
          "closing before display must not mark a story read",
        );
        await page.waitForFunction(() =>
          Boolean(document.activeElement?.closest(".lobby-community-stories")),
        );
        await ring(page, names[1]).click();
        await viewer(page).getByText(posts[1].title, { exact: true }).waitFor();
        await page.goBack();
        await page.waitForURL(origin);
        await viewer(page).waitFor({ state: "hidden" });
        await page.waitForFunction(() =>
          Boolean(document.activeElement?.closest(".lobby-community-stories")),
        );
        await page.screenshot({
          path: `${out}/${width}-story-back-restored.png`,
        });
        state.detailGate = new Promise((resolve) => {
          release = resolve;
        });
        const pendingOldDetail = page.waitForRequest(
          "**/rest/v1/rpc/community_post",
        );
        await ring(page, names[2]).click();
        await pendingOldDetail;
        await switchAccount(page, state, B);
        await viewer(page).waitFor({ state: "hidden" });
        await ring(page, otherPost.author_name).waitFor();
        release();
        state.detailGate = null;
        await page.waitForTimeout(150);
        for (const name of names)
          assert.equal(
            await page
              .getByRole("button", {
                name: `Open ${name}'s recent community posts`,
                exact: true,
              })
              .count(),
            0,
            "old-account avatar must be cleared",
          );
        assert.ok(
          !(await reads(page, A)).includes(posts[2].id),
          "late old-account detail must not mark a story read",
        );
        assert.ok(
          !(await reads(page, B)).includes(posts[2].id),
          "old content must not pollute the new account's read state",
        );
        await switchAccount(page, state, null);
        await rail(page).waitFor({ state: "hidden" });
        await page.waitForTimeout(150);
        const privateBefore = state.privateCalls.length;
        await page.evaluate(() => {
          window.dispatchEvent(new Event("focus"));
          window.dispatchEvent(new Event("vq-community-changed"));
        });
        await page.waitForTimeout(150);
        assert.equal(
          state.privateCalls.length,
          privateBefore,
          "signed-out focus/refresh must not request private story data",
        );
        assert.equal(await page.locator(".community-story").count(), 0);
        await page.screenshot({
          path: `${out}/${width}-signed-out-cleared.png`,
        });
      },
    );
  await run(
    "trusted-clock-failure-expiry",
    { phase: "expiry" },
    async ({ page, state }) => {
      await ring(page, nearExpiry.author_name).waitFor();
      state.clockFailure = true;
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await rail(page)
        .getByRole("button", {
          name: "Stories unavailable · Retry",
          exact: true,
        })
        .waitFor();
      assert.equal(
        await page.locator(".community-story").count(),
        0,
        "missing trusted time must hide identity previews",
      );
      state.clockFailure = false;
      await rail(page)
        .getByRole("button", {
          name: "Stories unavailable · Retry",
          exact: true,
        })
        .click();
      await ring(page, nearExpiry.author_name).waitFor();
      state.clockOffset = 61000;
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await ring(page, nearExpiry.author_name).waitFor({ state: "hidden" });
      assert.equal(
        await page.locator(".community-story").count(),
        0,
        "the original creation plus 24h expires the story after trusted resync",
      );
      await page.screenshot({ path: `${out}/390-stories-expired.png` });
    },
  );
  await run(
    "signed-out-no-private-reads",
    { signedIn: false },
    async ({ page, state }) => {
      await page.locator(".vq-tonight-game").first().waitFor();
      assert.equal(await rail(page).count(), 0);
      assert.equal(state.privateCalls.length, 0);
      assert.equal(await page.locator(".community-story").count(), 0);
    },
  );
  await writeFile(
    `${out}/populated-layout-metrics.json`,
    JSON.stringify(evidence, null, 2),
  );
} finally {
  await browser.close();
}

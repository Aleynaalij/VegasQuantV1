// Auth and core-flow regression checklist (C3). Synthetic data and fake tokens only; nothing reaches a
// real auth server. Needs the app on :3100 built with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
// and scripts/ui-smoke/stub.mjs running (see check.mjs).
// Cases: signed out, slow access check, membership denied, signed in, expired session that refreshes,
// expired session whose refresh is refused, access check failing then retried, and a dropped request.
// Member-only research must never show unless access was granted.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");

const BASE = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
// Negative controls for reviewers (UI_SMOKE_NEGATIVE): "nav-tab" hides the VQ Slots tab in both navs;
// "retry" makes every Retry button do nothing. A correct run of this script must then FAIL.
const NEGATIVE = process.env.UI_SMOKE_NEGATIVE || "";
const sabotage = (ctx) => NEGATIVE && ctx.addInitScript((mode) => {
  // Hidden with CSS rather than removed, so React hydration is untouched.
  if (mode === "nav-tab") document.addEventListener("DOMContentLoaded", () => {
    const s = document.createElement("style");
    s.textContent = '.mobile-nav a[href="/slots"], .sidebar a[href="/slots"] { display: none !important; }';
    document.head.append(s);
  });
  if (mode === "retry") window.addEventListener("click", (e) => {
    const b = e.target.closest?.("button");
    if (b && /retry/i.test(b.innerText)) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
}, NEGATIVE);

const MEMBER_POST = "Sample Seahawks–Broncos injury update"; // stub research_feed_posts row (members only)
// The research feed proper; bare /feed redirects to The Zone, and the "Latest" view shows every post.
const FEED = "/feed?view=latest";
const ACCESS_NOTE = "Sign in or manage research access";
const user = { id: "00000000-0000-0000-0000-000000000001", aud: "authenticated", role: "authenticated",
  // An established member: the first-visit welcome (src/components/welcome.tsx VERSION) was already seen.
  email: "smoke@example.com", app_metadata: {}, user_metadata: { vq_welcome_version: 1 }, created_at: "2026-10-01T00:00:00Z" };
const allowed = { allowed: true, admin: false, member_code: "SAMPLE" };
const denied = { allowed: false, admin: false, member_code: null };

const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {});
const failures = [];
const results = [];

// One isolated browser context per case. `expiresIn` sets the stored session's expiry in seconds
// (negative = already expired); null = signed out.
async function scenario(name, { expiresIn = 86400 * 400, setup } = {}, body) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await sabotage(ctx);
  if (expiresIn !== null)
    await ctx.addInitScript(([u, e]) => localStorage.setItem("sb-127-auth-token", JSON.stringify({
      access_token: "smoke", refresh_token: "smoke-refresh", token_type: "bearer", expires_in: 3600,
      // Relative to the pinned clock below, not the real one.
      expires_at: Math.floor(Date.parse("2026-10-14T02:00:00Z") / 1000) + e, user: u })), [user, expiresIn]);
  // This member already confirmed the one-time app reinstall notice, so it does not cover the page.
  // They also chose "Not now" on the alerts prompt (src/components/notification-bootstrap.tsx).
  await ctx.addInitScript((id) => {
    localStorage.setItem(`vq-app-refresh:${id}`, "gold-2026-10-22-v2");
    localStorage.setItem(`vq-push-prompt:${id}`, String(Date.parse("2026-10-21T00:00:00Z")));
  }, user.id);
  await ctx.route("**/rest/v1/rpc/notification_inbox", (r) => r.fulfill({ json: { items: [], snapshot_at: new Date().toISOString() } }));
  const state = {};
  if (setup) await setup(ctx, state);
  const page = await ctx.newPage();
  // Pin "now" to the stub's synthetic date (as check.mjs does) while timers keep running normally.
  await page.clock.setFixedTime(new Date("2026-10-14T02:00:00Z"));
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const before = failures.length;
  const fail = (msg) => failures.push(`${name}: ${msg}`);
  const go = async (path) => {
    const res = await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 45000 }).catch((e) => (errors.push(String(e)), null));
    await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close())).catch(() => {});
    if ((res?.status() ?? 0) >= 500) fail(`${path} HTTP ${res?.status()}`);
  };
  // Long lists use content-visibility: auto, which hides off-screen cards from innerText: render all first.
  const text = () => page.evaluate(() => {
    if (!document.getElementById("smoke-cv")) {
      const s = document.createElement("style");
      s.id = "smoke-cv";
      s.textContent = "* { content-visibility: visible !important; }";
      document.head.append(s);
    }
    return document.body.innerText;
  });
  const has = async (t) => (await text()).toLowerCase().includes(t.toLowerCase());
  try {
    await body({ page, go, has, text, fail, state });
  } catch (e) {
    fail(`threw · ${String(e).slice(0, 200)}`);
  }
  if (errors.length) fail(`page error · ${errors[0].slice(0, 160)}`);
  if (await has("The desk hit a snag").catch(() => false)) fail("shows the full-page error");
  results.push(`${failures.length > before ? "FAIL" : "ok  "} ${name}`);
  console.log(results.at(-1));
  await ctx.close();
}
const membership = (ctx, json, opts = {}) =>
  ctx.route("**/rest/v1/rpc/membership_status", async (r) => {
    if (opts.delay) await new Promise((res) => setTimeout(res, opts.delay));
    return r.fulfill(typeof json === "function" ? json() : { json });
  });

await scenario("signed out", { expiresIn: null, setup: (ctx) => membership(ctx, denied) }, async ({ go, has, fail }) => {
  await go("/membership");
  if (!(await has("Join the desk."))) fail("/membership does not offer joining");
  if (!(await has("Sign in"))) fail("/membership has no sign-in form");
  await go(FEED);
  if (!(await has(ACCESS_NOTE))) fail("feed has no sign-in note");
  if (await has(MEMBER_POST)) fail("feed shows member research to a signed-out visitor");
  await go("/notifications");
  if (!(await has("to see your notifications"))) fail("/notifications has no sign-in prompt");
});

await scenario("slow access check (loading)", { setup: (ctx) => membership(ctx, allowed, { delay: 4000 }) }, async ({ page, has, fail }) => {
  await page.goto(BASE + FEED, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  if (!(await has("Entering The Zone"))) fail("no loading state while access is checked");
  if (await has(ACCESS_NOTE)) fail("shows the sign-in note before access is known");
  if (await has(MEMBER_POST)) fail("shows member research before access is known");
  await page.waitForFunction((t) => { document.querySelectorAll("*").forEach((e) => { if (getComputedStyle(e).contentVisibility === "auto") e.style.contentVisibility = "visible"; }); return document.body.innerText.toLowerCase().includes(t.toLowerCase()); }, MEMBER_POST, { timeout: 15000 }).catch(() => fail("member research never appeared after access was granted"));
});

await scenario("membership denied", { setup: (ctx) => membership(ctx, denied) }, async ({ go, has, fail }) => {
  await go(FEED);
  if (!(await has(ACCESS_NOTE))) fail("feed has no access note for a member without access");
  if (await has(MEMBER_POST)) fail("feed shows member research without access");
  await go("/membership");
  if (!(await has("Your account."))) fail("/membership does not show the signed-in account");
});

await scenario("signed in with access", {}, async ({ go, has, fail }) => {
  await go(FEED);
  if (!(await has(MEMBER_POST))) fail("feed hides member research from a member");
  if (await has(ACCESS_NOTE)) fail("feed shows the sign-in note to a member");
  await go("/membership");
  if (!(await has("Your account."))) fail("/membership does not show the account");
});

await scenario("expired session refreshes", {
  expiresIn: -60,
  setup: (ctx, state) => ctx.route("**/auth/v1/token**", (r) => {
    state.refreshed = (state.refreshed || 0) + 1;
    return r.fulfill({ json: { access_token: "smoke-2", refresh_token: "smoke-refresh-2", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user } });
  }),
}, async ({ go, has, fail, state }) => {
  await go("/membership");
  if (!state.refreshed) fail("the expired session was not refreshed");
  if (!(await has("Your account."))) fail("not signed in after a successful refresh");
  await go(FEED);
  if (!(await has(MEMBER_POST))) fail("feed hides member research after refresh");
});

await scenario("expired session, refresh refused", {
  expiresIn: -60,
  setup: async (ctx, state) => {
    await ctx.route("**/auth/v1/token**", (r) => { state.refreshed = (state.refreshed || 0) + 1; return r.fulfill({ status: 400, json: { error: "invalid_grant", error_description: "Refresh Token Not Found" } }); });
    // A signed-out visitor has no access, as the database would answer.
    await membership(ctx, denied);
  },
}, async ({ go, has, fail, state }) => {
  await go("/membership");
  if (!state.refreshed) fail("no refresh was attempted");
  if (!(await has("Join the desk."))) fail("does not fall back to the signed-out page");
  if (await has("Your account.")) fail("still claims to be signed in");
  await go(FEED);
  if (await has(MEMBER_POST)) fail("feed shows member research after the session ended");
});


// Retry cases: switch off the feed's background refreshes (window focus, visibility and its 30 s timer),
// so any recovery can only come from the Retry click. Long timers are swallowed; short ones (supabase-js
// retry backoff, UI timers) run normally.
const isolateRefresh = (ctx) => ctx.addInitScript(() => {
  for (const type of ["focus", "visibilitychange"])
    for (const target of [window, document])
      target.addEventListener(type, (e) => e.stopImmediatePropagation(), true);
  const realInterval = window.setInterval;
  window.setInterval = (fn, ms, ...args) => (ms >= 10000 ? 0 : realInterval(fn, ms, ...args));
});
await scenario("access check fails, then retry", {
  // Every access check fails until Retry is pressed (several components ask; all must fail closed).
  setup: async (ctx, state) => {
    await isolateRefresh(ctx);
    await membership(ctx, () => {
      state.checks = (state.checks || 0) + 1;
      return state.recovered ? { json: allowed } : { status: 500, json: { message: "synthetic failure" } };
    });
  },
}, async ({ page, go, has, fail, state }) => {
  await go(FEED);
  if (!(await has("Research access could not be checked"))) fail("no message when the access check fails");
  // Attribution: with background refresh off, nothing asks again until Retry is clicked.
  const idle = state.checks;
  await page.waitForTimeout(3000);
  if (state.checks !== idle) fail(`access was re-checked ${state.checks - idle} time(s) without Retry; background refresh not isolated`);
  if (await has(MEMBER_POST)) fail("member research shown although access could not be checked (must fail closed)");
  const retry = page.getByRole("button", { name: /retry/i }).first();
  if (!(await retry.count())) return fail("no Retry control");
  state.recovered = true;
  await retry.click();
  // Probe: fire the feed's background triggers too. With Retry disabled (UI_SMOKE_NEGATIVE=retry) this
  // case must still fail, which shows recovery is attributable to the click alone.
  await page.evaluate(() => { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); });
  await page.waitForFunction((t) => { document.querySelectorAll("*").forEach((e) => { if (getComputedStyle(e).contentVisibility === "auto") e.style.contentVisibility = "visible"; }); return document.body.innerText.toLowerCase().includes(t.toLowerCase()); }, MEMBER_POST, { timeout: 15000 }).catch(() => fail("Retry did not recover"));
  if (await has("Research access could not be checked")) fail("error message stays after a successful retry");
});

// A release title shown only once candidate_releases loads (stub data).
const SELECTION = "Sample Runner";
await scenario("dropped request, then retry", {
  // Selections fail at the network level until the connection "comes back"; the stub serves them after.
  setup: async (ctx, state) => {
    await isolateRefresh(ctx);
    await ctx.route("**/rest/v1/candidate_releases**", (r) => {
      state.requests = (state.requests || 0) + 1;
      return state.online ? r.fallback() : r.abort("failed");
    });
  },
}, async ({ page, go, has, fail, state }) => {
  await go(FEED);
  // supabase-js retries network failures with backoff (~7 s here) before reporting the error.
  const shown = await page.waitForFunction(() => document.body.innerText.includes("could not refresh"), null, { timeout: 30000 }).then(() => true, () => false);
  if (!shown) return fail("no message when selections fail to load (waited 30 s)");
  if (await has(SELECTION)) fail("selections shown although their request failed");
  if (!(await has("The Zone"))) fail("page shell missing after a dropped request");
  const retry = page.getByRole("button", { name: /retry/i }).first();
  if (!(await retry.count())) return fail("no Retry control after a dropped request");
  // Attribution: with background refresh off, no new selections request happens until Retry.
  const idle = state.requests;
  await page.waitForTimeout(3000);
  if (state.requests !== idle) fail(`selections were re-requested ${state.requests - idle} time(s) without Retry; background refresh not isolated`);
  state.online = true;
  const before = state.requests;
  await retry.click();
  // Probe: fire the feed's background triggers too. With Retry disabled (UI_SMOKE_NEGATIVE=retry) this
  // case must still fail, which shows recovery is attributable to the click alone.
  await page.evaluate(() => { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); });
  await page.waitForFunction((t) => { document.querySelectorAll("*").forEach((e) => { if (getComputedStyle(e).contentVisibility === "auto") e.style.contentVisibility = "visible"; }); return document.body.innerText.includes(t); }, SELECTION, { timeout: 15000 })
    .catch(() => fail("Retry did not bring the selections back"));
  if (!(state.requests > before)) fail("Retry did not request the selections again");
  // The feed clears its error when the whole refresh (selections, access, posts) has finished.
  const cleared = await page.waitForFunction(() => !document.body.innerText.includes("could not refresh"), null, { timeout: 15000 }).then(() => true, () => false);
  if (!cleared) fail("error message stays after a successful retry (waited 15 s)");
});

const shows = (page, t) => page.waitForFunction((t) => { document.querySelectorAll("*").forEach((e) => { if (getComputedStyle(e).contentVisibility === "auto") e.style.contentVisibility = "visible"; }); return document.body.innerText.toLowerCase().includes(t.toLowerCase()); }, t, { timeout: 15000 }).then(() => true, () => false);

// Signed-in navigation through the phone nav's required tabs. A missing tab fails; it is never
// replaced by loading the route directly.
await scenario("signed-in navigation: Zone, Slots, Account, Home", {}, async ({ page, go, fail }) => {
  await go("/");
  for (const [href, name, expect] of [["/community", "The Zone", "The Zone"], ["/slots", "VQ Slots", "Slots"], ["/membership", "Account", "Your account."], ["/", "Home", "Every game. One clear read."]]) {
    // One-time prompts open after load and are excluded by the fixture member's saved choices; close any left.
    await page.waitForTimeout(1000);
    await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
    const tab = page.locator(`.mobile-nav a[href="${href}"]`).filter({ hasText: name }).first();
    // A route's loading screen (e.g. "Loading Community…") briefly replaces the shell; wait for the tab.
    if (!(await tab.waitFor({ state: "visible", timeout: 15000 }).then(() => true, () => false))) { fail(`required tab "${name}" (${href}) missing from the phone nav`); continue; }
    await tab.click();
    if (!(await page.waitForURL((u) => u.pathname === href, { timeout: 15000 }).then(() => true, () => false))) { fail(`tab "${name}" did not navigate to ${href}`); continue; }
    if (!(await shows(page, expect))) fail(`${href} missing "${expect}"`);
  }
});

// Research is not a nav tab; check its direct route separately.
await scenario("research route (direct, not a nav tab)", {}, async ({ page, go, fail }) => {
  await go("/matchups");
  if (!(await shows(page, "Seahawks"))) fail('/matchups missing "Seahawks"');
});

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} auth/core-flow failure(s):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nAuth/core-flow checklist passed.");

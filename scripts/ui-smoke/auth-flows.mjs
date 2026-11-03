// Auth and core-flow regression checklist (C3). Synthetic data and fake tokens only; nothing reaches a
// real auth server. Needs the app on :3100 built with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
// and scripts/ui-smoke/stub.mjs running (see check.mjs).
// Cases: signed out, slow access check, membership denied, signed in, expired session that refreshes,
// expired session whose refresh is refused, access check failing then retried, and a dropped request.
// Member-only research must never show unless access was granted.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");

const BASE = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
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

await scenario("access check fails, then retry", {
  // Every access check fails until Retry is pressed (several components ask; all must fail closed).
  setup: (ctx, state) => membership(ctx, () => state.recovered
    ? { json: allowed }
    : { status: 500, json: { message: "synthetic failure" } }),
}, async ({ page, go, has, fail, state }) => {
  await go(FEED);
  if (!(await has("Research access could not be checked"))) fail("no message when the access check fails");
  if (await has(MEMBER_POST)) fail("member research shown although access could not be checked (must fail closed)");
  const retry = page.getByRole("button", { name: /retry/i }).first();
  if (!(await retry.count())) return fail("no Retry control");
  state.recovered = true;
  await retry.click();
  await page.waitForFunction((t) => { document.querySelectorAll("*").forEach((e) => { if (getComputedStyle(e).contentVisibility === "auto") e.style.contentVisibility = "visible"; }); return document.body.innerText.toLowerCase().includes(t.toLowerCase()); }, MEMBER_POST, { timeout: 15000 }).catch(() => fail("Retry did not recover"));
  if (await has("Research access could not be checked")) fail("error message stays after a successful retry");
});

await scenario("dropped request", {
  setup: (ctx) => ctx.route("**/rest/v1/candidate_releases**", (r) => r.abort("failed")),
}, async ({ page, go, has, fail }) => {
  await go(FEED);
  // supabase-js retries network failures with backoff (~7 s here) before reporting the error.
  await page.waitForFunction(() => document.body.innerText.includes("could not refresh"), null, { timeout: 30000 })
    .catch(() => fail("no message when selections fail to load (waited 30 s)"));
  if (await has(MEMBER_POST) && !(await has("could not refresh"))) fail("stale content with no error after a dropped request");
  if (!(await page.getByRole("button", { name: /retry/i }).count())) fail("no Retry control after a dropped request");
  if (!(await has("The Zone"))) fail("page shell missing after a dropped request");
});

await scenario("navigation into Zone, research and account", {}, async ({ page, go, fail }) => {
  await go("/");
  for (const [href, expect] of [["/community", "The Zone"], ["/matchups", "Seahawks"], ["/membership", "Your account."]]) {
    // The phone nav's own link (the desktop sidebar's copy is hidden at this width).
    const link = page.locator(`.mobile-nav a[href="${href}"]`).first();
    // One-time prompts (welcome, notifications) open after load; a member dismisses them first.
    await page.waitForTimeout(2500);
    await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
    if (!(await link.count())) { await go(href); }
    else { await link.click(); await page.waitForURL((u) => u.pathname === href, { timeout: 15000 }).catch(() => fail(`could not reach ${href}`)); }
    await page.waitForFunction((t) => { document.querySelectorAll("*").forEach((e) => { if (getComputedStyle(e).contentVisibility === "auto") e.style.contentVisibility = "visible"; }); return document.body.innerText.toLowerCase().includes(t.toLowerCase()); }, expect, { timeout: 15000 }).catch(() => fail(`${href} missing "${expect}"`));
  }
});

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} auth/core-flow failure(s):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nAuth/core-flow checklist passed.");

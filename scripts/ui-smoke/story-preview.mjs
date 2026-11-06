// Admin story-preview acceptance. Every account and roster row is synthetic.
// Run against a LOCAL app built with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
// and scripts/ui-smoke/stub.mjs. Browser RPCs are intercepted; unexpected writes
// and non-local requests are blocked and fail the test. No production data is used.
// Scope: preview adds no posts, notifications or persistent story-read writes.
// The ordinary app shell still calls notification_pulse/notification_sync_updates;
// those two pre-existing mutations are mocked, separately recorded exceptions,
// NOT evidence that the entire Home page is free of all background mutations.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const local = (host) => ["localhost", "127.0.0.1", "[::1]"].includes(host);
assert.ok(local(new URL(base).hostname), "This synthetic suite only accepts a loopback app URL");
const out = process.env.UI_ARTIFACT_DIR || "/tmp/story-preview-evidence";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || process.env.PLAYWRIGHT_EXECUTABLE,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const now = Date.parse("2026-10-14T02:00:00Z");
const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
const readSentinel = JSON.stringify(["10000000-0000-4000-8000-000000000099"]);
const names = ["SampleAvery", "SampleJordan", "SampleMorgan", "SampleRiley"];
const roster = names.map((username, i) => ({
  username,
  avatar: null,
  region: "Synthetic fixture",
  visible: i !== 2, // Admin roster can include a private profile.
  joined_at: new Date(now - (i + 1) * 86400000).toISOString(),
  won: 0,
  followed: 0,
  last_checkin: null,
}));
const session = (uid, aal = "aal2") => ({
  access_token: [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify({ sub: uid, aal, exp: now / 1000 + 86400 })).toString("base64url"),
    "synthetic-not-a-real-signature",
  ].join("."),
  refresh_token: "synthetic-not-a-real-refresh-token",
  token_type: "bearer",
  expires_in: 86400,
  expires_at: now / 1000 + 86400,
  user: {
    id: uid,
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: { vq_welcome_version: 1 },
  },
});
const rail = (page) => page.locator(".lobby-community-stories");
const viewer = (page) => page.locator("dialog.story-viewer[open]");
const ring = (page, username) => rail(page).getByRole("button", {
  name: `Open ${username}'s test story`, exact: true,
});
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const results = [];
// POST is how PostgREST invokes reads too. Only explicitly known read RPCs may
// proceed; an unlisted POST cannot accidentally be disguised as a harmless read.
const readRpcs = new Set([
  "is_admin", "community_roster", "community_story_clock", "community_activity",
  "community_feed", "community_post", "membership_status", "age_verification_status",
  "notification_inbox", "notification_counts", "frank_anniversary", "frank_nhl_feedback", "sports_home", "nba_home", "nhl_home",
  "nba_editorial_records", "sports_records", "public_research_status",
  "admin_nfl_shadow_scorecard", "admin_nfl_shadow_calibration",
]);

async function run(name, options, check) {
  if (process.env.UI_SMOKE_ONLY && !name.includes(process.env.UI_SMOKE_ONLY)) return;
  const { width = 390, signedIn = true, admin = true, aal = "aal2", rows = roster, fakeTime = false } = options;
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: "reduce", serviceWorkers: "block" });
  const state = {
    owner: signedIn ? A : null, admin, aal, rows,
    adminError: options.adminError || false,
    adminGate: options.adminGate || null,
    rosterGate: options.rosterGate || null,
    calls: [], approvals: [], violations: [], shellMutationMocks: [],
  };
  await ctx.addInitScript(({ token, a, b, readSentinel }) => {
    if (token) localStorage.setItem("sb-127-auth-token", JSON.stringify(token));
    sessionStorage.setItem("vq-prompt-shown", "fixture");
    for (const uid of [a, b]) {
      localStorage.setItem(`vq-app-refresh:${uid}`, "gold-2026-10-22-v2");
      localStorage.setItem(`vq-phone-later:${uid}`, String(Date.now() + 7 * 86400000));
      localStorage.setItem(`vq-push-prompt:${uid}`, String(Date.now() + 7 * 86400000));
      localStorage.setItem(`vq-community-read:${uid}`, readSentinel);
    }
    window.__previewReadWrites = [];
    for (const method of ["setItem", "removeItem"]) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (...args) {
        if (this === localStorage && String(args[0]).startsWith("vq-community-read:"))
          window.__previewReadWrites.push({ method, key: String(args[0]) });
        return original.apply(this, args);
      };
    }
    const clear = Storage.prototype.clear;
    Storage.prototype.clear = function (...args) {
      if (this === localStorage) window.__previewReadWrites.push({ method: "clear" });
      return clear.apply(this, args);
    };
  }, { token: signedIn ? session(A, aal) : null, a: A, b: B, readSentinel });

  await ctx.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    if (!local(url.hostname)) {
      state.violations.push(`Non-local request blocked: ${method} ${url.origin}${path}`);
      return route.abort();
    }
    if (path.startsWith("/rest/v1/")) {
      const rpc = path.startsWith("/rest/v1/rpc/") ? path.split("/").at(-1) : null;
      state.calls.push({ rpc, path, method, owner: state.owner });
      if (["notification_pulse", "notification_sync_updates"].includes(rpc)) {
        state.shellMutationMocks.push({ rpc, method, owner: state.owner });
        return route.fulfill({ json: null });
      }
      if (["frank_anniversary", "frank_nhl_feedback"].includes(rpc) && request.postDataJSON()?.p_action !== "status") {
        state.violations.push(`Unexpected non-status action blocked: ${rpc}`);
        return route.fulfill({ status: 403, json: { message: "Only status reads are permitted" } });
      }
      if (!["GET", "HEAD", "OPTIONS"].includes(method) && !(rpc && readRpcs.has(rpc))) {
        state.violations.push(`Unexpected write blocked: ${method} ${path}`);
        return route.fulfill({ status: 403, json: { message: "Writes forbidden in preview acceptance" } });
      }
      if (rpc === "is_admin") {
        const owner = state.owner;
        const allowed = owner === A ? state.admin : false;
        const error = state.adminError;
        if (state.adminGate) await state.adminGate.promise;
        if (!error && allowed === true) state.approvals.push(owner);
        return route.fulfill(error
          ? { status: 500, json: { message: "Synthetic admin check failed" } }
          : { json: allowed }).catch(() => {});
      }
      if (rpc === "community_roster") {
        const owner = state.owner;
        if (!owner || !state.approvals.includes(owner) || state.admin !== true)
          state.violations.push(`Roster requested before a successful admin response for ${owner}`);
        const answer = structuredClone(state.rows);
        if (state.rosterGate) await state.rosterGate.promise;
        return route.fulfill({ json: answer }).catch(() => {});
      }
      if (rpc === "community_story_clock") {
        const elapsed = await request.frame().evaluate(() => performance.now()).catch(() => 0);
        return route.fulfill({ json: { version: 1, server_now: new Date(now + elapsed).toISOString() } }).catch(() => {});
      }
      if (rpc === "community_post" || rpc === "community_feed") {
        state.violations.push(`Preview requested production content: ${rpc}`);
        return route.fulfill({ json: rpc === "community_post" ? null : [] });
      }
      if (rpc === "community_activity") return route.fulfill({ json: [] });
      if (rpc === "membership_status") return route.fulfill({ json: { allowed: Boolean(state.owner), admin: true, member_code: "SAMPLE" } });
      if (rpc === "age_verification_status") return route.fulfill({ json: { required: true, verified: true, state: "verified", version: 1, retry_after: null } });
      if (path.endsWith("/community_profiles")) return route.fulfill({ json: { username: "SampleViewer", avatar: "ruby", region: "Sample", visible: true } });
      if (rpc === "notification_inbox") return route.fulfill({ json: { items: [], snapshot_at: new Date(now).toISOString() } });
      if (rpc === "notification_counts") return route.fulfill({ json: { unread: 0, unviewed: 0, messages: 0 } });
      if (["frank_anniversary", "frank_nhl_feedback"].includes(rpc)) return route.fulfill({ json: { state: "hidden" } });
      if (rpc === "sports_home") return route.fulfill({ json: { version: 1, sport: request.postDataJSON()?.p_sport, games: [] } });
      return route.fulfill({ json: [] });
    }
    if (![/^GET$/, /^HEAD$/, /^OPTIONS$/].some((re) => re.test(method))) {
      state.violations.push(`Unexpected non-read request blocked: ${method} ${path}`);
      return route.fulfill({ status: 403, json: { message: "Writes forbidden in preview acceptance" } });
    }
    return route.continue();
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  if (fakeTime) await page.clock.install({ time: new Date(now) });
  else await page.clock.setFixedTime(new Date(now));
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let failure = null;
  try {
    await page.goto(`${base}/?storyPreview=1`);
    await page.getByRole("heading", { name: "Your sports research starts here.", exact: true }).waitFor();
    await page.locator(".vq-brand-opening").waitFor({ state: "hidden" });
    assert.equal(await page.locator("dialog[open]").count(), 0, "completed fixture accounts need no forced dialog dismissal");
    if (fakeTime) await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
    await check({ page, state, ctx });
    assert.deepEqual(errors, [], "no browser errors");
    assert.deepEqual(state.violations, [], "no unauthorized reads, production details, writes or remote requests");
    assert.deepEqual(await page.evaluate(() => window.__previewReadWrites), [], "preview never writes persistent read state");
    for (const uid of [A, B]) assert.equal(await page.evaluate((id) => localStorage.getItem(`vq-community-read:${id}`), uid), readSentinel, "existing member read state stays byte-for-byte unchanged");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "no horizontal page overflow");
    console.log(`PASS ${name} at ${width}px`);
  } catch (error) {
    failure = String(error);
    console.error(`FAIL ${name} at ${width}px: ${failure}`);
    await page.screenshot({ path: `${out}/${width}-${name}-failure.png`, fullPage: true }).catch(() => {});
  } finally {
    const report = { name, width, passed: !failure, error: failure, url: page.url(), errors, calls: state.calls, violations: state.violations, shellMutationMocks: state.shellMutationMocks };
    results.push(report);
    await writeFile(`${out}/${width}-${name}.json`, JSON.stringify(report, null, 2));
    state.adminGate?.resolve();
    state.rosterGate?.resolve();
    await ctx.close();
  }
}

async function shown(page, username) {
  await viewer(page).locator(".story-viewer-meta b").filter({ hasText: username }).waitFor();
  await viewer(page).getByText("Test story · not posted by this member", { exact: true }).waitFor();
  assert.equal(await viewer(page).getByRole("link", { name: /View discussion/ }).count(), 0, "test stories cannot enter a real discussion");
  assert.equal(await viewer(page).locator('a[href*="post="]').count(), 0);
}
async function close(page) {
  await page.keyboard.press("Escape");
  await viewer(page).waitFor({ state: "hidden" });
  await page.waitForURL((url) => url.searchParams.get("storyPreview") === "1" && url.hash !== "#story");
}
async function switchAccount(page, state, uid) {
  state.owner = uid;
  await page.evaluate(({ token }) => {
    if (token) localStorage.setItem("sb-127-auth-token", JSON.stringify(token));
    else localStorage.removeItem("sb-127-auth-token");
    const channel = new BroadcastChannel("sb-127-auth-token");
    channel.postMessage({ event: token ? "SIGNED_IN" : "SIGNED_OUT", session: token });
    setTimeout(() => channel.close(), 100);
  }, { token: uid ? session(uid) : null });
}
const countRpc = (state, name) => state.calls.filter((call) => call.rpc === name).length;

try {
  for (const width of [390, 1280]) await run("all-rings-navigation-history", { width }, async ({ page, state }) => {
    await rail(page).getByText("Admin story preview", { exact: true }).waitFor();
    await ring(page, names[0]).waitFor();
    assert.equal(await rail(page).locator(".community-story").count(), names.length);
    assert.ok(countRpc(state, "community_roster") >= 1);
    const origin = page.url();
    await page.screenshot({ path: `${out}/${width}-preview-rail.png`, fullPage: true });
    for (const username of names) {
      await ring(page, username).click();
      await shown(page, username);
      await close(page);
      assert.equal(page.url(), origin);
      assert.equal(await rail(page).locator(".community-story").count(), names.length, "reading keeps every test ring available");
    }
    await ring(page, names[0]).click();
    await shown(page, names[0]);
    assert.ok(await viewer(page).getByRole("button", { name: "Previous post", exact: true }).isDisabled());
    for (const username of names.slice(1)) {
      await viewer(page).getByRole("button", { name: /Next post/ }).click();
      await shown(page, username);
    }
    assert.ok(await viewer(page).getByRole("button", { name: "Next post", exact: true }).isDisabled(), "last preview cannot wrap around");
    await page.keyboard.press("ArrowLeft");
    await shown(page, names.at(-2));
    await page.screenshot({ path: `${out}/${width}-preview-viewer.png` });
    await page.goBack();
    await viewer(page).waitFor({ state: "hidden" });
    await page.waitForURL(origin);
    await page.waitForFunction(() => Boolean(document.activeElement?.closest(".lobby-community-stories")));
    await page.goForward();
    await page.waitForURL(origin);
    assert.equal(await viewer(page).count(), 0, "Forward cannot strand a closed #story entry");
    await ring(page, names[1]).click();
    await shown(page, names[1]);
    await close(page);
    assert.equal(page.url(), origin, "Escape after reopening preserves preview query");
  });

  await run("autoplay-keeps-all-rings", { fakeTime: true }, async ({ page }) => {
    await ring(page, names[0]).waitFor();
    await ring(page, names[0]).click();
    for (const username of names) {
      await shown(page, username);
      const duration = await viewer(page).locator(".story-post").evaluate((post) => {
        const words = [post.querySelector("h2")?.textContent, post.querySelector(".story-text")?.textContent, ...[...post.querySelectorAll(".story-legs li")].map((li) => li.textContent)].filter(Boolean).join(" ").split(/\s+/).filter(Boolean).length;
        return Math.max(6000, Math.round(words / 200 * 60000) + 1500);
      });
      await page.clock.runFor(duration + 500);
    }
    await viewer(page).waitFor({ state: "hidden" });
    await page.waitForURL((url) => url.searchParams.get("storyPreview") === "1" && !url.hash);
    assert.equal(await rail(page).locator(".community-story").count(), names.length);
  });

  await run("signed-out-never-reads-roster", { signedIn: false, admin: true }, async ({ page, state }) => {
    await page.waitForTimeout(400);
    assert.equal(await rail(page).count(), 0);
    assert.equal(countRpc(state, "community_roster"), 0);
    assert.equal(await viewer(page).count(), 0);
  });
  for (const [name, options] of [
    ["ordinary-member-denied", { admin: false }],
    ["aal1-admin-denied", { admin: false, aal: "aal1" }],
    ["truthy-admin-is-not-true", { admin: "true" }],
    ["admin-error-fails-closed", { adminError: true }],
  ]) await run(name, options, async ({ page, state }) => {
    await rail(page).getByText(options.adminError ? "Preview unavailable. Reload to retry." : "Admin access required for story preview.", { exact: true }).waitFor();
    assert.equal(countRpc(state, "community_roster"), 0, "membership.admin and truthy claims cannot replace is_admin === true");
    assert.equal(await rail(page).locator(".community-story").count(), 0);
    assert.equal(await viewer(page).count(), 0);
  });

  await run("roster-waits-for-admin", { adminGate: deferred() }, async ({ page, state }) => {
    await rail(page).getByText("Checking preview access…", { exact: true }).waitFor();
    await page.waitForTimeout(200);
    assert.equal(countRpc(state, "community_roster"), 0);
    state.adminGate.resolve();
    state.adminGate = null;
    await ring(page, names[0]).waitFor();
    assert.equal(await rail(page).locator(".community-story").count(), names.length);
  });

  await run("sign-out-during-delayed-admin", { adminGate: deferred() }, async ({ page, state }) => {
    await rail(page).getByText("Checking preview access…", { exact: true }).waitFor();
    await switchAccount(page, state, null);
    await rail(page).waitFor({ state: "hidden" });
    state.adminGate.resolve();
    state.adminGate = null;
    await page.waitForTimeout(400);
    assert.equal(countRpc(state, "community_roster"), 0, "late admin success cannot start a roster read after sign-out");
    assert.equal(await rail(page).count(), 0);
    assert.equal(await viewer(page).count(), 0);
  });

  await run("empty-roster", { rows: [] }, async ({ page, state }) => {
    await rail(page).getByText("No members in this roster.", { exact: true }).waitFor();
    assert.ok(countRpc(state, "community_roster") >= 1);
    assert.equal(await rail(page).locator(".community-story").count(), 0);
    assert.equal(await viewer(page).count(), 0);
  });

  await run("same-account-admin-revoked-on-focus", {}, async ({ page, state }) => {
    await ring(page, names[0]).click();
    await shown(page, names[0]);
    const calls = countRpc(state, "is_admin");
    state.admin = false;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await viewer(page).waitFor({ state: "hidden" });
    await rail(page).getByText("Admin access required for story preview.", { exact: true }).waitFor();
    assert.ok(countRpc(state, "is_admin") > calls, "focus must make a new, uncached admin check");
    assert.equal(await rail(page).locator(".community-story").count(), 0);
    await page.waitForURL((url) => url.searchParams.get("storyPreview") === "1" && !url.hash);
  });

  await run("account-switch-during-delayed-roster", { rosterGate: deferred() }, async ({ page, state }) => {
    const deadline = Date.now() + 10000;
    while (!countRpc(state, "community_roster") && Date.now() < deadline) await page.waitForTimeout(20);
    assert.ok(countRpc(state, "community_roster") > 0, "old account roster read is pending");
    await switchAccount(page, state, B);
    await rail(page).getByText("Admin access required for story preview.", { exact: true }).waitFor();
    await page.evaluate(() => {
      window.__previewLeaked = false;
      const observer = new MutationObserver(() => {
        if (document.querySelector(".lobby-community-stories .community-story")) window.__previewLeaked = true;
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
    state.rosterGate.resolve();
    state.rosterGate = null;
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => window.__previewLeaked), false, "late old-account roster never renders, even transiently");
    assert.equal(await rail(page).locator(".community-story").count(), 0);
    assert.equal(await viewer(page).count(), 0);
    assert.equal(state.calls.filter((call) => call.rpc === "community_roster" && call.owner === B).length, 0, "new non-admin never reads the roster");
  });

  await run("sign-out-closes-active-preview", {}, async ({ page, state }) => {
    await ring(page, names[0]).click();
    await shown(page, names[0]);
    await switchAccount(page, state, null);
    await viewer(page).waitFor({ state: "hidden" });
    await rail(page).waitFor({ state: "hidden" });
    await page.waitForURL((url) => url.searchParams.get("storyPreview") === "1" && !url.hash);
  });
} finally {
  await browser.close();
  await writeFile(`${out}/summary.json`, JSON.stringify(results, null, 2));
}
const failed = results.filter((result) => !result.passed);
console.log(`${results.length - failed.length}/${results.length} preview acceptance cases passed. Evidence: ${out}`);
if (failed.length) process.exitCode = 1;

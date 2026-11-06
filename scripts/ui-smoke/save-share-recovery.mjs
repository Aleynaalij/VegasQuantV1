// Parlay save recovery (C-C / VQ-C05). Synthetic data only; every write is mocked in the browser.
// Needs the app on :3100 built with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 (see check.mjs).
// Complements parlay-save.mjs (save, share retry, reuse, reload, Gambly/Kalshi) with the save itself
// failing: server error, dropped connection, confirmation that cannot load, and a double tap. An error
// must never claim success, the draft must survive, and a retry must save exactly once.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");

const BASE = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
// Negative control for reviewers: UI_SMOKE_NEGATIVE=false-success makes a failing save answer, and
// confirm, as if it succeeded while storing nothing. A correct run of this script must then FAIL.
const NEGATIVE = process.env.UI_SMOKE_NEGATIVE || "";
const UID = "00000000-0000-0000-0000-000000000001";
const failures = [];
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {});

function fixture() {
  const expires = new Date(Date.now() + 86400000).toISOString();
  const legs = Array.from({ length: 6 }, (_, i) => ({
    leg_key: `fixture:${i}`, name: `Sample Player ${i}`, market: "Full game · 20+ rushing yards",
    matchup: `Sample Away ${i} @ Sample Home ${i}`, game_id: `game-${i}`, kind: "RESEARCH", quote: null,
    quote_observed_at: null, published_at: new Date().toISOString(), expires_at: expires, result: null,
    why: "Sample workload", risk: "Sample rotation", copy_text: `Sample Player ${i} 20+ rushing yards`,
  }));
  return { legs, expires, mine: [], creates: 0, mode: "ok", confirmFails: false, createDelay: 0, shareMode: "ok", shares: 0, phantom: null };
}

async function setup(ctx, f) {
  await ctx.addInitScript((uid) => {
    sessionStorage.setItem("vq-prompt-shown", "fixture");
    localStorage.setItem(`vq-app-refresh:${uid}`, "gold-2026-10-22-v2");
    localStorage.setItem(`vq-push-prompt:${uid}`, String(Date.now() + 7 * 86400000));
    localStorage.setItem("sb-127-auth-token", JSON.stringify({
      access_token: "smoke", refresh_token: "smoke", token_type: "bearer", expires_in: 86400,
      expires_at: Math.floor(Date.now() / 1000) + 86400,
      user: { id: uid, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: { vq_welcome_version: 1 } },
    }));
  }, UID);
  await ctx.route("**/rest/v1/**", async (route) => {
    const req = route.request(), u = new URL(req.url()), path = u.pathname;
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204 });
    let data = [];
    if (path.endsWith("membership_status")) data = { allowed: true, admin: false, member_code: "SAMPLE" };
    if (path.endsWith("age_verification_status")) data = { required: true, verified: true };
    if (path.endsWith("notification_inbox")) data = { items: [], snapshot_at: new Date().toISOString() };
    if (path.endsWith("community_profiles")) data = [{ user_id: UID, username: "FixtureMember", avatar: "ruby", visible: true }];
    if (path.endsWith("published_leg_catalog")) data = f.legs;
    if (path.endsWith("member_parlays")) {
      if (u.searchParams.has("id")) {
        if (f.confirmFails) return route.fulfill({ status: 500, json: { message: "synthetic confirmation failure" } });
        data = f.mine.find((p) => `eq.${p.id}` === u.searchParams.get("id")) || (f.phantom && `eq.${f.phantom.id}` === u.searchParams.get("id") ? f.phantom : null);
      } else data = f.mine;
    }
    if (path.endsWith("create_member_parlay")) {
      f.creates++;
      if (f.createDelay) await new Promise((r) => setTimeout(r, f.createDelay));
      if (NEGATIVE === "false-success" && f.mode !== "ok") {
        // A phantom parlay the confirmation read can find, though nothing was stored.
        const body = req.postDataJSON();
        f.phantom = { id: "44444444-4444-4444-8444-000000000001", title: body.p_title, legs: f.legs.filter((l) => body.p_leg_keys.includes(l.leg_key)), created_at: new Date().toISOString(), expires_at: f.expires, community_post_id: null };
        return route.fulfill({ json: f.phantom.id });
      }
      if (f.mode === "server-error") return route.fulfill({ status: 500, json: { message: "Sample save failed. Please retry." } });
      if (f.mode === "network") return route.abort("failed");
      const body = req.postDataJSON();
      const key = [...body.p_leg_keys].sort().join();
      // Like the real RPC, an identical leg set returns the existing parlay instead of a duplicate.
      const existing = f.mine.find((p) => p.legs.map((l) => l.leg_key).sort().join() === key);
      if (existing) data = existing.id;
      else {
        const id = `33333333-3333-4333-8333-${String(f.mine.length + 1).padStart(12, "0")}`;
        f.mine = [{ id, title: body.p_title, legs: f.legs.filter((l) => body.p_leg_keys.includes(l.leg_key)), created_at: new Date().toISOString(), expires_at: f.expires, community_post_id: null }, ...f.mine];
        data = id;
      }
    }
    if (path.endsWith("share_member_parlay")) {
      f.shares++;
      if (f.shareMode === "network") return route.abort("failed");
      const id = req.postDataJSON().p_parlay;
      f.mine = f.mine.map((p) => (p.id === id ? { ...p, community_post_id: "sample-post" } : p));
      data = "sample-post";
    }
    return route.fulfill({ json: data });
  });
}

async function scenario(name, run) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const f = fixture();
  await setup(ctx, f);
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const before = failures.length;
  const fail = (m) => failures.push(`${name}: ${m}`);
  try {
    await page.goto(BASE + "/feed?view=legs", { waitUntil: "networkidle" });
    await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
    await run({ page, f, fail });
  } catch (e) {
    fail(`threw · ${String(e).split("\n")[0].slice(0, 200)}`);
  }
  if (errors.length) fail(`page error · ${errors[0].slice(0, 160)}`);
  console.log(`${failures.length > before ? "FAIL" : "ok  "} ${name}`);
  await ctx.close();
}

// Draft two legs under a title; returns the locators the cases need.
async function draft(page, title) {
  await page.getByRole("button", { name: "Build a lay", exact: true }).click();
  await page.getByLabel("Lay name", { exact: true }).fill(title);
  const add = page.getByRole("button", { name: "+ Add to lay", exact: true });
  await add.nth(0).click();
  await add.nth(0).click();
  return {
    save: page.getByRole("button", { name: "Save lay", exact: true }),
    saved: page.getByRole("dialog", { name: "Lay saved", exact: true }),
    draftLegs: () => page.getByRole("region", { name: "Your lay draft", exact: true }).getByRole("button", { name: /^Remove / }).count(),
  };
}
const alertText = (page) => page.getByRole("alert").allInnerTexts().then((t) => t.join(" "));
// Alerts can render before their final wording (e.g. an earlier message is replaced): wait up to 15 s for
// the expected text, then return whatever is shown so a failure reports one consistent reading.
async function alertMatching(page, re) {
  await page.waitForFunction((src) => [...document.querySelectorAll('[role="alert"]')].some((a) => new RegExp(src, "i").test(a.innerText)), re.source, { timeout: 15000 }).catch(() => {});
  return alertText(page);
}

async function failThenRetry({ page, f, fail }, mode) {
  const d = await draft(page, `Retry after ${mode}`);
  f.mode = mode;
  await d.save.click();
  await page.getByRole("alert").first().waitFor();
  if (await d.saved.isVisible()) fail("success dialog shown although the save failed");
  const msg = await alertMatching(page, /save|retry/);
  if (!/save|retry/i.test(msg) || /TypeError|Failed to fetch/.test(msg)) fail(`save error is not a plain retry message: "${msg}"`);
  if ((await d.draftLegs()) !== 2) fail(`draft lost after a failed save (${await d.draftLegs()} legs left)`);
  if (f.mine.length) fail("a parlay was stored although the save failed");
  f.mode = "ok";
  await d.save.click();
  await d.saved.waitFor();
  if (f.mine.length !== 1) fail(`retry stored ${f.mine.length} parlays, expected 1`);
  if (!/Retry after/.test(await d.saved.innerText())) fail("success dialog does not name the saved parlay");
}

await scenario("save fails (server error), then retry", (c) => failThenRetry(c, "server-error"));
await scenario("save interrupted (connection dropped), then retry", (c) => failThenRetry(c, "network"));

await scenario("saved but confirmation cannot load: honest message, no duplicate on retry", async ({ page, f, fail }) => {
  const d = await draft(page, "Unconfirmed save");
  f.confirmFails = true;
  await d.save.click();
  await page.getByRole("alert").first().waitFor();
  if (await d.saved.isVisible()) fail("success dialog shown although the save could not be confirmed");
  const shown = await alertMatching(page, /confirmation could not load/);
  if (!/confirmation could not load/i.test(shown)) fail(`message does not say the confirmation failed: "${shown}"`);
  f.confirmFails = false;
  await page.reload({ waitUntil: "networkidle" });
  await page.goto(BASE + "/parlays", { waitUntil: "networkidle" });
  const cards = page.locator(".workshop-saved > details");
  await cards.first().waitFor();
  if ((await cards.count()) !== 1) fail(`My lays shows ${await cards.count()} cards after reload, expected 1`);
  if (!/Unconfirmed save/.test(await cards.first().innerText())) fail("the saved parlay is missing from My lays");
});

await scenario("double tap on Save: one parlay, one success dialog", async ({ page, f, fail }) => {
  const d = await draft(page, "Double tap");
  f.createDelay = 800; // a slow save, so the second tap lands while the first is in flight
  await d.save.dblclick();
  await d.saved.waitFor();
  await page.waitForTimeout(1500);
  if (f.mine.length !== 1) fail(`double tap stored ${f.mine.length} parlays`);
  if ((await page.getByRole("dialog", { name: "Lay saved", exact: true }).count()) !== 1) fail("more than one success dialog");
  if (/already saved/i.test(await d.saved.innerText())) fail('first save of a new parlay says "already saved"');
  console.log(`     (create requests sent: ${f.creates})`);
});

await scenario("share interrupted (connection dropped), then retry", async ({ page, f, fail }) => {
  const d = await draft(page, "Share me");
  await d.save.click();
  await d.saved.waitFor();
  await d.saved.getByRole("checkbox").check();
  f.shareMode = "network";
  await d.saved.getByRole("button", { name: "Open with Gambly ↗", exact: true }).click();
  await d.saved.getByRole("alert").waitFor();
  const msg = await d.saved.getByRole("alert").innerText();
  if (!/share|retry/i.test(msg) || /TypeError|Failed to fetch/.test(msg)) fail(`share error is not a plain retry message: "${msg}"`);
  if (f.mine[0].community_post_id) fail("parlay marked shared although the share failed");
  if (await page.getByRole("dialog", { name: "Copy here. Paste in Gambly.", exact: true }).isVisible()) fail("Gambly opened although the share failed");
  f.shareMode = "ok";
  await d.saved.getByRole("button", { name: "Open with Gambly ↗", exact: true }).click();
  await page.getByRole("dialog", { name: "Copy here. Paste in Gambly.", exact: true }).waitFor();
  if (f.mine[0].community_post_id !== "sample-post") fail("retry did not share the parlay");
});

await scenario("reopen after reload: the saved card is still there and opens", async ({ page, f, fail }) => {
  const d = await draft(page, "Reopen me");
  await d.save.click();
  await d.saved.waitFor();
  await d.saved.getByRole("button", { name: "View My lays", exact: true }).click();
  await page.waitForURL(/\/parlays\?saved=/);
  const url = page.url();
  await page.reload({ waitUntil: "networkidle" });
  if (page.url() !== url) fail(`reload changed the address to ${page.url()}`);
  const card = page.locator(".workshop-saved > details").first();
  await card.waitFor();
  if (!/Reopen me/.test(await card.innerText())) fail("saved card missing after reload");
  if ((await card.getAttribute("open")) === null) fail("the saved card is not opened from its link after reload");
});

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} save recovery failure(s):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nSave recovery passed.");

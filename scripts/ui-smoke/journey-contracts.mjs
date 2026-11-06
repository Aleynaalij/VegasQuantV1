// U-X2: isolated synthetic account/draft/deep-link boundaries. No live writes.
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");

const BASE = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
// Negative control for reviewers: UI_SMOKE_NEGATIVE=false-success makes a failing save answer, and
// confirm, as if it succeeded while storing nothing. A correct run of this script must then FAIL.
const NEGATIVE = process.env.UI_SMOKE_NEGATIVE || "";
const UID = "00000000-0000-0000-0000-000000000001";

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


const OLD = "55555555-5555-4555-8555-555555555555";
for (const width of [360, 390, 1280]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const f = fixture();
  const original = { id: OLD, title: "Sample historical combination", legs: f.legs.slice(0, 2), created_at: new Date().toISOString(), expires_at: f.expires };
  f.mine = [original];
  const immutable = JSON.stringify(original);
  await setup(ctx, f);
  // Set only on initial document; do not recreate a draft after successful saves.
  await ctx.addInitScript(({ uid, legs }) => {
    if (sessionStorage.getItem("ux-fixture-seeded")) return;
    sessionStorage.setItem("ux-fixture-seeded", "yes");
    sessionStorage.setItem(`vq-parlay-draft:${uid}`, JSON.stringify({ title: "Sample recovered journey", keys: [legs[0].leg_key, legs[1].leg_key, "missing-key"] }));
    sessionStorage.setItem("vq-parlay-draft:another-account", JSON.stringify({ title: "OTHER ACCOUNT PRIVATE DRAFT", keys: [legs[2].leg_key] }));
  }, { uid: UID, legs: f.legs });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  // The legacy route must retain the exact saved ID and focus its card.
  await page.goto(`${BASE}/community?build=1&saved=${OLD}`, { waitUntil: "networkidle" });
  await page.waitForURL(url => url.pathname === "/parlays" && url.searchParams.get("saved") === OLD);
  assert.equal(new URL(page.url()).pathname, "/parlays");
  assert.equal(new URL(page.url()).searchParams.get("saved"), OLD);
  const card = page.locator(`#my-parlay-${OLD}`);
  await card.waitFor();
  assert.equal(await card.getAttribute("open"), "");
  const draft = page.getByRole("region", { name: "Your parlay draft", exact: true });
  await draft.waitFor();
  assert.equal(await page.getByLabel("Parlay name", { exact: true }).inputValue(), "Sample recovered journey");
  assert.equal(await draft.getByRole("button", { name: /^Remove / }).count(), 2);
  await page.getByText(/1 closed or unavailable selections were left out of your recovered draft/).waitFor();
  assert.doesNotMatch(await page.locator("body").innerText(), /OTHER ACCOUNT PRIVATE DRAFT/);
  // Closing preserves the exact selection keys, including across a route round trip.
  await page.getByRole("button", { name: "Close builder", exact: true }).click();
  await page.goto(BASE + "/feed?view=latest", { waitUntil: "networkidle" });
  await page.goBack({ waitUntil: "networkidle" });
  await draft.waitFor();
  assert.equal(await draft.getByRole("button", { name: /^Remove / }).count(), 2);
  assert.equal(await page.getByLabel("Parlay name", { exact: true }).inputValue(), "Sample recovered journey");
  // A delayed failed write must keep the draft; successful retry is confirmed once.
  f.mode = "server-error";
  const save = page.getByRole("button", { name: "Save my parlay", exact: true });
  await save.click();
  await page.getByRole("alert").filter({ hasText: /Sample save failed/ }).or(page.getByRole("dialog", { name: "Parlay saved", exact: true })).waitFor();
  assert.equal(await page.getByRole("dialog", { name: "Parlay saved", exact: true }).isVisible(), false, "false success after a failed save");
  assert.equal(await draft.getByRole("button", { name: /^Remove / }).count(), 2);
  f.mode = "ok";
  f.createDelay = 300;
  const before = f.creates;
  // Exercise actual browser input, allowing React to commit the disabled state between events.
  // Same-stack programmatic dispatch bypasses the user interaction boundary.
  await save.dblclick();
  const dialog = page.getByRole("dialog", { name: "Parlay saved", exact: true });
  await dialog.waitFor();
  assert.equal(f.creates - before, 1, "duplicate click sent a second create request");
  assert.equal(f.mine.length, 1, "existing exact combination must not duplicate");
  assert.equal(JSON.stringify(original), immutable, "saved historical snapshot changed");
  assert.equal(f.shares, 0, "saving must not share automatically");
  await page.goto(`${BASE}/parlays?saved=${OLD}`, { waitUntil: "networkidle" });
  await card.waitFor();
  assert.equal(await card.getAttribute("open"), "");
  // A missing or RLS-denied ID must never manufacture a saved card.
  const missing = "66666666-6666-4666-8666-666666666666";
  await page.goto(`${BASE}/parlays?saved=${missing}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "My parlays", exact: true }).waitFor();
  assert.equal(await page.locator(`#my-parlay-${missing}`).count(), 0);
  console.log(`ok journey contracts ${width}px: legacy route, exact ID, account draft, missing selection, round trip, failure/retry, duplicate guard, private save, missing ID`);
  await ctx.close();
}
await browser.close();

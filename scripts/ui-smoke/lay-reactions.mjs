// Like and emoji reactions on VIP lays in the Zone feed (ruby_card_reaction_states /
// set_ruby_card_reaction). Synthetic only: the lays and both RPCs are answered here; nothing is written.
// Needs the app on :3100 built with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 and
// scripts/ui-smoke/stub.mjs running (see check.mjs).
// Negative control: UI_SMOKE_NEGATIVE=wrong-card answers every write for a different card, which the
// app must refuse, so the "reaction saved" assertions must fail.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");

const BASE = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const UID = "00000000-0000-0000-0000-000000000001";
const NEG = process.env.UI_SMOKE_NEGATIVE || "";
const L1 = "00000000-0000-4000-8000-0000000000a1", L2 = "00000000-0000-4000-8000-0000000000a2";
const types = ["heart", "celebrate", "fire", "thinking"];
const OTHERS = { [L1]: { heart: 2 }, [L2]: { fire: 1 } };
const stateOf = (card, mine) => {
  const counts = { ...OTHERS[card] };
  if (mine) counts[mine] = (counts[mine] || 0) + 1;
  const full = Object.fromEntries(types.map((t) => [t, counts[t] || 0]));
  return { version: 1, post_id: card, total: Object.values(full).reduce((a, b) => a + b, 0), counts: full, mine };
};
const now = new Date().toISOString();
const lay = (id, title) => ({ id, user_id: "u9", brand: "OmaticsZone", theme: "orbit", sport: "NFL", title, legs: ["Sample leg one", "Sample leg two"], note: "", photo_path: null, sportsbook: null, reported_odds: null, created_at: now, revision: 0, edited_at: null, hidden: false, reported_result: null });

const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {});
const failures = [];
async function open(name, { available = true, failWrites = 0, signedIn = true } = {}, run) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await ctx.addInitScript(({ uid, signedIn }) => {
    localStorage.setItem(`vq-app-refresh:${uid}`, "gold-2026-10-22-v2");
    localStorage.setItem(`vq-push-prompt:${uid}`, String(Date.now() + 7 * 86400000));
    sessionStorage.setItem("vq-prompt-shown", "fixture");
    if (signedIn) localStorage.setItem("sb-127-auth-token", JSON.stringify({
      access_token: "smoke", refresh_token: "smoke", token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400,
      user: { id: uid, aud: "authenticated", role: "authenticated", email: "smoke@example.com", app_metadata: {}, user_metadata: { vq_welcome_version: 1 } },
    }));
  }, { uid: UID, signedIn });
  const mine = { [L1]: null, [L2]: null };
  const reads = [], writes = [], postWrites = [];
  let failLeft = failWrites;
  await ctx.route("**/rest/v1/ruby_cards*", (r) => r.fulfill({ json: r.request().url().includes("id=eq.") ? null : [lay(L1, "Sample lay one"), lay(L2, "Sample lay two")] }));
  await ctx.route("**/rest/v1/rpc/ruby_card_reaction_states*", (r) => {
    const ids = r.request().postDataJSON().p_cards;
    reads.push(ids);
    if (!available) return r.fulfill({ status: 404, json: { code: "PGRST202", message: "Could not find the function" } });
    return r.fulfill({ json: ids.filter((id) => id in mine).map((id) => stateOf(id, mine[id])) });
  });
  await ctx.route("**/rest/v1/rpc/set_ruby_card_reaction*", (r) => {
    const { p_card, p_reaction } = r.request().postDataJSON();
    writes.push([p_card, p_reaction]);
    if (failLeft-- > 0) return r.fulfill({ status: 500, json: { message: "synthetic failure" } });
    mine[p_card] = p_reaction;
    const s = stateOf(p_card, p_reaction);
    return r.fulfill({ json: NEG === "wrong-card" ? { ...s, post_id: "some-other-card" } : s });
  });
  await ctx.route("**/rest/v1/rpc/set_community_reaction*", (r) => { postWrites.push(r.request().postDataJSON()); return r.fulfill({ status: 500, json: {} }); });
  await ctx.route("**/rest/v1/rpc/notification_inbox*", (r) => r.fulfill({ json: { items: [], snapshot_at: now } }));
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const before = failures.length;
  const fail = (m) => failures.push(`${name}: ${m}`);
  try {
    await page.goto(BASE + "/community", { waitUntil: "networkidle" });
    await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
    await run({ page, fail, reads, writes, postWrites });
  } catch (e) {
    fail(`threw · ${String(e).split("\n")[0].slice(0, 200)}`);
  }
  if (errors.length) fail(`page error · ${errors[0].slice(0, 160)}`);
  console.log(`${failures.length > before ? "FAIL" : "ok  "} ${name}`);
  await ctx.close();
}
const layCard = (page, id) => page.locator(`#lay-${id}`);
const likeBtn = (page, id) => layCard(page, id).getByRole("button", { name: /^(Like|Unlike) lay$/ });
const choice = (page, id, name) => layCard(page, id).getByRole("group", { name: "Reactions" }).getByRole("button", { name: new RegExp(`^${name},`) });

await open("every lay shows Like and React, loaded in one request", {}, async ({ page, fail, reads }) => {
  for (const id of [L1, L2]) {
    await likeBtn(page, id).waitFor().catch(() => fail(`lay ${id.slice(-2)} has no Like`));
    if (!(await layCard(page, id).getByRole("button", { name: "React with an emoji" }).count())) fail(`lay ${id.slice(-2)} has no emoji picker`);
  }
  if ((await likeBtn(page, L1).innerText()).trim() !== "2") fail(`lay one count is "${await likeBtn(page, L1).innerText()}", expected the server's 2`);
  const batched = reads.filter((ids) => ids.includes(L1) && ids.includes(L2)).length;
  if (batched !== 1 || reads.length !== 1) fail(`states read ${JSON.stringify(reads)}, expected both lays in one request`);
  // Member posts keep their own row.
  if (!(await page.locator(".zone-post:not(.zone-lay) .zone-actions").count())) fail("member post lost its actions");
});

await open("Like on a lay saves heart, lights it, and tapping again removes it", {}, async ({ page, fail, writes, postWrites }) => {
  await likeBtn(page, L1).click();
  await page.waitForFunction((id) => document.querySelector(`#lay-${id} [aria-label="Unlike lay"]`)?.getAttribute("aria-pressed") === "true", L1, { timeout: 5000 }).catch(() => fail("Like not shown as saved"));
  if ((await likeBtn(page, L1).innerText()).trim() !== "3") fail(`count after Like is "${await likeBtn(page, L1).innerText()}", expected 3`);
  if ((await likeBtn(page, L2).getAttribute("aria-pressed")) !== "false") fail("liking one lay lit another");
  await likeBtn(page, L1).click();
  await page.waitForFunction((id) => document.querySelector(`#lay-${id} [aria-label="Like lay"]`)?.getAttribute("aria-pressed") === "false", L1, { timeout: 5000 }).catch(() => fail("second tap did not remove the Like"));
  if (JSON.stringify(writes) !== JSON.stringify([[L1, "heart"], [L1, null]])) fail(`writes were ${JSON.stringify(writes)}`);
  if (postWrites.length) fail("a lay reaction was sent as a post reaction");
});

await open("an emoji on a lay replaces the Like, one reaction per person", {}, async ({ page, fail, writes }) => {
  await likeBtn(page, L2).click();
  await page.waitForFunction((id) => document.querySelector(`#lay-${id} [aria-label="Unlike lay"]`), L2, { timeout: 5000 }).catch(() => fail("Like not saved"));
  await layCard(page, L2).getByRole("button", { name: "React with an emoji" }).click();
  await choice(page, L2, "Fire").waitFor();
  if ((await choice(page, L2, "Like").getAttribute("aria-pressed")) !== "true") fail("picker does not show the Like as your reaction");
  await choice(page, L2, "Fire").click();
  await page.waitForFunction((id) => document.querySelector(`#lay-${id} [aria-label^="Fire,"]`)?.getAttribute("aria-pressed") === "true", L2, { timeout: 5000 }).catch(() => fail("Fire not shown as selected"));
  if (!/Fire, 2 people/.test(await choice(page, L2, "Fire").getAttribute("aria-label"))) fail("Fire count is not the canonical 2");
  if ((await likeBtn(page, L2).getAttribute("aria-pressed")) !== "false") fail("heart still lit after choosing Fire");
  if (JSON.stringify(writes) !== JSON.stringify([[L2, "heart"], [L2, "fire"]])) fail(`writes were ${JSON.stringify(writes)}`);
});

await open("a failed Like says so and stays unliked", { failWrites: 1 }, async ({ page, fail }) => {
  await likeBtn(page, L1).click();
  await layCard(page, L1).getByRole("alert").filter({ hasText: "Your like didn’t save" }).waitFor().catch(() => fail("failure not reported"));
  if ((await likeBtn(page, L1).getAttribute("aria-pressed")) !== "false") fail("failed Like shown as saved");
  if ((await likeBtn(page, L1).innerText()).trim() !== "2") fail("count changed although the save failed");
});

await open("before lay reactions are live: no dead buttons on lays", { available: false }, async ({ page, fail }) => {
  await layCard(page, L1).waitFor();
  await page.waitForTimeout(500);
  if (await layCard(page, L1).locator(".zone-actions").count()) fail("lay shows reaction buttons although the API is missing");
  if (!(await page.locator(".zone-post:not(.zone-lay) .zone-actions").count())) fail("member post lost its actions");
});

await open("signed out: lays show no reaction controls and nothing is read", { signedIn: false }, async ({ page, fail, reads }) => {
  await page.waitForTimeout(500);
  if (await page.locator(".zone-lay .zone-actions").count()) fail("signed-out lay shows reaction buttons");
  if (reads.length) fail("reaction states were read while signed out");
});

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n` + failures.map((f) => ` - ${f}`).join("\n"));
  process.exit(1);
}
console.log("\nLay reactions: all checks pass");

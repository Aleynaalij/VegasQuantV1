// Emoji reactions on Zone posts, against #206's versioned contract (community_reaction_state /
// set_community_reaction). Synthetic only: both RPCs are answered here; no real reactions are written.
// Needs the app on :3100 built with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 and
// scripts/ui-smoke/stub.mjs running (see check.mjs).
// Negative control: UI_SMOKE_NEGATIVE=wrong-post answers every write for a different post, which the
// app must refuse, so the "reaction saved" assertions must fail.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");

const BASE = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const UID = "00000000-0000-0000-0000-000000000001";
const POST = "c1"; // the stub's sample post
const NEG = process.env.UI_SMOKE_NEGATIVE || "";
const types = ["heart", "celebrate", "fire", "thinking"];
const stateOf = (mine, others) => {
  const counts = { ...others };
  if (mine) counts[mine] = (counts[mine] || 0) + 1;
  const full = Object.fromEntries(types.map((t) => [t, counts[t] || 0]));
  return { version: 1, post_id: POST, total: Object.values(full).reduce((a, b) => a + b, 0), counts: full, mine };
};
const OTHERS = { heart: 1, fire: 1 }; // two other members' reactions

const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {});
const failures = [];
async function open(name, { available = true, failWrites = 0, malformed = false, slow = 0 } = {}, run) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await ctx.addInitScript((uid) => {
    localStorage.setItem(`vq-app-refresh:${uid}`, "gold-2026-10-22-v2");
    localStorage.setItem(`vq-push-prompt:${uid}`, String(Date.now() + 7 * 86400000));
    sessionStorage.setItem("vq-prompt-shown", "fixture");
    localStorage.setItem("sb-127-auth-token", JSON.stringify({
      access_token: "smoke", refresh_token: "smoke", token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400,
      user: { id: uid, aud: "authenticated", role: "authenticated", email: "smoke@example.com", app_metadata: {}, user_metadata: { vq_welcome_version: 1 } },
    }));
  }, UID);
  let mine = null, writes = [], failLeft = failWrites;
  await ctx.route("**/rest/v1/rpc/community_reaction_state*", (r) =>
    available ? r.fulfill({ json: stateOf(mine, OTHERS) }) : r.fulfill({ status: 404, json: { code: "PGRST202", message: "Could not find the function" } }));
  await ctx.route("**/rest/v1/rpc/set_community_reaction*", async (r) => {
    const want = r.request().postDataJSON().p_reaction;
    writes.push(want);
    if (slow) await new Promise((res) => setTimeout(res, slow));
    if (failLeft-- > 0) return r.fulfill({ status: 500, json: { message: "synthetic failure" } });
    if (malformed) return r.fulfill({ json: { ...stateOf(want, OTHERS), total: 99 } });
    mine = want;
    const s = stateOf(mine, OTHERS);
    return r.fulfill({ json: NEG === "wrong-post" ? { ...s, post_id: "some-other-post" } : s });
  });
  await ctx.route("**/rest/v1/rpc/notification_inbox*", (r) => r.fulfill({ json: { items: [], snapshot_at: new Date().toISOString() } }));
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const before = failures.length;
  const fail = (m) => failures.push(`${name}: ${m}`);
  try {
    await page.goto(BASE + "/community", { waitUntil: "networkidle" });
    await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
    await page.getByRole("button", { name: "React with an emoji" }).first().click();
    await run({ page, fail, writes: () => writes });
  } catch (e) {
    fail(`threw · ${String(e).split("\n")[0].slice(0, 200)}`);
  }
  if (errors.length) fail(`page error · ${errors[0].slice(0, 160)}`);
  console.log(`${failures.length > before ? "FAIL" : "ok  "} ${name}`);
  await ctx.close();
}
const choice = (page, name) => page.getByRole("group", { name: "Reactions" }).getByRole("button", { name: new RegExp(`^${name},`) });
const pressed = (page, name) => choice(page, name).getAttribute("aria-pressed");
const likeCount = (page) => page.locator(".zone-actions").first().locator("button").first().innerText();

await open("API not available yet: says so, and Like keeps working", { available: false }, async ({ page, fail }) => {
  await page.getByText("Emoji reactions aren’t available yet. Like still works.").waitFor().catch(() => fail("unavailable state not shown"));
  if (await page.getByRole("group", { name: "Reactions" }).getByRole("button", { name: /Celebrate/ }).count()) fail("emoji choices offered although the API is unavailable");
  if (!(await page.getByRole("button", { name: /^(Like|Unlike)$/ }).first().count())) fail("Like button is gone");
});

await open("choose, change and remove use the exact desired value and canonical counts", {}, async ({ page, fail, writes }) => {
  await choice(page, "Celebrate").waitFor();
  if (!/Celebrate, 0 people/.test(await choice(page, "Celebrate").getAttribute("aria-label"))) fail("counts not shown per type");
  await choice(page, "Celebrate").click();
  await page.waitForFunction(() => document.querySelector('[aria-label^="Celebrate,"]')?.getAttribute("aria-pressed") === "true", null, { timeout: 5000 }).catch(() => fail("Celebrate not shown as selected after saving"));
  if (!/3/.test(await likeCount(page))) fail(`post total not updated to the server's 3 (shows "${await likeCount(page)}")`);
  await choice(page, "Fire").click();
  await page.waitForFunction(() => document.querySelector('[aria-label^="Fire,"]')?.getAttribute("aria-pressed") === "true", null, { timeout: 5000 }).catch(() => fail("change to Fire not shown"));
  if ((await pressed(page, "Celebrate")) !== "false") fail("Celebrate still selected after changing to Fire (more than one reaction)");
  if (!/Fire, 2 people/.test(await choice(page, "Fire").getAttribute("aria-label"))) fail("Fire count is not the canonical 2");
  await choice(page, "Fire").click(); // same choice removes
  await page.waitForFunction(() => document.querySelector('[aria-label^="Fire,"]')?.getAttribute("aria-pressed") === "false", null, { timeout: 5000 }).catch(() => fail("tapping the selected reaction did not remove it"));
  if (JSON.stringify(writes()) !== JSON.stringify(["celebrate", "fire", null])) fail(`writes were ${JSON.stringify(writes())}, expected celebrate, fire, null`);
});

await open("a failed save keeps the previous reaction, and Retry sends the same choice", { failWrites: 1 }, async ({ page, fail, writes }) => {
  await choice(page, "Thinking").click();
  await page.getByText("Your reaction didn’t save; it’s unchanged.").waitFor().catch(() => fail("failure not reported"));
  if ((await pressed(page, "Thinking")) !== "false") fail("failed reaction is shown as saved");
  if (!/2/.test(await likeCount(page)) && (await likeCount(page)).trim() !== "") fail("post total changed although the save failed");
  await page.getByRole("button", { name: "Retry" }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label^="Thinking,"]')?.getAttribute("aria-pressed") === "true", null, { timeout: 5000 }).catch(() => fail("Retry did not save Thinking"));
  if (JSON.stringify(writes()) !== JSON.stringify(["thinking", "thinking"])) fail(`retry sent ${JSON.stringify(writes())}, expected the same desired value twice`);
});

await open("double tap while saving sends one change", { slow: 800 }, async ({ page, fail, writes }) => {
  await choice(page, "Celebrate").click();
  await choice(page, "Fire").click({ force: true, timeout: 1000 }).catch(() => {});
  await page.waitForTimeout(1500);
  if (writes().length !== 1) fail(`${writes().length} writes for a double tap`);
});

await open("a malformed server reply is refused, not shown as saved", { malformed: true }, async ({ page, fail }) => {
  await choice(page, "Celebrate").click();
  await page.getByText("Your reaction didn’t save; it’s unchanged.").waitFor().catch(() => fail("malformed reply accepted"));
  if ((await pressed(page, "Celebrate")) !== "false") fail("malformed reply shown as a saved reaction");
});

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} reaction failure(s):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nReactions acceptance passed.");

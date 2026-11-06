// Records and membership presentation (C-D / VQ-C08, C09, C10). Synthetic data only; no purchases,
// entitlement changes or real accounts. Needs the app on :3100 built with
// NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 and scripts/ui-smoke/stub.mjs running (see check.mjs).
// Records: every published selection is accounted for on screen (won, lost, push, void, pending and
// anything awaiting review), plus empty, loading-error and pending-only states.
// Membership: each access state gets its own honest label; complimentary access is never shown as a
// trial; a failed status check never tells a member they are on Free. Controls are named and reachable.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");

const BASE = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const UID = "00000000-0000-0000-0000-000000000001";
const failures = [];
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {});

async function open(name, { signedIn = false, routes = {} }, run) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  if (signedIn)
    await ctx.addInitScript((uid) => {
      localStorage.setItem(`vq-app-refresh:${uid}`, "gold-2026-10-22-v2");
      localStorage.setItem(`vq-push-prompt:${uid}`, String(Date.now() + 7 * 86400000));
      localStorage.setItem("sb-127-auth-token", JSON.stringify({
        access_token: "smoke", refresh_token: "smoke", token_type: "bearer", expires_in: 86400,
        expires_at: Math.floor(Date.now() / 1000) + 86400,
        user: { id: uid, aud: "authenticated", role: "authenticated", email: "smoke@example.com", app_metadata: {}, user_metadata: { vq_welcome_version: 1 } },
      }));
    }, UID);
  await ctx.route("**/rest/v1/rpc/notification_inbox", (r) => r.fulfill({ json: { items: [], snapshot_at: new Date().toISOString() } }));
  for (const [pattern, reply] of Object.entries(routes)) await ctx.route(pattern, reply);
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const before = failures.length;
  const fail = (m) => failures.push(`${name}: ${m}`);
  try {
    await run({ page, fail });
  } catch (e) {
    fail(`threw · ${String(e).split("\n")[0].slice(0, 200)}`);
  }
  if (errors.length) fail(`page error · ${errors[0].slice(0, 160)}`);
  console.log(`${failures.length > before ? "FAIL" : "ok  "} ${name}`);
  await ctx.close();
}
const json = (body, status = 200) => (r) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
const text = (page) => page.evaluate(() => document.body.innerText);

// ---------- Records ----------
const recordRpc = { nhl: "**/rest/v1/rpc/sports_records", ncaab: "**/rest/v1/rpc/sports_records", nba: "**/rest/v1/rpc/nba_editorial_records" };
async function shownCounts(page) {
  return page.locator("dl.sport-record > div").evaluateAll((rows) =>
    Object.fromEntries(rows.map((r) => [r.querySelector("dt").innerText.trim().toLowerCase(), parseInt(r.querySelector("dd").innerText, 10)])));
}
for (const sport of ["nhl", "ncaab", "nba"]) {
  const path = `/${sport}/records`;
  // Real contracts: the five grades partition every published selection; NBA also reports `review`,
  // a subset of pending (result conflict or manual review), which must be visible, not hidden.
  const counts = sport === "nba"
    ? { selections: 10, win: 4, loss: 3, push: 0, void: 1, pending: 2, review: 1 }
    : { selections: 10, win: 4, loss: 3, push: 1, void: 1, pending: 1 };
  await open(`${path}: every published selection is accounted for${sport === "nba" ? ", and review is shown" : ""}`, {
    routes: { [recordRpc[sport]]: json(counts) },
  }, async ({ page, fail }) => {
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    await page.locator("dl.sport-record").waitFor();
    const c = await shownCounts(page);
    const total = Object.values(c).reduce((a, b) => a + b, 0);
    if (total !== counts.selections) fail(`shown counts add up to ${total} of ${counts.selections} published selections (${JSON.stringify(c)})`);
    if (sport === "nba" && !/1 in review/.test(await text(page))) fail("pending selections held for review are not identified");
  });
  await open(`${path}: empty, error and pending-only states`, {
    routes: { [recordRpc[sport]]: async (r) => {
      const n = (globalThis.__recCalls = (globalThis.__recCalls || 0) + 1);
      return n === 1 ? r.fulfill({ json: { selections: 0, win: 0, loss: 0, push: 0, void: 0, pending: 0, review: 0 } }) : r.fulfill({ status: 500, json: { message: "synthetic" } });
    } },
  }, async ({ page, fail }) => {
    globalThis.__recCalls = 0;
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    if (!/have been published yet/i.test(await text(page))) fail("no empty-state message with zero selections");
    await page.reload({ waitUntil: "networkidle" });
    if (!/could not load/i.test(await text(page))) fail("no error message when the record fails to load");
    if (await page.locator("dl.sport-record").count()) fail("counts shown alongside a load error");
  });
}
await open("/nhl/records: pending-only record never shows a win/loss rate", {
  routes: { [recordRpc.nhl]: json({ selections: 2, win: 0, loss: 0, push: 0, void: 0, pending: 2, review: 0 }) },
}, async ({ page, fail }) => {
  await page.goto(BASE + "/nhl/records", { waitUntil: "networkidle" });
  await page.locator("dl.sport-record").waitFor();
  if (/%|win rate|hit rate/i.test(await text(page))) fail("a rate is shown with nothing graded yet");
});

// ---------- Membership ----------
const future = new Date(Date.now() + 10 * 86400000).toISOString();
const states = [
  ["free (no access)", { allowed: false, admin: false, member_code: null, expires_at: null }, /Free Community/, [/Premium research active/, /Complimentary/]],
  ["14-day trial", { allowed: true, admin: false, member_code: "S", trial_active: true, trial_expires_at: future, expires_at: future }, /14-day signup trial/, [/Complimentary/, /Free Community ·/]],
  ["complimentary", { allowed: true, admin: false, member_code: "S", complimentary_premium: true, expires_at: null }, /Complimentary Premium active/, [/trial included/i, /Free Community ·/]],
  ["complimentary that also carries a trial flag", { allowed: true, admin: false, member_code: "S", complimentary_premium: true, trial_active: true, trial_expires_at: future, expires_at: null }, /Complimentary Premium active/, [/trial included/i]],
  ["paid pass", { allowed: true, admin: false, member_code: "S", expires_at: future }, /Premium research active · Expires/, [/Complimentary/, /trial included/i, /Free Community ·/]],
  ["expired pass", { allowed: false, admin: false, member_code: null, expires_at: null }, /Free Community/, [/Premium research active/]],
];
for (const [name, access, want, never] of states)
  await open(`/membership: ${name}`, { signedIn: true, routes: { "**/rest/v1/rpc/membership_status": json(access) } }, async ({ page, fail }) => {
    await page.goto(BASE + "/membership", { waitUntil: "networkidle" });
    await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
    const t = await text(page);
    if (!want.test(t)) fail(`expected ${want}`);
    for (const n of never) if (n.test(t)) fail(`must not show ${n}`);
  });

await open("/membership: a failed status check never says the member is on Free, and Retry recovers", {
  signedIn: true, routes: { "**/rest/v1/rpc/membership_status": async (r) => {
    // Fails until the member presses Retry (several components ask; all of them fail until then).
    return globalThis.__statusOk
      ? r.fulfill({ json: { allowed: true, admin: false, member_code: "S", expires_at: future } })
      : r.fulfill({ status: 500, json: { message: "synthetic failure" } });
  } },
}, async ({ page, fail }) => {
  globalThis.__statusOk = false;
  await page.goto(BASE + "/membership", { waitUntil: "networkidle" });
  await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
  const t = await text(page);
  if (/Free Community · Published picks/.test(t)) fail('shows "Free Community" as the member\'s status although the status check failed');
  if (/Premium research active|Complimentary Premium active/.test(t)) fail("claims Premium although the status check failed");
  if (!/couldn.t check your membership/i.test(t)) fail("no message that the membership check failed");
  const retry = page.getByRole("button", { name: /retry/i }).first();
  if (!(await retry.count())) return fail("no Retry after the status check failed");
  globalThis.__statusOk = true;
  await retry.click();
  const recovered = await page.waitForFunction(() => /Premium research active/.test(document.body.innerText), null, { timeout: 15000 }).then(() => true, () => false);
  if (!recovered) fail("Retry did not load the member's real status");
  if (/couldn.t check your membership/i.test(await text(page))) fail("failure message stays after a successful retry");
});

// Truthful availability copy across account states; no entitlement changes.
for (const [name, signedIn, access, status] of [
  ["signed out", false, {}, 200],
  ["ordinary member", true, { allowed: true, admin: false, member_code: "S" }, 200],
  ["status error", true, {}, 500],
  ["admin", true, { allowed: true, admin: true, member_code: "S" }, 200],
])
  await open(`/membership: truthful record and support copy (${name})`, {
    signedIn, routes: { "**/rest/v1/rpc/membership_status": json(access, status) },
  }, async ({ page, fail }) => {
    await page.goto(BASE + "/membership", { waitUntil: "networkidle" });
    if (process.env.UI_SMOKE_NEGATIVE === "record-promise")
      await page.evaluate(() => { const p = document.createElement("p"); p.textContent = "the public official record"; document.body.append(p); });
    const t = await text(page);
    if (/public\s+official record/i.test(t)) fail("promises public official history");
    if (!/records are currently restricted to administrators/i.test(t)) fail("missing record access limitation");
    if (!access.allowed && !/monitored\s+request destination has not yet been confirmed/i.test(t)) fail("missing honest support contact status");
    await page.screenshot({ path: `/tmp/trust-membership-${name.replaceAll(" ", "-")}.png`, fullPage: true });
  });

for (const path of ["/history", "/performance"])
  for (const [name, signedIn, admin] of [["signed out", false, false], ["member", true, false], ["admin", true, true]])
    await open(`${path}: unchanged ${name} access`, { signedIn, routes: { "**/rest/v1/rpc/is_admin": json(admin) } }, async ({ page, fail }) => {
      await page.goto(BASE + path, { waitUntil: "networkidle" });
      if (admin) {
        if (/Records are private/.test(await text(page))) fail("admin record access denied");
      } else if (!/Records are private/.test(await text(page))) fail("restricted record is exposed");
    });

// ---------- Controls: named and keyboard-reachable ----------
for (const [path, signedIn] of [["/membership", true], ["/membership", false], ["/nhl/records", false]])
  await open(`${path}${signedIn ? " signed in" : ""}: controls are named and reachable by keyboard`, { signedIn }, async ({ page, fail }) => {
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
    const unnamed = await page.locator("main button, main a[href], main input, main select").evaluateAll((els) =>
      els.filter((e) => e.offsetParent !== null && e.type !== "hidden")
        .filter((e) => !((e.getAttribute("aria-label") || e.innerText || e.getAttribute("title") || e.labels?.[0]?.innerText || e.getAttribute("placeholder") || "").trim()))
        .map((e) => e.outerHTML.slice(0, 80)));
    if (unnamed.length) fail(`${unnamed.length} control(s) without a name, e.g. ${unnamed[0]}`);
    const reached = new Set();
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press("Tab");
      const tag = await page.evaluate(() => (document.activeElement && document.activeElement !== document.body ? document.activeElement.outerHTML.slice(0, 60) : ""));
      if (tag) reached.add(tag);
    }
    if (reached.size < 3) fail(`keyboard focus reached only ${reached.size} element(s)`);
  });

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} records/membership failure(s):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nRecords and membership presentation passed.");

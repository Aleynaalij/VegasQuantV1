// Your lays → Tailed (/parlays/tailed). Synthetic only: leg_tails and published_legs are answered here.
// Needs the app on :3100 built with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 and
// scripts/ui-smoke/stub.mjs running (see check.mjs).
// Negative control: UI_SMOKE_NEGATIVE=other-account answers account B's tails with account A's
// rows, which the page must never show, so "an account switch shows only the new account's tails"
// must fail.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");

const BASE = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const A = "00000000-0000-0000-0000-000000000001", B = "00000000-0000-0000-0000-000000000002";
const NEG = process.env.UI_SMOKE_NEGATIVE || "";
const soon = new Date(Date.now() + 86400000).toISOString(), past = new Date(Date.now() - 86400000).toISOString();
const leg = (key, kind, name, result, expires) => ({ leg_key: key, kind, name, market: "Sample market", matchup: "SEA @ DEN", release_id: `r-${key}`, result, expires_at: expires });
const PUBLISHED = {
  p1: leg("p1", "PARLAY", "Sample Sunday parlay", null, soon),
  p2: leg("p2", "HAIL_MARY", "Sample Hail Mary", "LOSS", past),
  s1: leg("s1", "SINGLE", "Sample pick", "WIN", past),
  b1: leg("b1", "SINGLE", "Account B pick", null, soon),
  e1: leg("e1", "PARLAY", "Sample locking parlay", null, new Date(Date.now() + 60000).toISOString()),
};
const TAILS = { [A]: ["p1", "p2", "s1"], [B]: ["b1"] };

const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {});
const failures = [];
const token = (uid) => JSON.stringify({ access_token: "smoke", refresh_token: "smoke", token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, user: { id: uid, aud: "authenticated", role: "authenticated", email: "smoke@example.com", app_metadata: {}, user_metadata: { vq_welcome_version: 1 } } });
async function open(name, { uid = A, tails = null, failFirst = 0, noAccess = false, width = 390, hang = false, expired = false, lockInMs = 0, until = "networkidle" } = {}, run) {
  if (lockInMs) PUBLISHED.e1.expires_at = new Date(Date.now() + lockInMs).toISOString();
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: "reduce" });
  await ctx.addInitScript(({ uid, t }) => {
    localStorage.setItem(`vq-app-refresh:${uid || "x"}`, "gold-2026-10-22-v2");
    localStorage.setItem(`vq-push-prompt:${uid || "x"}`, String(Date.now() + 9e8));
    sessionStorage.setItem("vq-prompt-shown", "fixture");
    if (uid && !sessionStorage.getItem("vq-smoke-token")) { localStorage.setItem("sb-127-auth-token", t); sessionStorage.setItem("vq-smoke-token", "1"); }
  }, { uid, t: uid ? (expired ? JSON.stringify({ ...JSON.parse(token(uid)), expires_at: Math.floor(Date.now() / 1000) - 60 }) : token(uid)) : "" });
  // An expired session whose refresh fails: the session lookup itself errors.
  if (expired) await ctx.route("**/auth/v1/token*", (r) => r.fulfill({ status: 500, json: { message: "synthetic auth outage" } }));
  let fails = failFirst;
  const current = () => ctx.pages()[0]?.evaluate(() => JSON.parse(localStorage.getItem("sb-127-auth-token") || "null")?.user?.id).catch(() => null);
  await ctx.route("**/rest/v1/leg_tails*", async (r) => {
    if (hang) return; // never answers
    if (fails-- > 0) return r.fulfill({ status: 500, json: { message: "synthetic failure" } });
    const who = new URL(r.request().url()).searchParams.get("user_id")?.replace("eq.", "") || (await current());
    const keys = tails ?? TAILS[NEG === "other-account" ? A : who] ?? [];
    return r.fulfill({ json: keys.map((k) => ({ leg_key: k })) });
  });
  await ctx.route("**/rest/v1/published_legs*", (r) => {
    if (noAccess) return r.fulfill({ json: [] });
    const m = decodeURIComponent(new URL(r.request().url()).searchParams.get("leg_key") || "").match(/\((.*)\)/);
    const keys = m ? m[1].split(",").map((k) => k.replace(/"/g, "")) : [];
    return r.fulfill({ json: keys.map((k) => PUBLISHED[k]).filter(Boolean) });
  });
  await ctx.route("**/rest/v1/rpc/notification_inbox*", (r) => r.fulfill({ json: { items: [], snapshot_at: new Date().toISOString() } }));
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const before = failures.length;
  const fail = (m) => failures.push(`${name}: ${m}`);
  try {
    await page.goto(BASE + "/parlays/tailed", { waitUntil: until });
    await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
    await run({ page, fail });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (overflow) fail("horizontal overflow");
  } catch (e) {
    fail(`threw · ${String(e).split("\n")[0].slice(0, 200)}`);
  }
  if (errors.length) fail(`page error · ${errors[0].slice(0, 160)}`);
  console.log(`${failures.length > before ? "FAIL" : "ok  "} ${name}`);
  await ctx.close();
}
const main = (page) => page.locator("section.vq-tailed");

for (const width of [360, 390, 1280])
  await open(`@${width}: tailed parlays and picks, grouped, with verified results and links`, { width }, async ({ page, fail }) => {
    await main(page).getByText("Sample Sunday parlay").waitFor();
    const parlays = page.getByRole("region", { name: "Tailed parlays" });
    const picks = page.getByRole("region", { name: "Tailed picks" });
    if (!(await parlays.getByText("Sample Hail Mary").count())) fail("Hail Mary not under parlays");
    if (!(await picks.getByText("Sample pick").count())) fail("single pick not under picks");
    if (!/Open · locks/.test(await parlays.locator("li").first().innerText())) fail("open parlay not shown as open");
    if (!(await parlays.getByText("Lost").count())) fail("settled Hail Mary result missing");
    if (!(await picks.getByText("Won").count())) fail("settled pick result missing");
    const href = await parlays.getByRole("link", { name: /Sample Sunday parlay/ }).getAttribute("href");
    if (href !== "/feed?view=parlays&release=r-p1#release-r-p1") fail(`parlay links to ${href}`);
    const pickHref = await picks.getByRole("link", { name: /Sample pick/ }).getAttribute("href");
    if (pickHref !== "/feed?view=legs&release=r-s1#release-r-s1") fail(`pick links to ${pickHref}`);
    if ((await page.getByRole("link", { name: "Tailed" }).getAttribute("aria-current")) !== "page") fail("Tailed tab not current");
    if ((await page.getByRole("link", { name: "My lays" }).getAttribute("href")) !== "/parlays") fail("My lays tab does not go to /parlays");
  });

await open("signed out: asks to sign in, reads nothing", { uid: null }, async ({ page, fail }) => {
  await main(page).getByText("Sign in to see the picks and parlays you tailed.").waitFor().catch(() => fail("no sign-in state"));
  if (await page.getByRole("region", { name: /Tailed (parlays|picks)/ }).count()) fail("tails shown signed out");
});

await open("nothing tailed yet: explains how, links to published research", { tails: [] }, async ({ page, fail }) => {
  await main(page).getByText("You haven’t tailed anything yet.", { exact: false }).waitFor().catch(() => fail("no empty state"));
  if ((await main(page).getByRole("link", { name: "Open published research" }).getAttribute("href")) !== "/feed?view=latest") fail("empty state does not lead to published research");
});

await open("a failed load says so, and Retry recovers", { failFirst: 1 }, async ({ page, fail }) => {
  await main(page).getByRole("alert").getByText("couldn’t load", { exact: false }).waitFor().catch(() => fail("no error state"));
  await main(page).getByRole("button", { name: "Retry" }).click();
  await main(page).getByText("Sample Sunday parlay").waitFor().catch(() => fail("Retry did not recover"));
});

await open("tails kept, no details readable: honest unavailable state (no asserted reason), no fake rows", { noAccess: true }, async ({ page, fail }) => {
  await main(page).getByText("aren’t available right now", { exact: false }).waitFor().catch(() => fail("no unavailable message"));
  if (!(await main(page).getByRole("button", { name: "Try again" }).count())) fail("no Try again");
  if (!/3 picks/.test(await main(page).innerText())) fail("tail count not shown");
  if (await page.getByRole("region", { name: /Tailed (parlays|picks)/ }).count()) fail("rows shown without access");
});

await open("partly missing details: shown rows plus an honest count, nothing silently dropped", { tails: ["p1", "gone1", "gone2"] }, async ({ page, fail }) => {
  await main(page).getByText("Sample Sunday parlay").waitFor();
  await main(page).getByText("2 more tailed picks couldn’t be shown", { exact: false }).waitFor().catch(() => fail("missing count not reported"));
});

await open("an open parlay stops reading Open at its lock time while the page sits open", { tails: ["e1"], lockInMs: 4000 }, async ({ page, fail }) => {
  const item = page.getByRole("link", { name: /Sample locking parlay/ });
  await item.waitFor();
  if (!/Open · locks/.test(await item.innerText())) fail("not shown as open before the lock");
  await page.waitForFunction(() => /Awaiting the verified result/.test(document.querySelector("section.vq-tailed")?.textContent || ""), null, { timeout: 9000 }).catch(() => fail("still Open after its lock time"));
  if (/Won|Lost/.test(await item.innerText())) fail("a result was inferred at lock time");
});

await open("a request that never answers becomes a recoverable error, not endless Loading", { hang: true, until: "load" }, async ({ page, fail }) => {
  await main(page).getByRole("alert").waitFor({ timeout: 14000 }).catch(() => fail("still loading after the read bound"));
  if (!(await main(page).getByRole("button", { name: "Retry" }).count())) fail("no Retry after a hung read");
});

// A failed session lookup (expired session, refresh fails) is caught first by the app-wide account
// gate ("Checking your account…"), so it never reaches this page; the component also treats a
// session error as an error with Retry rather than signed out (code path, not browser-reachable).
await open("an account switch shows only the new account's tails", {}, async ({ page, fail }) => {
  await main(page).getByText("Sample Sunday parlay").waitFor();
  await page.evaluate((t) => {
    localStorage.setItem("sb-127-auth-token", t);
    new BroadcastChannel("sb-127-auth-token").postMessage({ event: "SIGNED_IN", session: JSON.parse(t) });
  }, token(B));
  await page.waitForTimeout(1500);
  const text = await main(page).innerText();
  if (/Sample Sunday parlay|Sample pick/.test(text)) fail("account A's tails still shown after switching to B");
  if (!/Account B pick/.test(text)) fail("account B's tail not shown");
});

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nTailed lays acceptance passed.");

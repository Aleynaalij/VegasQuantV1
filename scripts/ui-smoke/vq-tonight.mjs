// VQ Tonight (Home daily view) acceptance. Synthetic schedules only: the NBA/NHL/college readers are
// answered by this script; NFL comes from the stub's desk. Clock: 2026-10-14T02:00Z = Oct 13, 10 PM ET.
// Needs the app on :3100 built with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 and
// scripts/ui-smoke/stub.mjs running (see check.mjs).
// Negative control: UI_SMOKE_NEGATIVE=day-ahead moves the browser clock 24 h ahead (as an off-by-one
// day bug would show the wrong day), so the today/tomorrow assertions must fail.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");

const BASE = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const UID = "00000000-0000-0000-0000-000000000001";
const NOW = new Date(Date.parse("2026-10-14T02:00:00Z") + (process.env.UI_SMOKE_NEGATIVE === "day-ahead" ? 86400000 : 0));
const nhlGame = (id, slug, start, extra = {}) => ({ id, slug, start_time: start, start_time_tbd: false, status: "STATUS_SCHEDULED", away: { name: `Sample Away ${id}`, short_name: `Away${id}` }, home: { name: `Sample Home ${id}`, short_name: `Home${id}` }, ...extra });
const schedules = {
  nhl: { version: 1, games: [
    nhlGame("n1", "sample-nhl-tonight", "2026-10-14T02:30:00Z"), // 10:30 PM ET, Oct 13: today
    nhlGame("n2", "sample-nhl-after-midnight", "2026-10-14T04:30:00Z"), // 12:30 AM ET, Oct 14: tomorrow (same UTC date as now)
    nhlGame("n3", "sample-nhl-tbd", "2026-10-13T16:00:00Z", { start_time_tbd: true }),
  ] },
  ncaab: { version: 1, games: [nhlGame("c1", "sample-college-tonight", "2026-10-14T01:00:00Z")] },
};
const nba = [
  { id: "b1", slug: "sample-nba-final", away_team: "Sample Celtics", home_team: "Sample Knicks", tipoff: "2026-10-13T23:30:00Z", tipoff_tbd: false, status: "STATUS_FINAL" },
];

const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {});
const failures = [];
const homeLegs = [{ leg_key: "tonight:0", name: "Sample Runner", market: "Full game · 60+ rushing yards", game_id: "g1", quote: null, expires_at: "2026-10-16T00:15:00Z", result: null, copy_text: "Sample Runner 60+ rushing yards", gambly_url: null, why: "w", risk: "r" }];
async function open(name, { width = 390, signedIn = false, draft = null, empty = false, collegeFailsOnce = false, refresh = null } = {}, run) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: "reduce" });
  await ctx.addInitScript(({ uid, signedIn, draft }) => {
    localStorage.setItem(`vq-app-refresh:${uid}`, "gold-2026-10-22-v2");
    localStorage.setItem(`vq-push-prompt:${uid}`, String(Date.now() + 7 * 86400000));
    sessionStorage.setItem("vq-prompt-shown", "fixture");
    if (draft) sessionStorage.setItem(`vq-parlay-draft:${uid}`, JSON.stringify({ title: "My parlay", keys: draft }));
    if (signedIn)
      localStorage.setItem("sb-127-auth-token", JSON.stringify({
        access_token: "smoke", refresh_token: "smoke", token_type: "bearer", expires_in: 30 * 86400,
        expires_at: Math.floor(Date.now() / 1000) + 30 * 86400,
        user: { id: uid, aud: "authenticated", role: "authenticated", email: "smoke@example.com", app_metadata: {}, user_metadata: { vq_welcome_version: 1 } },
      }));
  }, { uid: UID, signedIn, draft });
  let collegeCalls = 0, nhlCalls = 0;
  await ctx.route("**/rest/v1/rpc/sports_home*", (r) => {
    const sport = r.request().postDataJSON()?.p_sport;
    if (sport === "ncaab" && collegeFailsOnce && collegeCalls++ === 0) return r.fulfill({ status: 500, json: { message: "synthetic failure" } });
    if (refresh && sport === "ncaab" && collegeCalls++ > 0) return r.fulfill({ status: 500, json: { message: "synthetic refresh failure" } });
    if (refresh && sport === "nhl" && nhlCalls++ > 0)
      return r.fulfill({ json: { version: 1, games: schedules.nhl.games.map((g) => (g.id === "n1" ? { ...g, status: "STATUS_FINAL" } : g)) } });
    return r.fulfill({ json: empty ? { version: 1, games: [] } : schedules[sport] ?? { version: 1, games: [] } });
  });
  await ctx.route("**/rest/v1/published_legs*", (r) => r.fulfill({ json: signedIn ? homeLegs : [] }));
  await ctx.route("**/rest/v1/nba_games*", (r) => r.fulfill({ json: empty ? [] : nba }));
  await ctx.route("**/rest/v1/rpc/notification_inbox*", (r) => r.fulfill({ json: { items: [], snapshot_at: NOW.toISOString() } }));
  const page = await ctx.newPage();
  page.setDefaultTimeout(12000);
  if (refresh) {
    await page.clock.install({ time: NOW });
    await page.clock.resume();
  } else await page.clock.setFixedTime(NOW);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const before = failures.length;
  const fail = (m) => failures.push(`${name}: ${m}`);
  try {
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
    await page.locator(".vq-tonight").waitFor();
    await run({ page, fail });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) fail("sideways scroll");
  } catch (e) {
    fail(`threw · ${String(e).split("\n")[0].slice(0, 200)}`);
  }
  if (errors.length) fail(`page error · ${errors[0].slice(0, 160)}`);
  console.log(`${failures.length > before ? "FAIL" : "ok  "} ${name}`);
  await ctx.close();
}
const tonight = (page) => page.locator(".vq-tonight");
const text = async (page) => tonight(page).innerText();

for (const width of [360, 390, 1280])
  await open(`@${width} signed out: today's games on the ET day, with routes and states`, { width, collegeFailsOnce: true }, async ({ page, fail }) => {
    const t0 = await text(page);
    if (!/Today · Tue, Oct 13 · Eastern time/.test(t0)) fail(`day label is not Oct 13 ET (${t0.split("\n").slice(0, 2).join(" | ")})`);
    if (await tonight(page).getByText(/Tue, Oct 13/).count() !== 1) fail("day label repeated or missing");
    const game = tonight(page).getByRole("link", { name: /AwayN1 at HomeN1/i });
    if ((await game.count()) !== 1) fail("10:30 PM ET game is not listed for today");
    else if ((await game.getAttribute("href")) !== "/nhl/games/sample-nhl-tonight") fail("game does not link to its NHL page");
    if (await tonight(page).getByText(/AwayN2/i).count()) fail("12:30 AM ET game (tomorrow in ET, today in UTC) is listed as today");
    if (!/Time not confirmed/.test(t0)) fail("unconfirmed start time is not labelled");
    if (!(await tonight(page).getByRole("link", { name: /Sample Celtics at Sample Knicks, Final/ }).count())) fail("NBA final is not labelled Final");
    if (await tonight(page).getByText("Sample Seahawks").count()) fail("an NFL game from another day is listed");
    // College failed: an alert with Retry, and Retry brings its game in.
    const alert = tonight(page).getByRole("alert");
    if (!(await alert.count()) || !/NCAAB games could not load/.test(await alert.innerText())) fail("college load failure is not reported");
    else {
      await alert.getByRole("button", { name: "Retry" }).click();
      const back = await tonight(page).getByRole("link", { name: /AwayC1 at HomeC1/i }).waitFor().then(() => true, () => false);
      if (!back) fail("Retry did not load the college game");
      if (await tonight(page).getByRole("alert").count()) fail("alert stays after a successful retry");
    }
    const zone = tonight(page).getByRole("link", { name: /The Zone · sign in/ });
    if ((await zone.getAttribute("href")) !== "/membership") fail("signed-out Zone card does not lead to sign-in");
    for (const box of await tonight(page).locator("a, button").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height)))
      if (box > 0 && box < 44) { fail(`touch target ${Math.round(box)}px tall`); break; }
  });

await open("signed in with a lay in progress", { signedIn: true, draft: ["k1", "k2"] }, async ({ page, fail }) => {
  const lay = tonight(page).getByRole("link", { name: /Continue your lay · 2 selected/ });
  if (!(await lay.count())) fail("lay in progress is not offered");
  else if ((await lay.getAttribute("href")) !== "/parlays") fail("lay link does not go to /parlays");
  const zone = tonight(page).getByRole("link", { name: /^The Zone/ });
  if ((await zone.getAttribute("href")) !== "/community") fail("signed-in Zone card does not go to /community");
});

await open("lay card follows selections on Home without a reload", { signedIn: true }, async ({ page, fail }) => {
  const card = () => tonight(page).locator(".vq-tonight-next a").first();
  if (!/Your lays/.test(await card().innerText())) fail("lay card does not start as Your lays with no draft");
  await page.locator("details.vq-game-row").first().locator("summary").click();
  await page.getByRole("button", { name: /Sample Runner/ }).first().click();
  await page.getByRole("button", { name: "Add to your lay" }).click();
  const added = await page.waitForFunction(() => /Continue your lay · 1 selected/.test(document.querySelector(".vq-tonight-next a")?.textContent || ""), null, { timeout: 5000 }).then(() => true, () => false);
  if (!added) fail("lay card did not update after adding a pick on Home");
  await page.getByRole("button", { name: /Added to your lay/ }).click();
  const removed = await page.waitForFunction(() => /Your lays/.test(document.querySelector(".vq-tonight-next a")?.textContent || ""), null, { timeout: 5000 }).then(() => true, () => false);
  if (!removed) fail("lay card did not update after removing the pick");
});

await open("lay card follows an account switch without a reload", { signedIn: true, draft: ["k1"] }, async ({ page, fail }) => {
  await page.addInitScript(() => {});
  await page.evaluate((b) => sessionStorage.setItem(`vq-parlay-draft:${b}`, JSON.stringify({ title: "B", keys: ["k2", "k3"] })), "00000000-0000-0000-0000-000000000002");
  const text = () => tonight(page).locator(".vq-tonight-next").innerText();
  if (!/1 selected/.test(await text())) fail("account A's lay is not shown");
  const broadcast = (event, user) => page.evaluate(({ event, user }) => {
    const session = user ? { access_token: "smoke", refresh_token: "smoke", token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, user: { id: user, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: { vq_welcome_version: 1 } } } : null;
    if (session) localStorage.setItem("sb-127-auth-token", JSON.stringify(session)); else localStorage.removeItem("sb-127-auth-token");
    new BroadcastChannel("sb-127-auth-token").postMessage({ event, session });
  }, { event, user });
  await broadcast("SIGNED_OUT", null);
  await page.waitForTimeout(800);
  if (/selected/.test(await text())) fail("signed-out Home still shows account A's lay");
  if (!/The Zone · sign in/.test(await text())) fail("signed-out Zone card does not ask to sign in");
  await broadcast("SIGNED_IN", "00000000-0000-0000-0000-000000000002");
  await page.waitForTimeout(800);
  if (!/2 selected/.test(await text())) fail("account B's own lay is not shown");
});

await open("in-day refresh: a status change appears, a failed refresh keeps the games marked stale", { refresh: true }, async ({ page, fail }) => {
  const t1 = await text(page);
  const checked1 = /Schedules checked ([0-9:]+ [AP]M) ET/.exec(t1)?.[1];
  if (!checked1) fail("no 'Schedules checked' time shown");
  if (/updated|live/i.test(t1)) fail("fetch time is presented as source freshness");
  await page.clock.fastForward("05:05");
  const final = await tonight(page).getByRole("link", { name: /AwayN1 at HomeN1, Final/i }).waitFor({ timeout: 8000 }).then(() => true, () => false);
  if (!final) fail("in-day status change (Final) did not appear after the scheduled refresh");
  const t2 = await text(page);
  if (!/Couldn’t refresh NCAAB: showing games as last checked/.test(t2)) fail("failed refresh is not reported as stale");
  if (!(await tonight(page).getByRole("link", { name: /AwayC1 at HomeC1/i }).count())) fail("failed refresh dropped the games it had");
  const checked2 = /Schedules checked ([0-9:]+ [AP]M) ET/.exec(t2)?.[1];
  if (checked2 !== checked1) fail(`checked time moved to ${checked2} although college's refresh failed (it should show the oldest successful check)`);
});

await open("no games today", { empty: true }, async ({ page, fail }) => {
  await tonight(page).getByText("No games are scheduled today.").waitFor().catch(() => fail("no honest empty state"));
  if (await tonight(page).locator(".vq-tonight-game").count()) fail("games listed on an empty day");
});

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} VQ Tonight failure(s):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nVQ Tonight acceptance passed.");

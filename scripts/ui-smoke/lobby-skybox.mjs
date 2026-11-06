// The lobby (/) as designed: skybox headline, sport rooms, the VQ Tonight scoreboard, next moves,
// labelled concepts and the skyline; plus the neutral chrome and legacy NFL links it must keep.
// Synthetic only: NBA/NHL/college schedules are answered here; NFL comes from the stub's desk.
// Needs the app on :3100 built with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 and
// scripts/ui-smoke/stub.mjs running (see check.mjs).
// Negative control: UI_SMOKE_NEGATIVE=concept-link turns a concept card into a link and points
// Research at the wrong page in the browser, so "concepts are not links" and the next-move hrefs
// must fail.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");

const BASE = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const UID = "00000000-0000-0000-0000-000000000001";
const NEG = process.env.UI_SMOKE_NEGATIVE || "";
const SHOTS = process.env.UI_SMOKE_SHOTS || "";
const soon = (min) => new Date(Date.now() + min * 60000).toISOString();
// Six games later today, ET, deliberately out of order across sports.
const NBA = [["Sample Away A", "Sample Home A", 200], ["Sample Away B", "Sample Home B", 80]].map(([a, h, m], i) => ({ id: `n${i}`, slug: `sample-nba-${i}`, away_team: a, home_team: h, tipoff: soon(m), tipoff_tbd: false, status: null }));
const sportsHome = (sport, rows) => ({ version: 1, sport, games: rows.map(([a, h, m], i) => ({ id: `${sport}${i}`, slug: `sample-${sport}-${i}`, start_time: soon(m), start_time_tbd: false, status: null, away: { short_name: a }, home: { short_name: h } })) });
const NHL = sportsHome("nhl", [["Sample Away C", "Sample Home C", 40], ["Sample Away D", "Sample Home D", 260]]);
const CBB = sportsHome("ncaab", [["Sample Away E", "Sample Home E", 20], ["Sample Away F", "Sample Home F", 140]]);
// Expected board order: by start time.
const ORDER = ["Sample Away E", "Sample Away C", "Sample Away B", "Sample Away F", "Sample Away A", "Sample Away D"];

const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {});
const failures = [];
const token = JSON.stringify({ access_token: "smoke", refresh_token: "smoke", token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, user: { id: UID, aud: "authenticated", role: "authenticated", email: "smoke@example.com", app_metadata: {}, user_metadata: { vq_welcome_version: 1 } } });

async function open(name, { signedIn = false, width = 390, schedules = "games", draft = 0 } = {}, run) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: "reduce" });
  await ctx.addInitScript(({ uid, t, draft }) => {
    localStorage.setItem(`vq-app-refresh:${uid}`, "gold-2026-10-22-v2");
    localStorage.setItem(`vq-push-prompt:${uid}`, String(Date.now() + 9e8));
    sessionStorage.setItem("vq-prompt-shown", "fixture");
    if (t) localStorage.setItem("sb-127-auth-token", t);
    if (draft) sessionStorage.setItem(`vq-parlay-draft:${uid}`, JSON.stringify({ keys: Array.from({ length: draft }, (_, i) => `leg-${i}`) }));
  }, { uid: UID, t: signedIn ? token : "", draft });
  const empty = schedules === "empty";
  await ctx.route("**/rest/v1/nba_games*", (r) => r.fulfill({ json: empty ? [] : NBA }));
  await ctx.route("**/rest/v1/rpc/sports_home*", (r) => {
    const sport = r.request().postDataJSON()?.p_sport;
    if (schedules === "college-fails" && sport === "ncaab") return r.fulfill({ status: 500, json: { message: "synthetic outage" } });
    const body = sport === "nhl" ? NHL : CBB;
    return r.fulfill({ json: empty ? { ...body, games: [] } : body });
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const before = failures.length;
  const fail = (m) => failures.push(`${name}: ${m}`);
  try {
    await run({ page, fail });
  } catch (e) {
    fail(`threw · ${String(e).split("\n")[0].slice(0, 180)}`);
  }
  if (errors.length) fail(`page error · ${errors[0].slice(0, 140)}`);
  console.log(`${failures.length > before ? "FAIL" : "ok  "} ${name}`);
  await ctx.close();
}
const lobby = async (page) => {
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.locator(".vq-brand-opening").waitFor({ state: "hidden" }).catch(() => {});
  await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
  if (NEG === "concept-link")
    await page.evaluate(() => {
      const card = document.querySelector(".vq-intel-card");
      if (card) card.innerHTML = `<a href="/simulator">${card.innerHTML}</a>`;
      document.querySelector("a.vq-move")?.setAttribute("href", "/matchups");
    });
};
const board = (page) => page.locator("section.vq-board");
const rowTeams = (page) => board(page).locator("a.vq-board-row .vq-board-match b:first-child").allInnerTexts();

for (const signedIn of [false, true])
  for (const width of [360, 390, 1280])
    await open(`@${width} ${signedIn ? "signed in" : "signed out"}: the designed lobby, neutral chrome, real links`, { signedIn, width }, async ({ page, fail }) => {
      await lobby(page);
      const h1 = await page.getByRole("heading", { level: 1 }).innerText();
      if (h1.replace(/\s+/g, " ").trim() !== "Your sports research starts here.") fail(`h1 "${h1}"`);
      for (const rule of ["Sports rooms", "Your next move", "VQ Intelligence"])
        if (!(await page.getByRole("heading", { name: rule, exact: true }).count())) fail(`no "${rule}" section`);
      const c = await page.evaluate(() => ({
        selected: [...document.querySelectorAll("nav.sport-switch a[aria-current=page]")].length,
        home: [...document.querySelectorAll("nav[aria-label='Main navigation'] a[aria-current=page]")].map((a) => a.textContent.trim()),
        rooms: [...document.querySelectorAll("nav[aria-label='Sport desks'] a.vq-room")].map((a) => [a.textContent.trim(), a.getAttribute("href")]),
        all: document.querySelector("a.vq-rooms-all")?.getAttribute("href"),
        moves: [...document.querySelectorAll("a.vq-move")].map((a) => [a.textContent.trim(), a.getAttribute("href")]),
        conceptLinks: document.querySelectorAll(".vq-intel a").length,
        concepts: [...document.querySelectorAll(".vq-intel-card")].map((c) => c.textContent),
        skyline: document.querySelector(".vq-skyline")?.getAttribute("aria-hidden"),
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        edge: document.body.innerText.includes("MINIMUM EDGE"),
        small: [...document.querySelectorAll(".vq-skybox a, .vq-skybox button")].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width && r.height < 44;
        }).map((el) => el.textContent.trim().slice(0, 30)),
      }));
      if (c.selected) fail("a sport chip is selected on the lobby");
      if (!c.home.some((t) => /Home/.test(t))) fail("Home tab not current");
      if (c.edge) fail("NFL-only MINIMUM EDGE card on the lobby");
      if (c.overflow) fail("horizontal overflow");
      const rooms = Object.fromEntries(c.rooms);
      if (rooms.NFL !== "/nfl" || rooms.NBA !== "/nba" || rooms["College Basketball"] !== "/ncaab") fail(`rooms ${JSON.stringify(c.rooms)}`);
      if (c.all !== "#vq-tonight") fail(`All Sports goes to ${c.all}`);
      const moves = Object.fromEntries(c.moves.map(([t, h]) => [t.split(/\d| selected|Sign in/)[0].trim(), h]));
      if (moves.Research !== "/feed?view=latest") fail(`Research → ${moves.Research}`);
      if (moves["Your Lays"] !== "/parlays") fail(`Your Lays → ${moves["Your Lays"]}`);
      if (moves["The Zone"] !== (signedIn ? "/community" : "/membership")) fail(`The Zone → ${moves["The Zone"]}`);
      if (c.conceptLinks) fail("a concept card is a link (Simulator / Fear Index aren't member pages)");
      if (c.concepts.length !== 2 || !c.concepts.every((t) => /Concept/.test(t) && /Not available/.test(t))) fail("concepts not both labelled Concept / not available");
      if (c.skyline !== "true") fail("skyline not hidden from assistive tech");
      if (c.small.length) fail(`touch targets under 44px: ${c.small.join(" | ")}`);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/lobby-${signedIn ? "in" : "out"}-${width}.png`, fullPage: true });
    });

await open("scoreboard: next games across sports in start order; See all expands in place", {}, async ({ page, fail }) => {
  await lobby(page);
  await board(page).locator("a.vq-board-row").first().waitFor();
  await page.waitForFunction(() => document.querySelectorAll("a.vq-board-row").length >= 4);
  const first = await rowTeams(page);
  if (JSON.stringify(first) !== JSON.stringify(ORDER.slice(0, 4))) fail(`first rows ${JSON.stringify(first)}`);
  const firstHref = await board(page).locator("a.vq-board-row").first().getAttribute("href");
  if (firstHref !== "/ncaab/games/sample-ncaab-0") fail(`first row opens ${firstHref}`);
  if ((await board(page).locator(".vq-board-badge").first().innerText()) !== "NCAAB") fail("first row badge is not its sport");
  const all = board(page).getByRole("button", { name: /See all 6 games/ });
  if ((await all.getAttribute("aria-expanded")) !== "false") fail("See all not collapsed at first");
  await all.click();
  if (JSON.stringify(await rowTeams(page)) !== JSON.stringify(ORDER)) fail("See all doesn't show every game in order");
  if ((await board(page).getByRole("button", { name: "Show fewer games" }).getAttribute("aria-expanded")) !== "true") fail("expanded state not announced");
  if (!/Schedules checked/.test(await board(page).innerText())) fail("no checked-at time");
});
await open("scoreboard: All Sports jumps to the board", { width: 390 }, async ({ page, fail }) => {
  await lobby(page);
  await page.locator("a.vq-rooms-all").click();
  await page.waitForTimeout(400);
  const top = await board(page).evaluate((el) => el.getBoundingClientRect().top);
  if (top < -5 || top > 200) fail(`board not brought into view (top ${top}px)`);
});
await open("scoreboard: an empty day says so (no sample games)", { schedules: "empty" }, async ({ page, fail }) => {
  await lobby(page);
  await board(page).getByText("No games are scheduled today.").waitFor().catch(() => fail("no empty-day message"));
  if (await board(page).locator("a.vq-board-row").count()) fail("rows on an empty day");
});
await open("scoreboard: a sport that fails says so, with Retry, and the rest still show", { schedules: "college-fails" }, async ({ page, fail }) => {
  await lobby(page);
  await board(page).getByRole("alert").getByText(/NCAAB games could not load/).waitFor().catch(() => fail("no failure alert"));
  if (!(await board(page).getByRole("alert").getByRole("button", { name: "Retry" }).count())) fail("no Retry");
  if (!(await board(page).locator("a.vq-board-row").count())) fail("other sports hidden by one failure");
});
await open("Your Lays carries the lay in progress (this account's draft only)", { signedIn: true, draft: 3 }, async ({ page, fail }) => {
  await lobby(page);
  const lays = page.locator("a.vq-move", { hasText: "Your Lays" });
  await page.waitForFunction(() => /3 selected/.test(document.querySelector("a.vq-move[href='/parlays']")?.textContent || "")).catch(() => fail("draft count not shown"));
  if (!/continue your lay, 3 selected/.test((await lays.getAttribute("aria-label")) || "")) fail("draft not in the accessible name");
});
await open("the NFL desk keeps the VQ Tonight list (no scoreboard)", { signedIn: true }, async ({ page, fail }) => {
  await page.goto(BASE + "/nfl", { waitUntil: "networkidle" });
  if (await page.locator("section.vq-board").count()) fail("scoreboard on the NFL desk");
  if (!(await page.locator("section.vq-tonight .vq-tonight-next").count())) fail("NFL desk lost its VQ Tonight next-step cards");
});
await open("rooms and brand: lobby → /nfl → NBA chip → lobby, Back/Forward", { signedIn: true }, async ({ page }) => {
  await lobby(page);
  await page.locator("a.vq-room[href='/nfl']").click();
  await page.waitForURL("**/nfl");
  await page.locator("nav.sport-switch a[href='/nba']").click();
  await page.waitForURL("**/nba");
  await page.locator("a.mobile-brand").click();
  await page.waitForURL((u) => new URL(u).pathname === "/");
  await page.goBack();
  await page.waitForURL("**/nba");
  await page.goBack();
  await page.waitForURL("**/nfl");
  await page.goForward();
  await page.waitForURL("**/nba");
});
await open("old link /?game=<slug>&utm=x → /nfl with the game and params", {}, async ({ page, fail }) => {
  await page.goto(BASE + "/?game=sample-sea-den-2026-10-15&utm=x", { waitUntil: "networkidle" });
  const u = new URL(page.url());
  if (u.pathname !== "/nfl" || u.searchParams.get("game") !== "sample-sea-den-2026-10-15" || u.searchParams.get("utm") !== "x" || u.hash !== "#home-games") fail(`landed on ${page.url()}`);
});
await open("old hash-only link /#home-games → /nfl, Back does not loop", {}, async ({ page, fail }) => {
  await page.goto(BASE + "/about", { waitUntil: "networkidle" });
  await page.goto(BASE + "/#home-games", { waitUntil: "networkidle" });
  await page.waitForURL("**/nfl#home-games", { timeout: 8000 }).catch(() => fail(`stayed on ${page.url()}`));
  await page.goBack();
  await page.waitForTimeout(800);
  if (!page.url().endsWith("/about")) fail(`Back went to ${page.url()}`);
});

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nLobby skybox acceptance passed.");

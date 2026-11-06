// Spinning VQ Skybox acceptance. Synthetic schedules only ("Sample …"): NBA/NHL/college readers are
// answered by this script; NFL comes from the stub's server-rendered desk (g1 kicks off 8:15 PM ET on
// Oct 15). Clock: 2026-10-15T16:00Z = Thu Oct 15, 12:00 PM ET.
// Needs the app on :3100 built with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 and
// scripts/ui-smoke/stub.mjs running (see check.mjs).
// Screenshots: UI_SMOKE_SHOTS=<dir>. Only some cases: UI_SMOKE_ONLY=name,name.
// Negative control: UI_SMOKE_NEGATIVE=failures-as-empty answers every failing feed with an empty
// schedule instead, as a bug that turns a source failure into "no games" would show. The
// unavailable-state assertions must then fail ("shows unavailable, not no games").
import fs from "node:fs";
import path from "node:path";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");

const BASE = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const STUB = process.env.UI_SMOKE_STUB || "http://127.0.0.1:54321";
const SHOTS = process.env.UI_SMOKE_SHOTS || "";
const ONLY = (process.env.UI_SMOKE_ONLY || "").split(",").filter(Boolean);
const NEG = process.env.UI_SMOKE_NEGATIVE || "";
const UID = "00000000-0000-0000-0000-000000000001";
const NOW = new Date("2026-10-15T16:00:00Z");
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const team = (id, n) => ({ name: `Sample ${n} ${id}`, short_name: `${n}${id}` });
const sh = (id, slug, start, extra = {}) => ({ id, slug, start_time: start, start_time_tbd: false, status: "STATUS_SCHEDULED", away: team(id, "Away"), home: team(id, "Home"), ...extra });
const schedules = {
  nhl: { version: 1, games: [
    sh("n2", "sample-nhl-late", "2026-10-16T02:00:00Z"), // 10:00 PM ET
    sh("n1", "sample-nhl-early", "2026-10-15T23:00:00Z"), // 7:00 PM ET
    sh("n9", "sample-nhl-tomorrow", "2026-10-16T05:00:00Z"), // 1:00 AM Oct 16: not today
  ] },
  ncaab: { version: 1, games: [sh("c1", "sample-college-tonight", "2026-10-16T00:00:00Z")] },
};
const nba = [
  { id: "b4", slug: "sample-nba-late", away_team: "Sample Suns", home_team: "Sample Lakers", tipoff: "2026-10-16T02:30:00Z", tipoff_tbd: false, status: "STATUS_SCHEDULED" },
  { id: "b1", slug: "sample-nba-final", away_team: "Sample Celtics", home_team: "Sample Knicks", tipoff: "2026-10-15T14:00:00Z", tipoff_tbd: false, status: "STATUS_FINAL" },
  { id: "b2", slug: "sample-nba-progress", away_team: "Sample Bulls", home_team: "Sample Heat", tipoff: "2026-10-15T15:30:00Z", tipoff_tbd: false, status: "STATUS_IN_PROGRESS" },
  { id: "b3", slug: "sample-nba-evening", away_team: "Sample Nets", home_team: "Sample Magic", tipoff: "2026-10-15T23:30:00Z", tipoff_tbd: false, status: "STATUS_SCHEDULED" },
  { id: "b5", slug: "sample-nba-tbd", away_team: "Sample Jazz", home_team: "Sample Kings", tipoff: "2026-10-15T20:00:00Z", tipoff_tbd: true, status: null },
];
// Chronological order the NBA face must show (b5's time is unconfirmed but its date is today).
const NBA_ORDER = ["sample-nba-final", "sample-nba-progress", "sample-nba-tbd", "sample-nba-evening", "sample-nba-late"];

const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {});
const failures = [];
const passed = [];
const stub = (q) => fetch(`${STUB}/__stub/desk?${q}`).then((r) => r.json());

async function open(name, opts, run) {
  if (ONLY.length && !ONLY.includes(name)) return;
  const {
    width = 390, height = 844, reduced = false, touch = false, signedIn = false, held = false,
    fail = [], empty = [], deskFails = false, nbaDelay = 0, nbaRefreshFails = false, clock = "fixed", at = NOW,
  } = opts;
  await stub(`fail=${deskFails ? 1 : 0}`);
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: reduced ? "reduce" : "no-preference", hasTouch: touch, isMobile: touch });
  await ctx.addInitScript(({ uid, signedIn }) => {
    localStorage.setItem(`vq-app-refresh:${uid}`, "gold-2026-10-22-v2");
    localStorage.setItem(`vq-push-prompt:${uid}`, String(Date.now() + 7 * 86400000));
    sessionStorage.setItem("vq-prompt-shown", "fixture");
    if (signedIn && !sessionStorage.getItem("fixture-signed-out"))
      localStorage.setItem("sb-127-auth-token", JSON.stringify({
        access_token: "smoke", refresh_token: "smoke", token_type: "bearer", expires_in: 30 * 86400,
        expires_at: Math.floor(Date.now() / 1000) + 30 * 86400,
        user: { id: uid, aud: "authenticated", role: "authenticated", email: "smoke@example.com", app_metadata: {}, user_metadata: { vq_welcome_version: 1 } },
      }));
  }, { uid: UID, signedIn });
  const failing = (s) => fail.includes(s) && NEG !== "failures-as-empty";
  const emptied = (s) => empty.includes(s) || (fail.includes(s) && NEG === "failures-as-empty");
  const calls = { nba: 0, nhl: 0, ncaab: 0 };
  await ctx.route("**/rest/v1/rpc/sports_home*", (route) => {
    const sport = route.request().postDataJSON()?.p_sport;
    if (sport in calls) calls[sport]++;
    if (failing(sport)) return route.fulfill({ status: 500, json: { message: "synthetic failure" } });
    const body = emptied(sport) ? { version: 1, games: [] } : schedules[sport] ?? { version: 1, games: [] };
    return route.fulfill({ json: { ...body, sport } });
  });
  await ctx.route("**/rest/v1/nba_games*", async (route) => {
    const tonight = new URL(route.request().url()).searchParams.get("select") === "id,slug,away_team,home_team,tipoff,tipoff_tbd,status";
    if (!tonight) return route.fulfill({ json: [] });
    calls.nba++;
    if (nbaDelay) await new Promise((r) => setTimeout(r, nbaDelay));
    if (failing("nba") || (nbaRefreshFails && calls.nba > 1)) return route.fulfill({ status: 500, json: { message: "synthetic failure" } }).catch(() => {});
    return route.fulfill({ json: emptied("nba") ? [] : nba }).catch(() => {});
  });
  await ctx.route("**/rest/v1/rpc/frank_anniversary*", (r) => r.fulfill({ json: { state: held ? "offer" : "hidden" } }));
  await ctx.route("**/rest/v1/rpc/notification_inbox*", (r) => r.fulfill({ json: { items: [], snapshot_at: NOW.toISOString() } }));
  await ctx.route("**/rest/v1/published_legs*", (r) => r.fulfill({ json: [] }));
  const page = await ctx.newPage();
  page.setDefaultTimeout(12000);
  if (clock === "fixed") await page.clock.setFixedTime(at);
  else await page.clock.install({ time: at });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const before = failures.length;
  const fail_ = (m) => failures.push(`${name}: ${m}`);
  try {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.locator(".vq-spin").waitFor();
    await run(page, { fail: fail_, calls, ctx, width });
    if (errors.length) fail_(`page errors: ${errors.join(" | ")}`);
  } catch (e) {
    fail_(`threw: ${process.env.UI_SMOKE_VERBOSE ? e.message : e.message.split("\n")[0]}`);
  } finally {
    await ctx.close();
    await stub("fail=0");
  }
  if (failures.length === before) passed.push(name);
  console.log(`${failures.length === before ? "PASS" : "FAIL"} ${name}`);
}

const spin = (page) => page.locator(".vq-spin");
const mode = (page) => spin(page).getAttribute("data-spin-mode");
const frontFace = (page) => page.locator(".vq-spin-face[data-front]");
const shot = async (page, file, el) => {
  if (!SHOTS) return;
  // What a person sees: the Skybox scrolled to the top of the screen, under the app header.
  if (!el) await page.locator("#vq-tonight").evaluate((e) => e.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(700);
  if (el) await el.screenshot({ path: path.join(SHOTS, file), animations: "disabled" });
  else await page.screenshot({ path: path.join(SHOTS, file), animations: "disabled" });
};
async function waitFaces(page, faces) {
  await page.waitForFunction((f) => document.querySelector(".vq-spin")?.getAttribute("data-spin-faces") === f, faces.join(","));
}
async function choose(page, m) {
  await page.locator(`.vq-spin-pick[data-spin-pick="${m}"]`).click();
  await page.waitForFunction((m) => document.querySelector(".vq-spin")?.getAttribute("data-spin-mode") === m, m);
  await page.waitForTimeout(650); // let the turn settle before touching the face
}
/** Exactly one face is interactive and announced; every other face is inert and hidden. */
async function onlyFrontInteractive(page, fail) {
  const r = await page.evaluate(() => {
    const faces = [...document.querySelectorAll(".vq-spin-face")];
    const front = faces.filter((f) => f.hasAttribute("data-front"));
    const leak = faces.filter((f) => !f.hasAttribute("data-front") && !(f.inert && f.getAttribute("aria-hidden") === "true"));
    const frontOk = front.length === 1 && !front[0].inert && !front[0].hasAttribute("aria-hidden");
    return { faces: faces.length, front: front.length, frontOk, leak: leak.length, titles: document.querySelectorAll("#vq-tonight-title").length };
  });
  if (!r.frontOk || r.leak || r.titles !== 1) fail(`only the front face may be interactive/announced: ${JSON.stringify(r)}`);
  // Every control in the front face is what a tap at its centre actually hits (3D hit-testing).
  const missed = await page.evaluate(async () => {
    const out = [];
    for (const el of document.querySelectorAll(".vq-spin-face[data-front] :is(a, button)")) {
      el.scrollIntoView({ block: "center" });
      await new Promise((r) => requestAnimationFrame(r));
      const b = el.getBoundingClientRect();
      const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
      if (!hit || !(el === hit || el.contains(hit))) out.push(`${el.textContent.trim().slice(0, 30)} → ${hit?.className || hit?.tagName}`);
    }
    return out;
  });
  if (missed.length) fail(`taps must reach the front face's controls: ${missed.join("; ")}`);
}
/** Mouse drag on the stage from (x,y) by dx px over `ms`, in `steps` moves. */
async function drag(page, x, y, moves, { ms = 300 } = {}) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (const [dx, dy, wait] of moves) {
    await page.mouse.move(x + dx, y + (dy ?? 0));
    await page.waitForTimeout(wait ?? ms / moves.length);
  }
  await page.mouse.up();
}
const steps = (dx, n = 8, dy = 0) => Array.from({ length: n }, (_, i) => [Math.round((dx * (i + 1)) / n), Math.round((dy * (i + 1)) / n)]);
async function stageBox(page) {
  return (await page.locator(".vq-spin-stage").boundingBox());
}

// 1. Layout and real games per face at phone and desktop widths.
for (const width of [360, 390, 1280]) {
  await open(`faces-${width}`, { width }, async (page, { fail }) => {
    if ((await mode(page)) !== "overview") fail("Home must open on the All sports overview");
    await waitFaces(page, ["nfl", "nba", "nhl", "ncaab"]);
    if (await page.getByText("No games are scheduled today").count()) fail("overview claims no games");
    await shot(page, `overview-${width}.png`);
    for (const [i, s] of ["nfl", "nba", "nhl", "ncaab"].entries()) {
      await choose(page, s);
      const face = frontFace(page);
      const head = await face.locator(".vq-tonight-head").innerText();
      const label = s.toUpperCase();
      if (!head.toUpperCase().includes(label)) fail(`${s} face must name its sport: ${head}`);
      if (!head.toUpperCase().includes(`FACE ${i + 1} OF 4`)) fail(`${s} face must say which face is selected: ${head}`);
      if (!/Today · Thu, Oct 15 · ET/i.test(head)) fail(`${s} face must show today's ET date: ${head}`);
      if ((await face.locator(".vq-spin-open").getAttribute("href")) !== `/${s}`) fail(`${s} Open link`);
      await onlyFrontInteractive(page, fail);
      const hrefs = await face.locator("a.vq-spin-game").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
      if (s === "nba") {
        const want = NBA_ORDER.slice(0, 3).map((x) => `/nba/games/${x}`);
        if (JSON.stringify(hrefs) !== JSON.stringify(want)) fail(`NBA preview must be the first 3 games in time order: ${hrefs}`);
        const text = await face.innerText();
        if (!/Final/.test(text) || !/In progress/.test(text) || !/Time not confirmed/.test(text)) fail("NBA face must show reported statuses and unconfirmed time as given");
        const more = face.locator(".vq-tonight-more");
        if ((await more.innerText()).trim() !== "Show all 5 NBA games") fail(`Show all count: ${await more.innerText()}`);
        // Clear of the fixed bottom navigation, as a person would scroll it into view.
        await more.evaluate((e) => e.scrollIntoView({ block: "center" }));
        await more.click();
        const all = await face.locator("a.vq-spin-game").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
        if (JSON.stringify(all) !== JSON.stringify(NBA_ORDER.map((x) => `/nba/games/${x}`))) fail(`Show all must list all 5 in order: ${all}`);
        await shot(page, `face-nba-all-${width}.png`);
        await more.evaluate((e) => e.scrollIntoView({ block: "center" }));
        await more.click();
      }
      if (s === "nhl" && JSON.stringify(hrefs) !== JSON.stringify(["/nhl/games/sample-nhl-early", "/nhl/games/sample-nhl-late"])) fail(`NHL face must be today's games in order, not tomorrow's: ${hrefs}`);
      if (s === "nfl") {
        if (JSON.stringify(hrefs) !== JSON.stringify(["/matchups/sample-sea-den-2026-10-15"])) fail(`NFL face must link today's desk game: ${hrefs}`);
        if (/In progress|Final|Live/.test(await face.innerText())) fail("NFL desk games carry no status: none may be inferred");
      }
      if (s === "ncaab" && JSON.stringify(hrefs) !== JSON.stringify(["/ncaab/games/sample-college-tonight"])) fail(`NCAAB face: ${hrefs}`);
      await shot(page, `face-${s}-${width}.png`);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) fail(`horizontal overflow ${overflow}px`);
    const small = await page.locator(".vq-spin-pick, .vq-spin-arrow, .vq-spin-face[data-front] :is(a, button)").evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect()).filter((r) => r.width && (r.height < 44 || r.width < 44)).length);
    if (small) fail(`${small} touch targets under 44px`);
    await choose(page, "overview");
    if (!(await page.locator('[data-skybox-face="overview"]').count())) fail("All sports returns to the overview");
  });
}

// 2. Turning: drag settles, short drags snap back, flicks and reversals, a drag never opens a game, a tap does.
await open("gestures", { width: 390 }, async (page, { fail }) => {
  await waitFaces(page, ["nfl", "nba", "nhl", "ncaab"]);
  await choose(page, "nba");
  const b = await stageBox(page);
  const game = frontFace(page).locator("a.vq-spin-game").first();
  const g = await game.boundingBox();
  const startUrl = page.url();
  // Drag left starting on a game link: turns to NHL and does not open the game.
  await drag(page, g.x + g.width / 2, g.y + g.height / 2, steps(-180), { ms: 400 });
  await page.waitForTimeout(300);
  if (page.url() !== startUrl) fail(`a drag over a game opened it: ${page.url()}`);
  if ((await mode(page)) !== "nhl") fail(`left drag must turn to the next face (NHL), got ${await mode(page)}`);
  // Short slow drag snaps back.
  await drag(page, b.x + b.width / 2, b.y + 120, steps(-50, 10), { ms: 800 });
  if ((await mode(page)) !== "nhl") fail("a short slow drag must snap back");
  // A quick flick commits from a short distance.
  await drag(page, b.x + b.width / 2, b.y + 120, [[-15, 0, 10], [-30, 0, 10], [-45, 0, 10]]);
  if ((await mode(page)) !== "ncaab") fail(`a quick flick must turn: ${await mode(page)}`);
  // Reversal: drag far left slowly, then flick back right fast → previous face, not next.
  await drag(page, b.x + b.width / 2, b.y + 120, [...steps(-160, 8).map(([dx]) => [dx, 0, 60]), [-140, 0, 10], [-110, 0, 10], [-80, 0, 10]]);
  if ((await mode(page)) !== "nhl") fail(`a fast reversal must follow the flick back: ${await mode(page)}`);
  // Seam: right drag from NFL wraps to NCAAB.
  await choose(page, "nfl");
  await drag(page, b.x + b.width / 2, b.y + 120, steps(170), { ms: 400 });
  if ((await mode(page)) !== "ncaab") fail(`right drag from the first face wraps to the last: ${await mode(page)}`);
  // Cancelled gesture (browser takes over) snaps back with no turn.
  await page.mouse.move(b.x + b.width / 2, b.y + 120);
  await page.mouse.down();
  for (const [dx] of steps(-150)) await page.mouse.move(b.x + b.width / 2 + dx, b.y + 120);
  const midOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (midOverflow > 1) fail(`a turning face must not widen the page (${midOverflow}px)`);
  await page.locator(".vq-spin-stage").dispatchEvent("pointercancel", { pointerId: 1, isPrimary: true, pointerType: "mouse" });
  await page.mouse.up();
  if ((await mode(page)) !== "ncaab") fail(`a cancelled gesture must not turn: ${await mode(page)}`);
  const transform = await page.locator(".vq-spin-prism").evaluate((e) => e.style.transform);
  if (!/rotateY\(-1080deg\)|rotateY\(-?\d+deg\)/.test(transform)) fail(`prism transform: ${transform}`);
  // A tap opens the exact game.
  await choose(page, "nba");
  await page.waitForTimeout(700);
  await frontFace(page).locator("a.vq-spin-game").first().click();
  await page.waitForURL("**/nba/games/sample-nba-final");
  // Returning restores the face; turning added no history entries.
  await page.goBack();
  await page.locator(".vq-spin").waitFor();
  await page.waitForFunction(() => document.querySelector(".vq-spin")?.getAttribute("data-spin-mode") === "nba");
});

// 3. Touch: horizontal swipe turns; vertical swipe scrolls the page and never turns; pinch is not a turn.
await open("touch", { width: 390, touch: true }, async (page, { fail, ctx }) => {
  await waitFaces(page, ["nfl", "nba", "nhl", "ncaab"]);
  await choose(page, "nba");
  await page.locator(".vq-spin-stage").scrollIntoViewIfNeeded();
  const cdp = await ctx.newCDPSession(page);
  const b = await stageBox(page);
  const x = b.x + b.width / 2, y = b.y + Math.min(200, b.height / 2);
  const touch = async (pts) => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [pts[0][0]] });
    for (const p of pts.slice(1)) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: p });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(400);
  };
  const line = (dx, dy, n = 12) => Array.from({ length: n + 1 }, (_, i) => [{ x: x + (dx * i) / n, y: y + (dy * i) / n, id: 1 }]);
  await touch(line(-170, 4));
  if ((await mode(page)) !== "nhl") fail(`horizontal swipe must turn to NHL: ${await mode(page)}`);
  const y0 = await page.evaluate(() => scrollY);
  await touch(line(6, -260));
  const y1 = await page.evaluate(() => scrollY);
  if ((await mode(page)) !== "nhl") fail("a vertical swipe must never turn the box");
  if (!(y1 > y0 + 50)) fail(`a vertical swipe on the box must scroll the page (${y0} → ${y1})`);
  const ta = await page.locator(".vq-spin-stage").evaluate((e) => getComputedStyle(e).touchAction);
  if (ta !== "pan-y pinch-zoom") fail(`stage touch-action must keep vertical scroll and pinch zoom: ${ta}`);
  // A tap still opens the game.
  const link = frontFace(page).locator("a.vq-spin-game").first();
  await link.tap();
  await page.waitForURL("**/nhl/games/sample-nhl-early");
});

// Pinch zoom stays the browser's and never turns the box.
await open("pinch", { width: 390, touch: true }, async (page, { fail, ctx }) => {
  await waitFaces(page, ["nfl", "nba", "nhl", "ncaab"]);
  await choose(page, "nhl");
  await page.locator(".vq-spin-stage").scrollIntoViewIfNeeded();
  const cdp = await ctx.newCDPSession(page);
  const b = await stageBox(page);
  const x = b.x + b.width / 2, y = b.y + Math.min(200, b.height / 2);
  // Two fingers moving apart horizontally (pinch) must not turn.
  const pinch = Array.from({ length: 11 }, (_, i) => [{ x: x - 20 - i * 8, y, id: 1 }, { x: x + 20 + i * 8, y: y + 10, id: 2 }]);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pinch[0] });
  for (const p of pinch.slice(1)) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: p });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(400);
  if ((await mode(page)) !== "nhl") fail(`a pinch must not turn the box: ${await mode(page)}`);
  const scale = await page.evaluate(() => visualViewport.scale);
  if (!(scale > 1.05)) fail(`a pinch on the box must zoom the page (visual scale ${scale})`);
});

// 4. Keyboard and screen readers.
await open("keyboard", { width: 1280 }, async (page, { fail }) => {
  await waitFaces(page, ["nfl", "nba", "nhl", "ncaab"]);
  await page.locator('.vq-spin-pick[data-spin-pick="nfl"]').focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector(".vq-spin")?.getAttribute("data-spin-mode") === "nfl");
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() => document.querySelector(".vq-spin")?.getAttribute("data-spin-mode") === "nba");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.waitForFunction(() => document.querySelector(".vq-spin")?.getAttribute("data-spin-mode") === "ncaab");
  const live = await page.locator(".vq-spin-live").innerText();
  if (!/NCAAB, face 4 of 4\. 1 game today/.test(live)) fail(`turn must be announced politely: "${live}"`);
  if ((await page.locator(".vq-spin-live").getAttribute("aria-live")) !== "polite") fail("live region must be polite");
  const pressed = await page.locator('.vq-spin-pick[aria-pressed="true"]').allInnerTexts();
  if (JSON.stringify(pressed) !== '["NCAAB"]') fail(`selected sport must be exposed: ${pressed}`);
  // Visible focus on controls.
  await page.locator(".vq-spin-arrow").last().focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  if (outline === "none") fail("focused control must show a visible focus ring");
  // Tab moves from the controls into the front face only (inactive faces are skipped).
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    const where = await page.evaluate(() => {
      const f = document.activeElement?.closest(".vq-spin-face");
      return f ? (f.hasAttribute("data-front") ? "front" : "hidden") : "other";
    });
    if (where === "hidden") fail("keyboard focus reached an inactive face");
  }
  const nameOfSection = await page.evaluate(() => document.getElementById("vq-tonight-title")?.getAttribute("aria-label"));
  if (nameOfSection !== "VQ Tonight, College basketball") fail(`section name follows the front face: ${nameOfSection}`);
  await shot(page, "keyboard-focus-1280.png");
});

// 5. Reduced motion: switches without the spin animation and no live rotation while dragging.
await open("reduced-motion", { width: 390, reduced: true }, async (page, { fail }) => {
  await waitFaces(page, ["nfl", "nba", "nhl", "ncaab"]);
  await choose(page, "nba");
  const dur = await page.locator(".vq-spin-prism").evaluate((e) => getComputedStyle(e).transitionDuration);
  if (dur !== "0s") fail(`reduced motion must not animate the turn: ${dur}`);
  const b = await stageBox(page);
  const before = await page.locator(".vq-spin-prism").evaluate((e) => e.style.transform);
  await page.mouse.move(b.x + b.width / 2, b.y + 120);
  await page.mouse.down();
  for (const [dx] of steps(-150)) await page.mouse.move(b.x + b.width / 2 + dx, b.y + 120);
  const during = await page.locator(".vq-spin-prism").evaluate((e) => e.style.transform);
  await page.mouse.up();
  if (during !== before) fail(`reduced motion must not rotate while dragging: ${before} → ${during}`);
  if ((await mode(page)) !== "nhl") fail("the drag still settles on the next face");
});
await open("full-motion", { width: 390 }, async (page, { fail }) => {
  await waitFaces(page, ["nfl", "nba", "nhl", "ncaab"]);
  await choose(page, "nba");
  await page.waitForTimeout(300);
  const dur = await page.locator(".vq-spin-prism").evaluate((e) => getComputedStyle(e).transitionDuration);
  if (dur === "0s") fail("normal motion turns with an animation");
  // No automatic spinning: nothing moves without input.
  const a = await page.locator(".vq-spin-prism").evaluate((e) => e.style.transform);
  await page.waitForTimeout(2500);
  const c = await page.locator(".vq-spin-prism").evaluate((e) => e.style.transform);
  if (a !== c || (await mode(page)) !== "nba") fail("the box must never turn on its own");
});

// 6. Unavailable, empty, loading and stale states. Never filled with made-up games.
await open("states-unavailable", { width: 390, fail: ["ncaab"], deskFails: true, empty: ["nhl"] }, async (page, { fail, calls }) => {
  await waitFaces(page, ["nfl", "nba", "nhl", "ncaab"]);
  const overview = await page.locator('[data-skybox-face="overview"]').innerText();
  if (!/NFL, NCAAB games could not load/.test(overview)) fail(`overview must report the NFL and NCAAB failures: ${overview.slice(0, 300)}`);
  await shot(page, "overview-failures-390.png");
  const readsBefore = { ...calls };
  for (const [s, want] of [["nfl", "unavailable"], ["ncaab", "unavailable"], ["nhl", "empty"]]) {
    await choose(page, s);
    const face = frontFace(page);
    const state = await face.locator("[data-spin-state]").first().getAttribute("data-spin-state").catch(() => null);
    if (state !== want) fail(`${s.toUpperCase()} face shows ${want === "unavailable" ? "unavailable, not no games" : "no games"} (got ${state})`);
    if (await face.locator("a.vq-spin-game").count()) fail(`${s} face must not show games`);
    if (want === "unavailable" && /No .* games are scheduled/.test(await face.innerText())) fail(`${s} source failure displayed as no games`);
    await shot(page, `face-${s}-${want}-390.png`);
  }
  if (JSON.stringify(readsBefore) !== JSON.stringify(calls)) fail(`turning must not fetch: ${JSON.stringify(readsBefore)} → ${JSON.stringify(calls)}`);
  // Retry re-reads only that source.
  await choose(page, "ncaab");
  await frontFace(page).getByRole("button", { name: "Retry" }).click();
  await page.waitForTimeout(500);
  if (calls.ncaab !== readsBefore.ncaab + 1 || calls.nba !== readsBefore.nba) fail(`Retry must re-read only NCAAB: ${JSON.stringify(calls)}`);
});
await open("states-loading", { width: 390, nbaDelay: 4000, clock: "install" }, async (page, { fail }) => {
  await page.clock.resume();
  await waitFaces(page, ["nfl", "nba", "nhl", "ncaab"]);
  await choose(page, "nba");
  const text = await frontFace(page).innerText();
  if (!/Loading today’s NBA games/.test(text)) fail(`NBA face must show loading: ${text.slice(0, 200)}`);
  await shot(page, "face-nba-loading-390.png");
  await frontFace(page).locator("a.vq-spin-game").first().waitFor({ timeout: 8000 });
});
await open("states-stale", { width: 390, nbaRefreshFails: true, clock: "install" }, async (page, { fail }) => {
  await page.clock.resume();
  await waitFaces(page, ["nfl", "nba", "nhl", "ncaab"]);
  await choose(page, "nba");
  await frontFace(page).locator("a.vq-spin-game").first().waitFor();
  await page.clock.runFor(5 * 60000 + 1000);
  await frontFace(page).locator('[data-spin-state="stale"]').waitFor();
  const n = await frontFace(page).locator("a.vq-spin-game").count();
  if (n !== 3) fail(`stale face keeps the earlier games (${n})`);
  const t = await frontFace(page).locator('[data-spin-state="stale"]').innerText();
  if (!/Couldn’t refresh NBA: showing games as checked 12:00 PM ET, which may be out of date/.test(t)) fail(`stale note: ${t}`);
  await shot(page, "face-nba-stale-390.png");
});

// 7. NHL access rule: while NHL is held, it is not a face and cannot be restored into.
await open("nhl-held", { width: 390, signedIn: true, held: true }, async (page, { fail }) => {
  await page.evaluate(() => sessionStorage.setItem("vq-skybox-face", "nhl"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".vq-spin").waitFor();
  await page.waitForTimeout(1500);
  await waitFaces(page, ["nfl", "nba", "ncaab"]);
  // The invitation dialog is modal; Escape dismisses it without consuming the surprise (NHL stays held).
  if (await page.locator("dialog.frank-anniversary-dialog[open]").count()) await page.keyboard.press("Escape");
  if ((await mode(page)) !== "overview") fail(`a held NHL face must never show: ${await mode(page)}`);
  if (await page.locator('.vq-spin-pick[data-spin-pick="nhl"]').count()) fail("no NHL selector while held");
  await choose(page, "ncaab");
  const head = await frontFace(page).locator(".vq-tonight-head").innerText();
  if (!head.toUpperCase().includes("FACE 3 OF 3")) fail(`three faces while NHL is held: ${head}`);
  await page.locator(".vq-spin-arrow").last().click();
  await page.waitForFunction(() => document.querySelector(".vq-spin")?.getAttribute("data-spin-mode") === "nfl");
  await shot(page, "face-ncaab-nhl-held-390.png");
});

// 8. Account switching: signing out (from another tab) re-applies access rules without breaking the box.
await open("account-switch", { width: 390, signedIn: true }, async (page, { fail, ctx }) => {
  await waitFaces(page, ["nfl", "nba", "nhl", "ncaab"]);
  await choose(page, "nba");
  const other = await ctx.newPage();
  await other.clock.setFixedTime(NOW);
  await other.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await other.evaluate(() => sessionStorage.setItem("fixture-signed-out", "1"));
  await other.evaluate(async () => {
    localStorage.removeItem("sb-127-auth-token");
    new BroadcastChannel("sb-127-auth-token").postMessage({ event: "SIGNED_OUT", session: null });
  });
  await page.waitForTimeout(1500);
  await waitFaces(page, ["nfl", "nba", "nhl", "ncaab"]);
  if ((await mode(page)) !== "nba") fail(`the chosen face survives an account change: ${await mode(page)}`);
  await onlyFrontInteractive(page, fail);
  await other.close();
});

// 9. Midnight rollover: the face moves to the new ET day and never shows yesterday's games as today's.
await open("midnight", { width: 390, clock: "install", at: new Date("2026-10-16T03:59:00Z") }, async (page, { fail }) => {
  await page.clock.resume();
  await waitFaces(page, ["nfl", "nba", "nhl", "ncaab"]);
  await choose(page, "nhl");
  let head = await frontFace(page).locator(".vq-tonight-head").innerText();
  if (!/Thu, Oct 15/i.test(head)) fail(`before midnight: ${head}`);
  await page.clock.runFor(2 * 60000);
  await page.waitForFunction(() => /Fri, Oct 16/i.test(document.querySelector(".vq-spin-face[data-front] .vq-tonight-head")?.textContent || ""));
  await frontFace(page).locator("a.vq-spin-game").first().waitFor();
  const hrefs = await frontFace(page).locator("a.vq-spin-game").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  if (JSON.stringify(hrefs) !== '["/nhl/games/sample-nhl-tomorrow"]') fail(`after ET midnight only the new day's games: ${hrefs}`);
  if ((await mode(page)) !== "nhl") fail("rollover keeps the chosen face");
});

// 10. Rest of Home intact: sport rooms, All sports link, history.
await open("home-intact", { width: 390 }, async (page, { fail }) => {
  await waitFaces(page, ["nfl", "nba", "nhl", "ncaab"]);
  const rooms = await page.locator(".vq-lobby-desks a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  if (JSON.stringify(rooms) !== '["/nfl","/nba","/nhl","/ncaab"]') fail(`sport room links: ${rooms}`);
  const h0 = await page.evaluate(() => history.length);
  for (const s of ["nfl", "nba", "nhl", "ncaab", "nba"]) await choose(page, s);
  await page.locator(".vq-spin-arrow").first().click();
  if ((await page.evaluate(() => history.length)) !== h0) fail("turning the box must not add history entries");
  if (page.url() !== `${BASE}/`) fail(`turning must not change the URL: ${page.url()}`);
  await page.locator(".vq-lobby-all-sports").click();
  await page.waitForFunction(() => document.querySelector(".vq-spin")?.getAttribute("data-spin-mode") === "overview");
  if (!(await page.getByText("Your next move").count())) fail("Your next move cards stay below the board");
});

await browser.close();
console.log(`\n${passed.length} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

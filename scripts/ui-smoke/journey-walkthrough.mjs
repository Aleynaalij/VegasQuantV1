// U-C1 evidence capture: walks the daily journey Home → research → The Zone → build/save → reopen
// the saved lay, at 360/390/1280 px, signed out and signed in, and records what each step offers.
// Synthetic data only: published legs are bound to the stub's sample games and saved lays live in
// memory. No real accounts, saves, shares, wagers or external destinations.
// Needs the app on :3100 built with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 and
// scripts/ui-smoke/stub.mjs running (see check.mjs).
// Usage: node scripts/ui-smoke/journey-walkthrough.mjs [outDir]  → <outDir>/journey.json + screenshots
// Exits 1 when any step finds friction, a step scrolls sideways, or the save/reopen proof is missing.
// Negative controls (each must fail): UI_SMOKE_NEGATIVE=drop-game disables the URL write that
// remembers the opened game; =no-save-id makes the save return no ID; =overflow adds a too-wide
// element to every page.
import fs from "node:fs";
import path from "node:path";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");

const BASE = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const OUT = process.argv[2] || "journey-evidence";
const UID = "00000000-0000-0000-0000-000000000001";
const UID_B = "00000000-0000-0000-0000-000000000002";
const NEG = process.env.UI_SMOKE_NEGATIVE || "";
const NOW = "2026-10-14T02:00:00Z"; // the stub's pinned clock
const SLUG = "sample-sea-den-2026-10-15";
const SLUG_B = "sample-hou-jax-2026-10-18";
const RELEASE = "00000000-0000-4000-8000-000000000005";
fs.mkdirSync(OUT, { recursive: true });

const tnf = "Seattle Seahawks @ Denver Broncos";
const legs = [
  ["g1", "Sample Runner", "Full game · 60+ rushing yards", tnf],
  ["g1", "Sample Receiver", "Full game · 50+ receiving yards", tnf],
  ["g1", "Sample Passer", "Full game · 190+ passing yards", tnf],
  ["g2", "Sample Back", "Full game · 50+ rushing yards", "Houston Texans @ Jacksonville Jaguars"],
  ["g2", "Sample Board Receiver", "Full game · 40+ receiving yards", "Houston Texans @ Jacksonville Jaguars"],
].map(([game_id, name, market, matchup], i) => ({
  // The last leg comes from a published research-board release (candidate key).
  leg_key: i === 4 ? `candidate:${RELEASE}:1` : `journey:${i}`, name, market, matchup, game_id, kind: "RESEARCH", quote: null,
  quote_observed_at: null, published_at: NOW, expires_at: "2026-10-16T00:15:00Z", result: null,
  why: "Sample case.", risk: "Sample risk.", copy_text: `${name} ${market.replace("Full game · ", "")}`,
  gambly_url: null,
}));

const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {});
const report = [];

async function session(width, signedIn) {
  const ctx = await browser.newContext({ viewport: { width, height: width > 800 ? 900 : 800 }, reducedMotion: "reduce" });
  if (signedIn)
    await ctx.addInitScript((uid) => {
      localStorage.setItem(`vq-app-refresh:${uid}`, "gold-2026-10-22-v2");
      localStorage.setItem(`vq-push-prompt:${uid}`, String(Date.now() + 7 * 86400000));
      sessionStorage.setItem("vq-prompt-shown", "fixture");
      localStorage.setItem("sb-127-auth-token", JSON.stringify({
        access_token: "smoke", refresh_token: "smoke", token_type: "bearer", expires_in: 30 * 86400,
        expires_at: Math.floor(Date.now() / 1000) + 30 * 86400,
        user: { id: uid, aud: "authenticated", role: "authenticated", email: "smoke@example.com", app_metadata: {}, user_metadata: { vq_welcome_version: 1 } },
      }));
    }, UID);
  let mine = [], shares = 0;
  await ctx.route("**/rest/v1/**", async (route) => {
    const u = new URL(route.request().url()), p = u.pathname;
    if (p.endsWith("/published_legs") || p.endsWith("/published_leg_catalog"))
      return route.fulfill({ json: signedIn ? legs : [] });
    if (p.endsWith("/member_parlays"))
      return route.fulfill({ json: u.searchParams.has("id") ? mine.find((x) => `eq.${x.id}` === u.searchParams.get("id")) || null : mine });
    if (p.endsWith("/rpc/share_member_parlay")) shares++;
    if (p.endsWith("/rpc/create_member_parlay")) {
      if (NEG === "no-save-id") return route.fulfill({ json: null });
      const body = route.request().postDataJSON();
      const id = `33333333-3333-4333-8333-${String(mine.length + 1).padStart(12, "0")}`;
      mine = [...mine, { id, title: body.p_title, legs: legs.filter((l) => body.p_leg_keys.includes(l.leg_key)), created_at: NOW, expires_at: "2026-10-16T00:15:00Z", community_post_id: null }];
      return route.fulfill({ json: id });
    }
    if (p.endsWith("/rpc/notification_inbox")) return route.fulfill({ json: { items: [], snapshot_at: NOW } });
    return route.fallback();
  });
  if (NEG === "overflow")
    await ctx.addInitScript(() => addEventListener("load", () => {
      const wide = document.createElement("div");
      wide.style.cssText = "width:2400px;height:1px";
      document.body.append(wide);
    }));
  if (NEG === "drop-game")
    await ctx.addInitScript(() => {
      const replace = history.replaceState.bind(history);
      history.replaceState = (state, title, url) =>
        replace(state, title, url && /[?&]game=/.test(String(url)) ? String(url).replace(/([?&])game=[^&#]*&?/, "$1").replace(/[?&](#|$)/, "$1") : url);
    });
  const page = await ctx.newPage();
  page.setDefaultTimeout(12000);
  await page.clock.setFixedTime(new Date(NOW));
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
  return { ctx, page, errors, saved: () => mine, shares: () => shares };
}

/** What the person can see and act on: visible headings, actions and their targets inside <main>. */
async function inventory(page) {
  return page.evaluate(() => {
    const vis = (e) => e.offsetParent !== null || getComputedStyle(e).position === "fixed";
    const label = (e) => (e.getAttribute("aria-label") || e.innerText || "").replace(/\s+/g, " ").trim().slice(0, 70);
    const main = document.querySelector("main") || document.body;
    return {
      url: location.pathname + location.search + location.hash,
      headings: [...main.querySelectorAll("h1,h2")].filter(vis).map(label).filter(Boolean).slice(0, 12),
      actions: [...main.querySelectorAll("a[href],button")].filter(vis).map((e) => `${e.tagName === "A" ? "link" : "button"}: ${label(e)}${e.tagName === "A" ? " → " + e.getAttribute("href") : ""}`).filter((s) => !/: $|→ https?:/.test(s)).slice(0, 40),
      status: [...document.querySelectorAll("[role=status],[role=alert]")].filter(vis).map(label).filter(Boolean),
      overflowX: document.documentElement.scrollWidth > innerWidth + 1,
    };
  });
}

async function step(log, page, name, note) {
  await page.waitForTimeout(400);
  const file = `${log.id}-${String(log.steps.length + 1).padStart(2, "0")}-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
  await page.screenshot({ path: path.join(OUT, file), fullPage: false });
  const inv = await inventory(page);
  log.steps.push({ name, note, screenshot: file, ...inv });
  if (inv.overflowX) log.findings.push(`Sideways scroll at step "${name}" (${inv.url}).`);
  return inv;
}
const closeDialogs = (page) => page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));

for (const width of [360, 390, 1280]) {
  // ---------- Signed in: the full journey ----------
  {
    const log = { id: `in-${width}`, width, signedIn: true, steps: [], findings: [] };
    const { ctx, page, errors, saved, shares } = await session(width, true);
    try {
      await page.goto(BASE + "/", { waitUntil: "networkidle" });
      await closeDialogs(page);
      await step(log, page, "home", "Landing");
      const row = page.locator("details.vq-game-row").first();
      await row.locator("summary").click();
      await page.getByRole("button", { name: /Sample Runner/ }).first().waitFor();
      const inRow = await step(log, page, "home-game-open", "Opened the first game on Home");
      if (!inRow.actions.some((a) => a.includes(`/matchups/${SLUG}`)))
        log.findings.push("Home game row offers props but no route to that game's research page.");
      await page.getByRole("button", { name: /Sample Runner/ }).first().click();
      await page.getByRole("button", { name: "Add to your lay" }).first().click();
      const layLinks = page.getByRole("link", { name: /Build your lay · 1 selected/ });
      await layLinks.first().waitFor();
      await step(log, page, "home-leg-added", "Added one prop to the lay from Home");
      const inView = await layLinks.evaluateAll((els) => els.some((e) => { const r = e.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight; }));
      if (!inView) {
        const y = (await layLinks.first().boundingBox())?.y;
        log.findings.push(`"Build your lay · 1 selected" appears off screen (y=${Math.round(y ?? NaN)}) after adding: the confirmation is not where the tap happened.`);
      }

      // Research detail (by the row's own link when it has one) and back.
      const researchLink = page.locator(`details.vq-game-row[open] a[href="/matchups/${SLUG}"]`);
      if (await researchLink.count()) {
        await researchLink.first().click();
        await page.waitForURL(new RegExp(`/matchups/${SLUG}$`));
        await page.waitForLoadState("networkidle");
      } else await page.goto(BASE + `/matchups/${SLUG}`, { waitUntil: "networkidle" });
      const research = await step(log, page, "research-detail", (await researchLink.count()) ? "Game research, from the Home row" : "Game research (reached by URL: no link from Home)");
      if (!research.actions.some((a) => /\/parlays|your lay|build/i.test(a))) log.findings.push("Research page has no route to building a lay or to the selections already made.");
      await page.goBack({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      const back = await step(log, page, "home-after-back", "Browser Back from research");
      if (!(await page.locator(`#home-game-${SLUG}[open], details.vq-game-row[open]`).count())) log.findings.push("Back from research returns Home with the game row collapsed; the opened game is lost.");
      if (!back.actions.some((a) => /Build your lay · 1 selected/.test(a))) log.findings.push("Back from research hides the lay in progress until a game is reopened.");

      // Two games open: Back returns to the game actually entered, not the last one opened.
      await page.goto(BASE + "/", { waitUntil: "networkidle" });
      const rowA = page.locator(`#home-game-${SLUG}`), rowB = page.locator(`#home-game-${SLUG_B}`);
      if (!(await rowA.evaluate((d) => d.open))) await rowA.locator("summary").click();
      await rowB.locator("summary").click();
      await rowA.locator(`a[href="/matchups/${SLUG}"]`).click();
      await page.waitForURL(new RegExp(`/matchups/${SLUG}$`));
      await page.goBack({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      const backUrl = new URL(page.url());
      if (backUrl.searchParams.get("game") !== SLUG) log.findings.push(`With two games open, Back from game A's research remembers "${backUrl.searchParams.get("game")}" instead of game A.`);
      if (!(await rowA.evaluate((d) => d.open).catch(() => false))) log.findings.push("With two games open, Back from game A's research does not reopen game A.");
      // Close B while A stays open: the remembered game falls back to A, not nothing.
      if (!(await rowB.evaluate((d) => d.open))) await rowB.locator("summary").click();
      await page.waitForTimeout(200);
      await rowB.locator("summary").click();
      await page.waitForTimeout(300);
      const afterClose = new URL(page.url()).searchParams.get("game");
      if (afterClose !== SLUG) log.findings.push(`Closing game B while game A stays open leaves the remembered game as "${afterClose}" instead of A.`);

      // Research → "Props & your lay" → Home with this game open.
      await page.goto(BASE + `/matchups/${SLUG}`, { waitUntil: "networkidle" });
      const toLay = page.getByRole("link", { name: /Props & your lay/ });
      if (await toLay.count()) {
        await toLay.click();
        await page.waitForURL(/\?game=/);
        await page.waitForTimeout(800);
        const fromResearch = await step(log, page, "home-from-research", "Research → Props & your lay");
        if (!(await page.locator(`#home-game-${SLUG}[open]`).count())) log.findings.push("Props & your lay does not open the game on Home.");
        const box = await page.locator(`#home-game-${SLUG}`).boundingBox();
        if (!box || box.y > page.viewportSize().height || box.y + box.height < 0) log.findings.push("Props & your lay opens the game off screen.");
        void fromResearch;
      }

      // The Zone.
      await page.goto(BASE + "/community", { waitUntil: "networkidle" });
      await closeDialogs(page);
      const zone = await step(log, page, "zone", "The Zone");
      if (!zone.actions.some((a) => /\/parlays|your lay|build/i.test(a))) log.findings.push("The Zone has no route to the member's lay in progress or saved lays.");

      // Builder from the lay in progress.
      await page.goto(BASE + "/", { waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      if (!(await page.getByRole("link", { name: /Build your lay · 1 selected/ }).count())) await row.locator("summary").click();
      await page.getByRole("link", { name: /Build your lay · 1 selected/ }).first().click();
      await page.waitForURL(/\/parlays/);
      await page.waitForLoadState("networkidle");
      const builder = await step(log, page, "builder", "Opened the builder from Home");
      if (!builder.actions.some((a) => /Save lay/.test(a))) log.findings.push("Builder opened from Home does not show the started lay with a save action.");
      if (/\b1 legs\b/.test(await page.evaluate(() => document.body.innerText))) log.findings.push('Builder says "1 legs".');
      const dead = await page.locator('main a[href="/records"]').count();
      if (dead) log.findings.push(`${dead} "Original publication" link(s) point to /records, which does not exist (404).`);
      // A research-board leg's publication link must keep its release through /feed's redirect rule.
      const bare = await page.locator('main a[href^="/feed#"]').count();
      if (bare) log.findings.push(`${bare} "Original publication" link(s) use a bare /feed#…, which redirects to the Zone and loses the release.`);
      const want = `/feed?view=latest&release=${RELEASE}#release-${RELEASE}`;
      if (!(await page.locator(`main a[href="${want}"]`).count())) log.findings.push(`Research-board leg has no "Original publication" link to ${want}.`);
      const add = page.getByRole("button", { name: "+ Add to lay", exact: true });
      if (await add.count()) await add.first().click();
      await step(log, page, "builder-two-legs", "Added a second leg in the builder");
      const save = page.getByRole("button", { name: "Save lay", exact: true });
      if (await save.count()) {
        await save.click();
        await page.waitForTimeout(800);
        const done = await step(log, page, "saved", "Saved the lay");
        log.savedCompletion = done.status;
      } else log.findings.push("No save action available in the builder.");
      // The save must produce exactly one saved lay with an ID, and reopening must show that exact
      // private lay, unshared. A missing ID is a failure, never a skipped check.
      const savedRows = saved();
      const id = savedRows[0]?.id;
      if (savedRows.length !== 1 || !id) log.findings.push(`Saving produced ${savedRows.length} saved lay(s) and no usable ID; the reopen proof cannot run.`);
      else {
        await page.goto(BASE + `/community?saved=${id}`, { waitUntil: "networkidle" });
        const reopened = await step(log, page, "reopen-saved", "Reopened the saved lay via its saved link");
        log.reopenUrl = reopened.url;
        if (new URL(page.url()).searchParams.get("saved") !== id) log.findings.push("Saved link did not keep the exact saved ID through the redirect.");
        const card = page.locator(`#my-parlay-${id}`);
        if (!(await card.count())) log.findings.push("Saved deep link does not land on the saved lay.");
        else {
          const cardText = await card.innerText();
          for (const leg of savedRows[0].legs) if (!cardText.includes(leg.name)) log.findings.push(`Reopened lay is missing its saved leg "${leg.name}".`);
          if (!(await card.getByRole("button", { name: /Post to Community/ }).count())) log.findings.push("Reopened lay does not show it as unshared (no Post to Community action).");
        }
        if (shares()) log.findings.push(`Saving or reopening shared the lay (${shares()} share call(s)) without the member choosing to.`);
        if (savedRows[0].community_post_id) log.findings.push("Saved lay is marked as posted to the community.");
      }
    } catch (e) {
      log.findings.push(`walkthrough stopped: ${String(e).split("\n")[0].slice(0, 200)}`);
      await step(log, page, "stopped", "Where the walkthrough stopped").catch(() => {});
    }
    log.errors = errors;
    report.push(log);
    await ctx.close();
  }
  // ---------- Account switch: the Home lay badge follows the account, no game opened ----------
  {
    const log = { id: `switch-${width}`, width, signedIn: true, steps: [], findings: [] };
    const { ctx, page, errors } = await session(width, true);
    try {
      await page.addInitScript(({ a, b }) => {
        sessionStorage.setItem(`vq-parlay-draft:${a}`, JSON.stringify({ title: "A", keys: ["journey:0"] }));
        sessionStorage.setItem(`vq-parlay-draft:${b}`, JSON.stringify({ title: "B", keys: ["journey:1", "journey:3"] }));
      }, { a: UID, b: UID_B });
      await page.goto(BASE + "/", { waitUntil: "networkidle" });
      await closeDialogs(page);
      const lay = (n) => page.getByRole("link", { name: new RegExp(`Build your lay · ${n} selected`) });
      if (!(await lay(1).count())) log.findings.push("Account A's lay in progress is not shown before any game is opened.");
      const broadcast = (event, user) => page.evaluate(({ event, user }) => {
        const session = user ? { access_token: "smoke", refresh_token: "smoke", token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, user: { id: user, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: { vq_welcome_version: 1 } } } : null;
        if (session) localStorage.setItem("sb-127-auth-token", JSON.stringify(session));
        else localStorage.removeItem("sb-127-auth-token");
        new BroadcastChannel("sb-127-auth-token").postMessage({ event, session });
      }, { event, user });
      await broadcast("SIGNED_OUT", null);
      await page.waitForTimeout(800);
      await step(log, page, "signed-out", "Account A signed out in another tab");
      if (await page.getByRole("link", { name: /Build your lay · \d+ selected/ }).count()) log.findings.push("After sign-out, account A's lay in progress is still shown.");
      await broadcast("SIGNED_IN", UID_B);
      await page.waitForTimeout(800);
      await step(log, page, "account-b", "Account B signed in");
      if (await lay(1).count()) log.findings.push("Account B sees account A's lay in progress.");
      if (!(await lay(2).count())) log.findings.push("Account B's own lay in progress is not shown.");
      if (await page.locator("details.vq-game-row[open]").count()) log.findings.push("A game row opened during the account switch.");
    } catch (e) {
      log.findings.push(`walkthrough stopped: ${String(e).split("\n")[0].slice(0, 200)}`);
    }
    log.errors = errors;
    report.push(log);
    await ctx.close();
  }
  // ---------- Signed out ----------
  {
    const log = { id: `out-${width}`, width, signedIn: false, steps: [], findings: [] };
    const { ctx, page, errors } = await session(width, false);
    try {
      await page.goto(BASE + "/", { waitUntil: "networkidle" });
      await step(log, page, "home", "Landing, signed out");
      await page.locator("details.vq-game-row").first().locator("summary").click();
      await page.waitForTimeout(600);
      const open = await step(log, page, "home-game-open", "Opened a game, signed out");
      if (open.status.some((s) => /Sign in to see game props/.test(s)) && !open.actions.some((a) => /sign in|login|log in/i.test(a) && !/^link: Login/.test(a)))
        log.findings.push('Signed out, a game row says "Sign in to see game props." with no sign-in action next to it.');
      await page.goto(BASE + `/matchups/${SLUG}`, { waitUntil: "networkidle" });
      await step(log, page, "research-detail", "Research, signed out");
      await page.goto(BASE + "/parlays", { waitUntil: "networkidle" });
      await step(log, page, "builder", "Your lay, signed out");
      // The research-board publication link lands on that release in the research feed.
      await page.goto(BASE + `/feed?view=latest&release=${RELEASE}#release-${RELEASE}`, { waitUntil: "networkidle" });
      await page.locator(`#release-${RELEASE}`).first().waitFor({ timeout: 8000 }).catch(() => {});
      const pub = await step(log, page, "publication", "Original publication of a research-board leg");
      if (!pub.url.startsWith("/feed")) log.findings.push(`Original publication link redirected to ${pub.url} instead of the research feed.`);
      if (!(await page.locator(`#release-${RELEASE}`).count())) log.findings.push("Original publication link does not show the linked release.");
    } catch (e) {
      log.findings.push(`walkthrough stopped: ${String(e).split("\n")[0].slice(0, 200)}`);
    }
    log.errors = errors;
    report.push(log);
    await ctx.close();
  }
}
await browser.close();
fs.writeFileSync(path.join(OUT, "journey.json"), JSON.stringify(report, null, 2));
for (const r of report) {
  console.log(`\n== ${r.id}${r.errors.length ? `  (page errors: ${r.errors.length})` : ""}`);
  for (const s of r.steps) console.log(`  ${s.name.padEnd(18)} ${s.url}${s.overflowX ? "  [SIDEWAYS SCROLL]" : ""}`);
  for (const f of r.findings) console.log(`  ! ${f}`);
}
const total = report.reduce((n, r) => n + r.findings.length + r.errors.length, 0);
if (total) {
  console.error(`\n${total} journey finding(s).`);
  process.exit(1);
}
console.log("\nJourney walkthrough: no friction findings.");

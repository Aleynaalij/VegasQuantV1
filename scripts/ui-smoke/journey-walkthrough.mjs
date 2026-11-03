// U-C1 evidence capture: walks the daily journey Home → research → The Zone → build/save → reopen
// the saved lay, at 360/390/1280 px, signed out and signed in, and records what each step offers.
// Synthetic data only: published legs are bound to the stub's sample games and saved lays live in
// memory. No real accounts, saves, shares, wagers or external destinations.
// Needs the app on :3100 built with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 and
// scripts/ui-smoke/stub.mjs running (see check.mjs).
// Usage: node scripts/ui-smoke/journey-walkthrough.mjs [outDir]  → <outDir>/journey.json + screenshots
import fs from "node:fs";
import path from "node:path";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");

const BASE = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const OUT = process.argv[2] || "journey-evidence";
const UID = "00000000-0000-0000-0000-000000000001";
const NOW = "2026-10-14T02:00:00Z"; // the stub's pinned clock
const SLUG = "sample-sea-den-2026-10-15";
fs.mkdirSync(OUT, { recursive: true });

const tnf = "Seattle Seahawks @ Denver Broncos";
const legs = [
  ["g1", "Sample Runner", "Full game · 60+ rushing yards", tnf],
  ["g1", "Sample Receiver", "Full game · 50+ receiving yards", tnf],
  ["g1", "Sample Passer", "Full game · 190+ passing yards", tnf],
  ["g2", "Sample Back", "Full game · 50+ rushing yards", "Houston Texans @ Jacksonville Jaguars"],
].map(([game_id, name, market, matchup], i) => ({
  leg_key: `journey:${i}`, name, market, matchup, game_id, kind: "RESEARCH", quote: null,
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
  let mine = [];
  await ctx.route("**/rest/v1/**", async (route) => {
    const u = new URL(route.request().url()), p = u.pathname;
    if (p.endsWith("/published_legs") || p.endsWith("/published_leg_catalog"))
      return route.fulfill({ json: signedIn ? legs : [] });
    if (p.endsWith("/member_parlays"))
      return route.fulfill({ json: u.searchParams.has("id") ? mine.find((x) => `eq.${x.id}` === u.searchParams.get("id")) || null : mine });
    if (p.endsWith("/rpc/create_member_parlay")) {
      const body = route.request().postDataJSON();
      const id = `33333333-3333-4333-8333-${String(mine.length + 1).padStart(12, "0")}`;
      mine = [...mine, { id, title: body.p_title, legs: legs.filter((l) => body.p_leg_keys.includes(l.leg_key)), created_at: NOW, expires_at: "2026-10-16T00:15:00Z", community_post_id: null }];
      return route.fulfill({ json: id });
    }
    if (p.endsWith("/rpc/notification_inbox")) return route.fulfill({ json: { items: [], snapshot_at: NOW } });
    return route.fallback();
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(12000);
  await page.clock.setFixedTime(new Date(NOW));
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
  return { ctx, page, errors, saved: () => mine };
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
  return inv;
}
const closeDialogs = (page) => page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));

for (const width of [360, 390, 1280]) {
  // ---------- Signed in: the full journey ----------
  {
    const log = { id: `in-${width}`, width, signedIn: true, steps: [], findings: [] };
    const { ctx, page, errors, saved } = await session(width, true);
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
      await page.getByRole("link", { name: /Build your lay · 1 selected/ }).waitFor();
      const added = await step(log, page, "home-leg-added", "Added one prop to the lay from Home");
      const buildBox = await page.getByRole("link", { name: /Build your lay/ }).boundingBox();
      if (buildBox && (buildBox.y < 0 || buildBox.y > page.viewportSize().height))
        log.findings.push(`"Build your lay · 1 selected" appears off screen (y=${Math.round(buildBox.y)}) after adding: the confirmation is not where the tap happened.`);
      void added;

      // Research detail and back.
      await page.goto(BASE + `/matchups/${SLUG}`, { waitUntil: "networkidle" });
      const research = await step(log, page, "research-detail", "Game research (reached by URL: no link from Home)");
      if (!research.actions.some((a) => /\/parlays|your lay|build/i.test(a))) log.findings.push("Research page has no route to building a lay or to the selections already made.");
      if (!research.actions.some((a) => /\/community/.test(a) && !/^link: The Zone/.test(a))) log.findings.push("Research page has no route to The Zone discussion for this game (only the bottom nav).");
      await page.goBack({ waitUntil: "networkidle" });
      const back = await step(log, page, "home-after-back", "Browser Back from research");
      const stillOpen = await page.locator("details.vq-game-row[open]").count();
      if (!stillOpen) log.findings.push("Back from research returns Home with the game row collapsed; the opened game is lost.");
      if (!back.actions.some((a) => /Build your lay · 1 selected/.test(a))) log.findings.push("Back from research hides the lay in progress until a game is reopened.");

      // The Zone.
      await page.goto(BASE + "/community", { waitUntil: "networkidle" });
      await closeDialogs(page);
      const zone = await step(log, page, "zone", "The Zone");
      if (!zone.actions.some((a) => /\/parlays|your lay|build/i.test(a))) log.findings.push("The Zone has no route to the member's lay in progress or saved lays.");

      // Builder from the lay in progress.
      await page.goto(BASE + "/", { waitUntil: "networkidle" });
      await row.locator("summary").click();
      await page.getByRole("link", { name: /Build your lay · 1 selected/ }).click();
      await page.waitForURL(/\/parlays/);
      await page.waitForLoadState("networkidle");
      const builder = await step(log, page, "builder", "Opened the builder from Home");
      if (!builder.actions.some((a) => /Save my parlay/.test(a))) log.findings.push("Builder opened from Home does not show the started lay with a save action.");
      const add = page.getByRole("button", { name: "+ Add to parlay", exact: true });
      if (await add.count()) await add.first().click();
      await step(log, page, "builder-two-legs", "Added a second leg in the builder");
      const save = page.getByRole("button", { name: "Save my parlay", exact: true });
      if (await save.count()) {
        await save.click();
        await page.waitForTimeout(800);
        const done = await step(log, page, "saved", "Saved the lay");
        log.savedCompletion = done.status;
      } else log.findings.push("No save action available in the builder.");
      const id = saved()[0]?.id;
      if (id) {
        await page.goto(BASE + `/community?saved=${id}`, { waitUntil: "networkidle" });
        const reopened = await step(log, page, "reopen-saved", "Reopened the saved lay via its saved link");
        log.reopenUrl = reopened.url;
        const target = await page.locator(`#my-parlay-${id}`).count();
        if (!target) log.findings.push("Saved deep link does not land on the saved lay.");
      }
    } catch (e) {
      log.findings.push(`walkthrough stopped: ${String(e).split("\n")[0].slice(0, 200)}`);
      await step(log, page, "stopped", "Where the walkthrough stopped").catch(() => {});
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

// Mobile and navigation regression pass (C2). Synthetic data only; needs the app on :3100 built with
// NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 and scripts/ui-smoke/stub.mjs running (see check.mjs).
// Per route and width, signed out and signed in: no sideways scroll (naming the widest element), the
// fixed phone nav never covers the end of the page, nav targets are tappable and labels are not cut,
// tab and back navigation work, and empty or failing data shows a page rather than a crash.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");

const BASE = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const SHOTS = process.env.UI_SMOKE_SHOTS || "";
const routes = [
  "/", "/feed", "/feed?view=parlays", "/matchups", "/matchups/sample-sea-den-2026-10-15",
  "/community", "/membership", "/nba", "/nhl", "/ncaab", "/slots", "/notifications",
  "/faq", "/about", "/responsible-play", "/no-such-page",
];
const widths = [[320, 640], [360, 740], [390, 844], [1280, 900]];
const session = () => {
  localStorage.setItem("sb-127-auth-token", JSON.stringify({
    access_token: "smoke", refresh_token: "smoke", token_type: "bearer", expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400 * 400,
    user: { id: "00000000-0000-0000-0000-000000000001", aud: "authenticated", role: "authenticated",
      email: "smoke@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-10-01T00:00:00Z" },
  }));
};

const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {});
const failures = [];
const note = (label, msg) => failures.push(`${label}: ${msg}`);

async function open(ctx, path, label) {
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install({ time: new Date("2026-10-14T02:00:00Z") });
  const res = await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 45000 }).catch((e) => (errors.push(String(e)), null));
  await page.clock.runFor(1500).catch(() => {});
  await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close())).catch(() => {});
  const status = res?.status() ?? 0;
  if (status >= 500 || (status >= 400 && path !== "/no-such-page")) note(label, `HTTP ${status}`);
  return { page, errors };
}

// Layout checks for one rendered page.
async function layout(page, label, phone) {
  const r = await page.evaluate((phone) => {
    const vw = window.innerWidth;
    const overflow = document.documentElement.scrollWidth - vw;
    let widest = null;
    if (overflow > 1)
      for (const el of document.querySelectorAll("body *")) {
        const b = el.getBoundingClientRect();
        if (b.width && b.right > vw + 1 && getComputedStyle(el).position !== "fixed" && (!widest || b.right > widest.right))
          widest = { right: Math.round(b.right), tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 60) };
      }
    const nav = phone ? document.querySelector(".mobile-nav") : null;
    const navBox = nav && getComputedStyle(nav).display !== "none" ? nav.getBoundingClientRect() : null;
    const links = nav ? [...nav.querySelectorAll("a")].map((a) => {
      const b = a.getBoundingClientRect();
      return { text: a.innerText.trim(), w: Math.round(b.width), h: Math.round(b.height), cut: a.scrollWidth > a.clientWidth + 1 };
    }) : [];
    return { overflow, widest, navBox: navBox && { top: navBox.top, height: navBox.height }, links, fatal: document.body.innerText.includes("The desk hit a snag"), text: document.body.innerText.length };
  }, phone);
  if (r.overflow > 1) note(label, `scrolls sideways by ${r.overflow}px` + (r.widest ? ` (widest: <${r.widest.tag} class="${r.widest.cls}"> to ${r.widest.right}px)` : " (no element box overflows; likely a pseudo-element)"));
  if (r.fatal) note(label, "shows the full-page error");
  if (r.text < 40) note(label, `nearly empty page (${r.text} characters)`);
  if (phone) {
    if (!r.navBox) note(label, "phone nav missing");
    for (const l of r.links) {
      if (l.h < 44 || l.w < 40) note(label, `nav "${l.text}" target ${l.w}x${l.h}px (< 44px tall or < 40px wide)`);
      if (l.cut) note(label, `nav label "${l.text}" is cut off`);
    }
    // Scroll to the end: the last visible content must clear the fixed nav.
    if (r.navBox) {
      const end = await page.evaluate(async () => {
        // Scroll until the bottom stops moving: late layout can grow the page after the first jump.
        for (let y = -1, i = 0; i < 8 && y !== scrollY; i++) {
          y = scrollY;
          window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
          await new Promise((r) => setTimeout(r, 250));
        }
        const nav = document.querySelector(".mobile-nav").getBoundingClientRect();
        let last = null;
        for (const el of document.querySelectorAll("main *, footer *, .vq-footer-links *")) {
          if (el.closest(".mobile-nav") || !el.innerText?.trim() || el.children.length) continue;
          const s = getComputedStyle(el);
          if (s.visibility === "hidden" || s.display === "none" || s.position === "fixed") continue;
          const b = el.getBoundingClientRect();
          if (b.height && (!last || b.bottom > last.bottom)) last = { bottom: b.bottom, text: el.innerText.trim().slice(0, 40) };
        }
        return { navTop: nav.top, last };
      });
      if (end.last && end.last.bottom > end.navTop + 1) note(label, `last content "${end.last.text}" sits ${Math.round(end.last.bottom - end.navTop)}px under the fixed nav`);
    }
  }
}

for (const signedIn of [false, true])
  for (const [width, height] of widths) {
    const phone = width < 760;
    const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
    if (signedIn) await ctx.addInitScript(session);
    // The stub answers unknown RPCs with null; the inbox RPC always returns this object shape
    // (supabase/migrations/20261017015506_social_notification_system.sql), so answer with it.
    await ctx.route("**/rest/v1/rpc/notification_inbox", (route) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [], snapshot_at: "2026-10-14T02:00:00Z" }) }));
    for (const path of routes) {
      const label = `${path} @${width}${signedIn ? " signed in" : ""}`;
      const before = failures.length;
      const { page, errors } = await open(ctx, path, label);
      await layout(page, label, phone);
      if (errors.length) note(label, `page error · ${errors[0].slice(0, 160)}`);
      if (SHOTS && (width === 390 || width === 320) && ["/", "/feed", "/membership"].includes(path))
        await page.screenshot({ path: `${SHOTS}/${path.replace(/\W+/g, "_") || "home"}-${width}${signedIn ? "-in" : ""}.png`, fullPage: false });
      await page.close();
      console.log(`${failures.length > before ? "FAIL" : "ok  "} ${label}`);
    }
    await ctx.close();
  }

// Tab and back navigation through the phone nav and the desktop sidebar.
for (const [width, height, sel] of [[390, 844, ".mobile-nav"], [1280, 900, ".sidebar"]]) {
  const label = `navigation @${width}`;
  const before = failures.length;
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
  const { page, errors } = await open(ctx, "/", label);
  const hrefs = await page.locator(`${sel} a[href^="/"]`).evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")))].slice(0, 5));
  if (hrefs.length < 2) note(label, `only ${hrefs.length} nav link(s) found`);
  const visited = ["/"];
  for (const href of hrefs.filter((h) => h !== "/")) {
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.locator(`${sel} a[href="${href}"]`).first().click();
    await page.waitForURL((u) => u.pathname + u.search === href, { timeout: 15000 }).catch(() => note(label, `tab ${href} did not navigate (at ${page.url()})`));
    visited.push(href);
  }
  for (let i = visited.length - 2; i >= 0; i--) {
    await page.goBack().catch(() => {});
    // Client-side navigation commits the URL after goBack resolves: wait for it, then compare.
    await page.waitForURL((u) => u.pathname + u.search === visited[i], { timeout: 15000 }).catch(() => {});
    const now = new URL(page.url());
    if (now.pathname + now.search !== visited[i]) note(label, `back went to ${now.pathname + now.search}, expected ${visited[i]}`);
  }
  if (errors.length) note(label, `page error · ${errors[0].slice(0, 160)}`);
  await ctx.close();
  console.log(`${failures.length > before ? "FAIL" : "ok  "} ${label} (${hrefs.join(" ")})`);
}

// Empty and failing data. Empty: every table read returns [] (RPCs keep their documented object
// shapes from the stub). Failing: every REST call, RPCs included, returns HTTP 500. The page must still
// render a shell with readable content, no uncaught error and no sideways scroll.
for (const [mode, fulfill] of [
  ["empty data", (route) => route.request().url().includes("/rest/v1/rpc/") ? route.fallback() : route.fulfill({ contentType: "application/json", body: "[]" })],
  ["failing data", (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"message":"synthetic failure"}' })],
])
  for (const path of ["/", "/feed", "/matchups", "/community", "/nhl"]) {
    const label = `${path} @390 ${mode}`;
    const before = failures.length;
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    await ctx.route("**/rest/v1/**", fulfill);
    const { page, errors } = await open(ctx, path, label);
    await layout(page, label, true);
    if (errors.length) note(label, `page error · ${errors[0].slice(0, 160)}`);
    await ctx.close();
    console.log(`${failures.length > before ? "FAIL" : "ok  "} ${label}`);
  }

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} mobile/navigation failure(s):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nMobile/navigation pass passed.");

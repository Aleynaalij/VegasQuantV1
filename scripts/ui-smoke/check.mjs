// UI smoke test: every key page renders at phone and desktop width, signed out and in,
// without crashing, without sideways scroll, and with its main content.
// Needs the app on :3100 built with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 and the stub running.
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);

const BASE = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const pages = [
  { path: "/", expect: ["Next kickoff", "21+"] },
  { path: "/feed", expect: ["The Zone", "Signature contributors"] },
  { path: "/feed?view=parlays", expect: ["Sample Sunday sleeper parlay", "3-leg parlay"] },
  { path: "/feed?view=wins", expect: ["Five legs. One $218 win."] },
  { path: "/matchups", expect: ["Seahawks"] },
  { path: "/matchups/sample-sea-den-2026-10-15", expect: ["Follow Seahawks", "Follow Broncos"] },
  // Records are admin-only.
  { path: "/history", expect: ["Records are private."] },
  { path: "/performance", expect: ["Records are private."] },
  { path: "/community", expect: [] },
  { path: "/membership", expect: [] },
  { path: "/methodology", expect: [] },
  { path: "/no-such-page", expect: [] },
];
const signedIn = [
  { path: "/membership", expect: ["Your account", "Privacy · Delete account"] },
  { path: "/", expect: ["Next kickoff", "Matchup", "Simulator"] },
  { path: "/community", expect: ["Community", "SampleMember", "Sample post body."] },
  { path: "/history", expect: ["Records are private."] },
];
const admin = [
  { path: "/history", expect: ["Vegas Quant published record", "Profit at published prices", "1 graded pick was published without a price", "Beat the close", "1–1–1"] },
  { path: "/performance", expect: ["By sport", "Research model vs the market", "Too close to call"] },
];
const session = () => {
  const exp = Math.floor(Date.now() / 1000) + 86400 * 400;
  localStorage.setItem(
    "sb-127-auth-token",
    JSON.stringify({
      access_token: "smoke",
      token_type: "bearer",
      expires_in: 86400,
      expires_at: exp,
      refresh_token: "smoke",
      user: {
        id: "00000000-0000-0000-0000-000000000001",
        aud: "authenticated",
        role: "authenticated",
        email: "smoke@example.com",
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-10-01T00:00:00Z",
      },
    }),
  );
};

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
    : {},
);
const failures = [];
for (const [list, auth, isAdmin] of [
  [pages, false, false],
  [signedIn, true, false],
  [admin, true, true],
])
  for (const [width, height] of [
    [390, 844],
    [1280, 900],
  ]) {
    const ctx = await browser.newContext({
      viewport: { width, height },
      reducedMotion: "reduce",
    });
    if (auth) await ctx.addInitScript(session);
    if (isAdmin)
      await ctx.route("**/rest/v1/rpc/is_admin", (route) =>
        route.fulfill({ contentType: "application/json", body: "true" }),
      );
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date("2026-10-14T02:00:00Z") });
    for (const { path, expect } of list) {
      const label = `${path} @${width}${isAdmin ? " admin" : auth ? " signed in" : ""}`;
      const before = failures.length;
      const errors = [];
      page.removeAllListeners("pageerror");
      page.on("pageerror", (e) => errors.push(e.message));
      const res = await page
        .goto(BASE + path, { waitUntil: "networkidle", timeout: 45000 })
        .catch((e) => (errors.push(String(e)), null));
      await page.clock.runFor(1500).catch(() => {});
      await page.evaluate(() =>
        document.querySelectorAll("dialog[open]").forEach((d) => d.close()),
      );
      // Long lists use content-visibility: auto, so cards below the fold are skipped from rendering
      // and from innerText until scrolled to. Render everything before reading the page's text.
      await page
        .addStyleTag({ content: "* { content-visibility: visible !important; }" })
        .catch(() => {});
      const status = res?.status() ?? 0;
      if (auth && path === "/membership") {
        const panels = await page
          .getByRole("heading", { name: "Verify your age · 21+", exact: true })
          .count();
        if (panels !== 1)
          failures.push(
            `${label}: expected one age verification panel, found ${panels}`,
          );
      }
      if (status >= 500 || (status >= 400 && path !== "/no-such-page"))
        failures.push(`${label}: HTTP ${status}`);
      if (errors.length)
        failures.push(`${label}: page error · ${errors[0].slice(0, 200)}`);
      if (path === "/") {
        // The next-kickoff card sits open on Home, directly under Today's Double Up.
        const kickoff = await page.evaluate(() => {
          const card = document.querySelector(".home-brief");
          return {
            visible: !!card && !card.closest("details") && card.getBoundingClientRect().height > 0,
            afterDoubleUp: card?.previousElementSibling?.classList.contains("ruby-double-up") ?? false,
          };
        });
        if (!kickoff.visible || !kickoff.afterDoubleUp)
          failures.push(`${label}: next-kickoff card not shown under Today's Double Up`);
        await page.locator(".ruby-home-details").evaluateAll(nodes => nodes.forEach(node => node.open = true));
      }
      const state = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        text: document.body.innerText,
        fatal: document.body.innerText.includes("The desk hit a snag"),
      }));
      if (state.overflow > 1)
        failures.push(`${label}: scrolls sideways by ${state.overflow}px`);
      if (state.fatal) failures.push(`${label}: shows the full-page error`);
      // The Records tab is in the menu for the admin only.
      const recordsTabs = await page
        .locator(`${width < 760 ? ".mobile-nav" : ".sidebar"} a[href="/history"]`)
        .count();
      if (recordsTabs !== (isAdmin ? 1 : 0))
        failures.push(`${label}: ${recordsTabs} Records tab(s) in the menu`);
      for (const t of expect)
        if (!state.text.toLowerCase().includes(t.toLowerCase()))
          failures.push(`${label}: missing "${t}"`);
      console.log(`${failures.length > before ? "FAIL" : "ok  "} ${label}`);
    }
    await ctx.close();
  }
await browser.close();
if (failures.length) {
  console.error(
    `\n${failures.length} UI smoke failure(s):\n- ${failures.join("\n- ")}`,
  );
  process.exit(1);
}
console.log("\nUI smoke passed.");

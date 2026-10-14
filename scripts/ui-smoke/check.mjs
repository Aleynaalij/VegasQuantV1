// UI smoke test: every key page renders at phone and desktop width, signed out and in,
// without crashing, without sideways scroll, and with its main content.
// Needs the app on :3100 built with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 and the stub running.
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);

const BASE = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const pages = [
  { path: "/", expect: ["Next kickoff", "21+"] },
  { path: "/feed", expect: ["The Zone", "How it works"] },
  { path: "/matchups", expect: ["Seahawks"] },
  { path: "/history", expect: ["Vegas Quant published record", "Sample"] },
  { path: "/performance", expect: ["By sport"] },
  { path: "/community", expect: [] },
  { path: "/membership", expect: [] },
  { path: "/nba", expect: [] },
  { path: "/nba/rules", expect: ["R-12"] },
  { path: "/methodology", expect: [] },
  { path: "/no-such-page", expect: [] },
];
const signedIn = [
  { path: "/membership", expect: ["Your account", "Privacy · Delete account"] },
  { path: "/", expect: ["Pick of the Day", "Legs we like", "For you"] },
  { path: "/community", expect: ["Tail leaderboard", "SampleMember"] },
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
for (const [list, auth] of [
  [pages, false],
  [signedIn, true],
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
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date("2026-10-14T02:00:00Z") });
    for (const { path, expect } of list) {
      const label = `${path} @${width}${auth ? " signed in" : ""}`;
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
      const state = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        text: document.body.innerText,
        fatal: document.body.innerText.includes("The desk hit a snag"),
      }));
      if (state.overflow > 1)
        failures.push(`${label}: scrolls sideways by ${state.overflow}px`);
      if (state.fatal) failures.push(`${label}: shows the full-page error`);
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

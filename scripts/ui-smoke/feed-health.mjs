// Synthetic read-only admin health presentation. No collector invocation or production access.
import fs from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const out = process.argv[2] || "/tmp/feed-health-evidence";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
    : {},
);
const failures = [];
const providers = [
  "ESPN",
  "ESPN injuries",
  "ESPN news",
  "The Odds API",
  "The Odds API props",
  "Editorial result sync",
];
try {
  for (const width of [390, 1280])
    for (const mode of ["healthy", "failed-stale", "query-error", "denied"]) {
      const ctx = await browser.newContext({
        viewport: { width, height: 900 },
        reducedMotion: "reduce",
      });
      await ctx.addInitScript(() => {
        const uid = "00000000-0000-0000-0000-000000000001";
        localStorage.setItem(`vq-app-refresh:${uid}`, "gold-2026-10-22-v2");
        localStorage.setItem(
          `vq-push-prompt:${uid}`,
          String(Date.now() + 7 * 86400000),
        );
        localStorage.setItem(
          "sb-127-auth-token",
          JSON.stringify({
            access_token: "smoke",
            refresh_token: "smoke",
            token_type: "bearer",
            expires_in: 86400,
            expires_at: Math.floor(Date.now() / 1000) + 86400,
            user: {
              id: uid,
              aud: "authenticated",
              role: "authenticated",
              email: "smoke@example.com",
              app_metadata: {},
              user_metadata: { vq_welcome_version: 1 },
            },
          }),
        );
      });
      await ctx.route("**/rest/v1/rpc/is_admin", (r) =>
        r.fulfill({ json: mode !== "denied" }),
      );
      await ctx.route("**/rest/v1/research_feed_posts*", (r) =>
        r.fulfill({ json: [{ created_at: new Date().toISOString() }] }),
      );
      await ctx.route("**/rest/v1/published_legs*", (r) =>
        r.fulfill({ json: [] }),
      );
      await ctx.route("**/rest/v1/feed_runs*", (r) =>
        mode === "query-error"
          ? r.fulfill({ status: 500, json: { message: "Synthetic failure" } })
          : r.fulfill({
              json: providers.map((provider, i) => ({
                id: String(i),
                provider,
                status: mode === "failed-stale" && i === 0 ? "error" : "ok",
                created_at: new Date(
                  Date.now() -
                    (mode === "failed-stale" && i === 0 ? 31 * 60000 : 0),
                ).toISOString(),
                details: { quoted_markets: 1 },
              })),
            }),
      );
      const page = await ctx.newPage();
      const fail = (message) => failures.push(`${width}/${mode}: ${message}`);
      try {
        await page.goto(
          (process.env.UI_SMOKE_URL || "http://127.0.0.1:3100") +
            "/admin/feeds",
          { waitUntil: "networkidle" },
        );
        if (
          process.env.UI_SMOKE_NEGATIVE === "false-coverage" &&
          mode === "healthy"
        )
          await page.evaluate(() => {
            document.body.append(
              Object.assign(document.createElement("p"), {
                textContent: "All sports coverage verified",
              }),
            );
          });
        // networkidle can precede React's committed authorization/query state.
        await page.waitForFunction(mode => {
          const text=document.body.innerText;
          return mode==="denied" ? text.includes("Sign in and verify your administrator account.")
            : mode==="query-error" ? text.includes("Health queries failed; coverage cannot be verified.")
            : mode==="failed-stale" ? text.includes("error; refresh older than 30 minutes")
            : text.includes("six listed NFL feed checks");
        }, mode);
        const text = await page.locator("body").innerText();
        if (/All sports coverage verified/.test(text))
          fail("false multisport coverage promise");
        if (mode === "healthy" && !text.includes("six listed NFL feed checks"))
          fail("NFL scope missing");
        if (
          mode !== "denied" &&
          !text.includes("does not verify NBA, NHL or college pipeline health")
        )
          fail("coverage limitation missing");
        if (
          mode === "failed-stale" &&
          !/error; refresh older than 30 minutes/.test(text)
        )
          fail("old failed job lost its failure state");
        if (
          mode === "query-error" &&
          !text.includes("Health queries failed; coverage cannot be verified.")
        )
          fail("read failure hidden");
        if (
          mode === "query-error" &&
          text.includes(
            "six listed NFL feed checks and research publication timing checks are current",
          )
        )
          fail("false success after query failure");
        if (
          mode === "denied" &&
          !text.includes("Sign in and verify your administrator account.")
        )
          fail("admin gate missing");
        if (
          mode === "denied" &&
          text.includes("Launch and reliability priorities")
        )
          fail("admin panel leaked");
        if (
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 1,
          )
        )
          fail("horizontal overflow");
        await page.screenshot({
          path: `${out}/${width}-${mode}.png`,
          fullPage: true,
        });
      } catch (error) {
        fail(String(error).slice(0, 180));
      } finally {
        await ctx.close();
      }
    }
} finally {
  await browser.close();
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else console.log("8 synthetic feed-health browser cases passed");

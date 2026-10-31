// Tests the actual Corner -> NHL integration with synthetic accounts/RPCs only.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const base = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const uid = "00000000-0000-0000-0000-000000000001",
  token = "00000000-0000-4000-8000-000000000042";
const version = readFileSync(
  "src/components/app-refresh-notice.tsx",
  "utf8",
).match(/const VERSION = "([^"]+)"/)[1];
try {
  for (const width of [390, 1280]) {
    const ctx = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
    });
    await ctx.addInitScript(
      ({ uid, version }) => {
        sessionStorage.setItem("vq-prompt-shown", "fixture");
        localStorage.setItem("vq-app-refresh:" + uid, version);
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
              app_metadata: {},
              user_metadata: { vq_welcome_version: 1 },
            },
          }),
        );
      },
      { uid, version },
    );
    let revealed = false,
      celebrated = false,
      arrivals = 0,
      slateReady = false;
    await ctx.route("**/rest/v1/rpc/ruby_home", (r) =>
      r.fulfill({
        json: {
          user_id: uid,
          day: "2026-10-31",
          contributor: {
            user_id: uid,
            brand: "FranksCorner",
            theme: "corner",
            active: true,
          },
          submission_count: 0,
          due: [],
          admin: false,
        },
      }),
    );
    await ctx.route("**/rest/v1/ruby_cards?**", (r) => r.fulfill({ json: [] }));
    await ctx.route("**/rest/v1/rpc/ruby_record_summary", (r) =>
      r.fulfill({ json: [] }),
    );
    await ctx.route("**/rest/v1/rpc/frank_anniversary", (r) => {
      const p = JSON.parse(r.request().postData() || "{}");
      let state = { state: "hidden" };
      if (p.p_action === "status")
        state = celebrated
          ? { state: "done" }
          : revealed
            ? { state: "revealed", token }
            : { state: "offer" };
      if (p.p_action === "reveal") {
        revealed = true;
        state = { state: "revealed", token };
      }
      if (p.p_action === "arrive") {
        assert.equal(
          slateReady,
          true,
          "receipt must not be consumed by the NHL skeleton",
        );
        if (revealed && !celebrated && p.p_token === token) {
          celebrated = true;
          arrivals++;
          state = { state: "celebrate" };
        } else state = { state: "done" };
      }
      return r.fulfill({ json: state });
    });
    await ctx.route("**/rest/v1/rpc/sports_home", async (r) => {
      const fixture = JSON.parse(
        readFileSync("tests/fixtures/sports/nhl/page.json", "utf8"),
      );
      fixture.games[0].start_time = new Date(
        Date.now() + 6 * 3600000,
      ).toISOString();
      fixture.markets = [];
      fixture.selections = [];
      fixture.access = true;
      await new Promise((done) => setTimeout(done, 350));
      slateReady = true;
      return r.fulfill({ json: fixture });
    });
    const p = await ctx.newPage(),
      errors = [];
    p.setDefaultTimeout(15000);
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(base + "/", { waitUntil: "load" });
    await p.locator(".ruby-submit-drawer").waitFor();
    // Close unrelated welcome prompts before opening Frank's private desk.
    await p.evaluate(() =>
      document.querySelectorAll("dialog[open]").forEach((d) => d.close()),
    );
    await p.locator(".ruby-submit-drawer > summary").click();
    const invitation = p.getByRole("dialog", {
      name: "Happy anniversary, Frank!",
    });
    await invitation.waitFor();
    assert.equal(
      await invitation
        .getByRole("button", { name: "Yes", exact: true })
        .count(),
      2,
    );
    await invitation
      .getByRole("button", { name: "Yes", exact: true })
      .nth(width === 390 ? 0 : 1)
      .click();
    await p.waitForURL((u) => u.pathname === "/nhl");
    await p.getByTestId("frank-anniversary-fireworks").waitFor();
    assert.equal(arrivals, 1);
    assert.equal(celebrated, true);
    await p.waitForURL(base + "/nhl");
    await p.goto(base + "/nhl?vq-anniversary=" + token, { waitUntil: "load" });
    await p.locator(".sport-home .vq-matchup").waitFor();
    await p.waitForTimeout(200);
    assert.equal(await p.getByTestId("frank-anniversary-fireworks").count(), 0);
    assert.equal(arrivals, 1);
    await p.goto(base + "/", { waitUntil: "load" });
    await p.locator(".ruby-submit-drawer").waitFor();
    await p.locator(".ruby-submit-drawer > summary").click();
    await p.locator(".ruby-submit-content button").click();
    await p.waitForTimeout(200);
    assert.equal(
      await p
        .getByRole("dialog", { name: "Happy anniversary, Frank!" })
        .count(),
      0,
    );
    assert.deepEqual(errors, []);
    await ctx.close();
    console.log(
      `PASS actual anniversary release flow ${width}px: Corner mount, both Yes choices, real ready NHL mount and no replay`,
    );
  }
} finally {
  await browser.close();
}

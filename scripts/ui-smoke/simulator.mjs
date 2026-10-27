// Game simulator preview (#132): admin-only, renders the synthetic DEMO run at phone and desktop
// width, plays/scrubs/jumps without page errors or sideways scroll, and honors reduced motion.
// Needs the app on :3100 built with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 and the stub.
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);

const BASE = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const SHOTS = process.env.SIM_SHOTS || "/tmp";
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

// App-wide prompts (profile setup, app refresh) open over any page; the simulator has no dialogs.
const closePrompts = () =>
  new MutationObserver(() =>
    document.querySelectorAll("dialog[open]").forEach((d) => d.close()),
  ).observe(document, { subtree: true, childList: true, attributes: true });
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
    : {},
);
for (const [width, height] of [
  [390, 844],
  [1280, 900],
]) {
  for (const reducedMotion of ["no-preference", "reduce"]) {
    const errors = [];
    // A signed-in member who isn't an admin sees no simulator.
    const member = await browser.newContext({ viewport: { width, height } });
    await member.addInitScript(session);
    const mp = await member.newPage();
    mp.on("pageerror", (e) => errors.push(e.message));
    await mp.goto(BASE + "/simulator", { waitUntil: "networkidle" });
    await mp.getByText("isn’t open to members yet", { exact: false }).waitFor();
    assert.equal(await mp.locator(".sim").count(), 0);
    await member.close();

    const ctx = await browser.newContext({
      viewport: { width, height },
      reducedMotion,
    });
    await ctx.addInitScript(session);
    await ctx.addInitScript(closePrompts);
    await ctx.route("**/rest/v1/rpc/is_admin", (route) =>
      route.fulfill({ contentType: "application/json", body: "true" }),
    );
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(BASE + "/simulator", { waitUntil: "networkidle" });
    const sim = page.locator(".sim");
    await sim.waitFor();
    assert.match(
      await sim.innerText(),
      /Synthetic demo game, not a prediction/,
    );
    assert.match(await sim.innerText(), /DEMO · synthetic game/i);
    assert.equal(await page.locator("svg.sim-field").count(), 1);
    assert.match(await page.locator(".sim-now").innerText(), /kickoff/i);

    // Next play: the ticker, situation and field follow the event stream.
    await page.getByRole("button", { name: "Next play" }).click();
    assert.match(
      await page.locator(".sim-now").innerText(),
      /Demo RB Bandit run, 4 yds/,
    );
    assert.equal(
      await page.locator(".sim-situation").innerText(),
      "1st & 10 at VQB 25",
    );
    if (width < 760 && reducedMotion === "no-preference") {
      await page.waitForTimeout(2500);
      await page.locator(".sim-head").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${SHOTS}/vq-sim-390.png` });
    }

    // Play advances on its own, and pause stops it.
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForFunction(
      () => Number(document.querySelector(".sim-scrub input")?.value) >= 3,
      null,
      { timeout: 15000 },
    );
    await page.getByRole("button", { name: "Pause" }).click();
    const paused = await page.locator(".sim-scrub input").inputValue();
    await page.waitForTimeout(1600);
    assert.equal(await page.locator(".sim-scrub input").inputValue(), paused);

    // Jump to Q3, then scrub to the end: the final score comes from the events.
    await page.getByRole("button", { name: "Q3", exact: true }).click();
    assert.match(await page.locator(".sim-clock").innerText(), /Q3/);
    await page.locator(".sim-scrub input").fill("86");
    const board = await page.locator(".sim-board").innerText();
    assert.match(board, /VQB\s*20/);
    assert.match(board, /VQA\s*17/);
    assert.match(await page.locator(".sim-now").innerText(), /End of Q4/);

    // No ranges or player chances in a demo; the box score is counted from plays.
    await page.getByRole("tab", { name: "Ranges" }).click();
    assert.match(
      await page.locator(".sim-panel").innerText(),
      /No ranges for this game/,
    );
    await page.getByRole("tab", { name: "Players" }).click();
    assert.match(
      await page.locator(".sim-panel").innerText(),
      /No player ranges/,
    );
    await page.getByRole("tab", { name: "Box score" }).click();
    assert.match(
      await page.locator(".sim-panel").innerText(),
      /Demo QB Bandit/,
    );
    assert.doesNotMatch(
      await sim.innerText(),
      /\d+(\.\d+)?%/,
      "no percentages in a demo",
    );

    // The accessible play list jumps to a play.
    await page.getByText("All 87 plays").click();
    await page.locator(".sim-list button").nth(11).click();
    assert.match(await page.locator(".sim-now").innerText(), /field goal GOOD/);

    if (width < 760 && reducedMotion === "no-preference")
      await page.screenshot({
        path: `${SHOTS}/vq-sim-390-fg.png`,
        fullPage: true,
      });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    );
    assert.ok(overflow <= 1, `scrolls sideways by ${overflow}px at ${width}`);
    assert.deepEqual(errors, []);
    await ctx.close();
    console.log(`ok   simulator @${width} ${reducedMotion}`);
  }
}
await browser.close();
console.log("Simulator preview passed.");

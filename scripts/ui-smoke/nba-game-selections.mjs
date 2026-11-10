// Synthetic local fixtures only. All external requests are intercepted or blocked.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const base = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const uid = "00000000-0000-4000-8000-000000000001";
const version = readFileSync(
  "src/components/app-refresh-notice.tsx",
  "utf8",
).match(/const VERSION = "([^"]+)"/)[1];
try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 950 },
      reducedMotion: "reduce",
    });
    await context.addInitScript(
      ({ uid, version }) => {
        sessionStorage.setItem("vq-prompt-shown", "fixture");
        localStorage.setItem("vq-app-refresh:" + uid, version);
        localStorage.setItem(
          "sb-127-auth-token",
          JSON.stringify({
            access_token: "smoke",
            refresh_token: "smoke",
            token_type: "bearer",
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
    let member = true,
      failure = false,
      empty = false,
      ageVerified = true,
      reads = 0,
      delay = null;
    const game = {
      id: "game-a",
      slug: "fixture-a",
      provider_id: "fixture",
      away_team: "Boston Celtics",
      home_team: "Detroit Pistons",
      away_abbreviation: "BOS",
      home_abbreviation: "DET",
      tipoff: new Date(Date.now() + 3600000).toISOString(),
      tipoff_tbd: false,
      season_type: 2,
      season: 2027,
      status: "STATUS_SCHEDULED",
      venue: "Fixture Arena",
      away_score: null,
      home_score: null,
      updated_at: new Date().toISOString(),
    };
    const pick = {
      id: "pick-a",
      game_id: game.id,
      player: "Fixture Selection A",
      market: "player_points",
      direction: "Over",
      line: 20.5,
      odds: -110,
      book: "FanDuel",
      rationale: "Fixture case",
      risk: "Fixture risk",
      unknowns: "Fixture unknowns",
      sources: [],
      evidence_sources: [],
      supersedes_id: null,
      published_at: new Date().toISOString(),
      expires_at: game.tipoff,
      quote_observed_at: new Date().toISOString(),
      quote_recorded_at: new Date().toISOString(),
      quote_source_url: "https://example.com/fixture",
    };
    let picks = [
      pick,
      {
        ...pick,
        id: "other-game",
        game_id: "game-b",
        player: "Other game must stay hidden",
      },
    ];
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith("/rest/v1/")) {
        let data = [];
        if (url.pathname.endsWith("membership_status"))
          data = { allowed: member, admin: false };
        if (url.pathname.endsWith("age_verification_status"))
          data = { required: true, verified: ageVerified };
        if (url.pathname.endsWith("nba_games")) {
          const g =
            url.searchParams.get("slug") === "eq.fixture-b"
              ? { ...game, id: "game-b", slug: "fixture-b" }
              : game;
          data = url.searchParams.has("slug") ? g : [g];
        }
        if (url.pathname.endsWith("nba_editorial_picks")) {
          assert.equal(member, true, "no protected payload before access");
          reads++;
          assert.ok(url.searchParams.has("game_id"), "game filter required");
          const requestedGame = url.searchParams.get("game_id");
          const rows = picks;
          if (delay && requestedGame === "eq.game-a") await delay;
          if (failure)
            return route.fulfill({
              status: 500,
              json: { message: "Fixture failure" },
            });
          data = empty || requestedGame === "eq.game-b" ? [] : rows;
        }
        return route.fulfill({ json: data });
      }
      if (url.pathname.startsWith("/auth/v1/"))
        return route.fulfill({
          json: {
            id: uid,
            aud: "authenticated",
            app_metadata: {},
            user_metadata: {},
          },
        });
      if (url.origin === base) {
        if (url.pathname.startsWith("/api/"))
          return route.fulfill({ json: {} });
        return route.continue();
      }
      return route.abort();
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const section = page.locator(".nba-game-selections");
    await page.goto(base + "/nba/games/fixture-a");
    await section.getByText("Fixture Selection A", { exact: true }).waitFor();
    assert.equal(await section.locator(".vqc").count(), 1);
    await section
      .getByRole("button", { name: "Copy pick & open Gambly" })
      .click();
    const dialog = page.locator("dialog[open]");
    await dialog.getByLabel("I confirm I am 21 or older.").waitFor();
    assert.equal(
      await dialog
        .getByRole("button", { name: "Copy pick to clipboard" })
        .count(),
      0,
    );
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await page.locator("dialog[open]").count(), 0);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: `/tmp/nba-selections-${width}.png`,
      fullPage: true,
    });
    // The expanded home row uses the same publication card before its source research.
    await page.goto(base + "/nba");
    await page
      .locator(".vq-game-row")
      .first()
      .evaluate((d) => {
        d.open = true;
      });
    await section.getByText("Fixture Selection A", { exact: true }).waitFor();
    assert.equal(
      await page.evaluate(() => {
        const a = document.querySelector(".nba-game-selections"),
          b = document.querySelector(".nba-game-details");
        return (
          !b ||
          !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
        );
      }),
      true,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    // Query failure must not imply zero published picks; retry can recover to truthful empty.
    failure = true;
    await page.goto(base + "/nba/games/fixture-a");
    await section.getByRole("alert").waitFor();
    assert.equal(
      await section
        .getByText("No VQ selections published for this game", { exact: true })
        .count(),
      0,
    );
    failure = false;
    empty = true;
    await section.getByRole("button", { name: "Retry selections" }).click();
    await section
      .getByText("No VQ selections published for this game", { exact: true })
      .waitFor();
    empty = false;
    // Revisions, expired prices, live/final, and delayed scheduled games are retained but untailable.
    for (const state of [
      "expired",
      "live",
      "final",
      "elapsed-tip",
      "revision",
    ]) {
      game.status =
        state === "live"
          ? "STATUS_IN_PROGRESS"
          : state === "final"
            ? "STATUS_FINAL"
            : "STATUS_SCHEDULED";
      game.tipoff = new Date(
        Date.now() + (state === "elapsed-tip" ? -60000 : 3600000),
      ).toISOString();
      picks = [
        {
          ...pick,
          expires_at: new Date(
            Date.now() + (state === "expired" ? -60000 : 3600000),
          ).toISOString(),
        },
      ];
      if (state === "revision")
        picks.push({
          ...pick,
          id: "pick-revised",
          player: "Fixture Revision",
          supersedes_id: pick.id,
          expires_at: new Date(Date.now() - 60000).toISOString(),
        });
      await page.reload();
      await section.getByText("Fixture Selection A", { exact: true }).waitFor();
      assert.equal(
        await section
          .getByRole("button", { name: "Copy pick & open Gambly" })
          .count(),
        0,
        state,
      );
    }
    picks = [pick];
    member = false;
    const before = reads;
    await page.reload();
    await section
      .getByText("to see published selections.", { exact: false })
      .waitFor();
    assert.equal(reads, before);
    assert.equal(await section.locator(".vqc").count(), 0);
    member = true;
    await page.reload();
    await section.locator(".vqc").waitFor();
    // Revoke already-loaded access on focus: cards disappear and no additional pick request occurs.
    member = false;
    const beforeRevocation = reads;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await section
      .getByText("to see published selections.", { exact: false })
      .waitFor();
    assert.equal(reads, beforeRevocation);
    assert.equal(await section.locator(".vqc").count(), 0);
    // Navigate away while A is pending, then resolve A. B stays empty.
    member = true;
    let release;
    delay = new Promise((resolve) => {
      release = resolve;
    });
    const pendingRequest = page.waitForRequest((request) =>
      request.url().includes("nba_editorial_picks"),
    );
    await page.reload();
    await pendingRequest;
    await page.evaluate(() => {
      const a = document.createElement("a");
      a.href = "/nba/games/fixture-b";
      a.textContent = "Fixture next game";
      document.body.append(a);
    });
    await page.getByRole("link", { name: "Fixture next game" }).click();
    await section
      .getByText("No VQ selections published for this game", { exact: true })
      .waitFor();
    release();
    delay = null;
    await page.waitForTimeout(150);
    assert.equal(await section.locator(".vqc").count(), 0);
    // Auth sign-out invalidates the loaded account snapshot immediately.
    await page.goto(base + "/nba/games/fixture-a");
    await section.locator(".vqc").waitFor();
    member = false;
    await page.evaluate(() => {
      localStorage.removeItem("sb-127-auth-token");
      const channel = new BroadcastChannel(
        "sb-127-auth-token",
      );
      channel.postMessage({ event: "SIGNED_OUT", session: null });
      channel.close();
    });
    await section
      .getByText("to see published selections.", { exact: false })
      .waitFor();
    assert.equal(await section.locator(".vqc").count(), 0);
    member = true;
    ageVerified = false;
    const beforeAge = reads;
    await page.reload();
    await page
      .getByRole("heading", { name: "Verify your age to continue" })
      .waitFor();
    assert.equal(reads, beforeAge);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      `PASS ${width}: detail/home cards, age gate/cancel, empty/error/retry, revisions, expired/live/final/delayed, denied/revoked access, pending navigation, no overflow.`,
    );
  }
} finally {
  await browser.close();
}

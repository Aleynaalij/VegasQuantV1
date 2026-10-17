// With scripts/ui-smoke/stub.mjs and Next dev on :3100 using its local Supabase URL.
// Fixtures are synthetic test data only; never uploaded or published.
import assert from "node:assert/strict";
const m = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const pw = m.default || m;
const browser = await pw.chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
});
const at = Date.now(),
  tip = new Date(at + 86400000).toISOString(),
  received = new Date(at - 60000).toISOString();
const game = {
  id: "nba-fixture-1",
  provider_id: "12345",
  slug: "fixture-one-two",
  away_team: "Fixture Away",
  home_team: "Fixture Home",
  away_abbreviation: "AWY",
  home_abbreviation: "HME",
  tipoff: tip,
  tipoff_tbd: false,
  venue: "Fixture Arena",
  season: 2027,
  season_type: 1,
  status: "STATUS_SCHEDULED",
  away_score: 0,
  home_score: 0,
  source: "https://www.espn.com/nba/",
  updated_at: received,
};
for (const width of [390, 1280]) {
  const ctx = await browser.newContext({ viewport: { width, height: 950 } }),
    page = await ctx.newPage();
  let obsCalls = 0,
    member = true,
    empty = false,
    fail = false;
  await page.route("**/rest/v1/rpc/membership_status", (r) =>
    r.fulfill({
      json: { allowed: member, admin: false, member_code: "fixture" },
    }),
  );
  await page.route("**/rest/v1/nba_games?*", (r) =>
    r.fulfill({
      status: fail ? 500 : 200,
      json: fail
        ? { message: "fixture error" }
        : empty
          ? []
          : [
              game,
              {
                ...game,
                id: "final",
                status: "STATUS_FINAL",
                season_type: 2,
                away_score: 102,
                home_score: 108,
                tipoff: new Date(at - 3600000).toISOString(),
              },
            ],
    }),
  );
  await page.route("**/rest/v1/nba_observations?*", (r) => {
    obsCalls++;
    return r.fulfill({
      json: [
        {
          id: "obs",
          game_id: game.id,
          kind: "odds",
          provider: "The Odds API NBA",
          source: "https://the-odds-api.com",
          observed_at: null,
          recorded_at: received,
          payload: {
            book: "FanDuel",
            market: "spreads",
            outcomes: [
              { name: "Fixture Home", point: -3.5, price: -110 },
              { name: "Fixture Away", point: 3.5, price: -110 },
            ],
          },
        },
      ],
    });
  });
  await page.goto("http://127.0.0.1:3100/nba");
  const board = page.locator(".nba-live-board");
  await board.getByText("Fixture Away", { exact: false }).first().waitFor();
  assert.equal(obsCalls, 0, "details fetch only when opened");
  assert.equal(
    await board.locator(".nba-board-score").count(),
    0,
    "no scheduled zero scores",
  );
  await page.evaluate(() =>
    document.querySelectorAll("dialog[open]").forEach((d) => d.close()),
  );
  await board.locator("summary").click();
  await board.getByText("FanDuel · Spread", { exact: true }).waitFor();
  assert.equal(obsCalls, 1);
  assert.ok((await board.innerText()).includes("Provider time Unknown"));
  assert.ok((await board.innerText()).includes("Fixture Home -3.5 · -110"));
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await board.screenshot({ path: `/tmp/vq-nba-board-${width}.png` });
  await board.getByRole("button", { name: "Recent finals & changes" }).click();
  assert.ok((await board.innerText()).includes("AWY 102 · HME 108"));
  member = false;
  await page.reload();
  await board
    .getByText("Sign in with research access", { exact: false })
    .first()
    .waitFor();
  assert.equal(await board.locator("summary").count(), 0);
  empty = true;
  await board.getByRole("button", { name: "Refresh", exact: true }).click();
  await board
    .getByText("No upcoming NBA games have been received yet.", {
      exact: false,
    })
    .waitFor();
  fail = true;
  await board.getByRole("button", { name: "Refresh", exact: true }).click();
  await board.getByRole("alert").waitFor();
  await ctx.close();
}
await browser.close();
console.log(
  "NBA board: mobile/desktop, lazy member sources, signed-out restrictions, scores, source timing, empty and error states pass.",
);

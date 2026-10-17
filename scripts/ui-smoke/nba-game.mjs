// Synthetic browser fixtures only: never published or used as analysis.
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const base = process.env.UI_SMOKE_URL || "http://127.0.0.1:3105";
for (const width of [390, 1280]) {
  const ctx = await browser.newContext({ viewport: { width, height: 950 } }),
    p = await ctx.newPage();
  let member = true,
    missing = false,
    fail = false,
    final = false,
    observations = 0,
    grades = 0;
  const game = {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "boston-detroit",
    provider_id: "test",
    away_team: "Boston Celtics",
    home_team: "Detroit Pistons",
    away_abbreviation: "BOS",
    home_abbreviation: "DET",
    tipoff: new Date(Date.now() + 86400000).toISOString(),
    tipoff_tbd: false,
    venue: "Little Caesars Arena",
    season: 2027,
    season_type: 2,
    status: "STATUS_SCHEDULED",
    away_score: null,
    home_score: null,
    source: "https://www.espn.com/nba/",
    updated_at: new Date().toISOString(),
  };
  await p.route("**/rest/v1/**", async (r) => {
    const url = new URL(r.request().url()),
      path = url.pathname;
    let data = [];
    if (path.endsWith("membership_status"))
      data = { allowed: member, admin: false };
    if (path.endsWith("nba_games")) {
      if (fail)
        return r.fulfill({ status: 500, json: { message: "fixture error" } });
      const g = {
        ...game,
        ...(final
          ? { status: "STATUS_FINAL", away_score: 102, home_score: 108 }
          : {}),
      };
      data = url.searchParams.has("slug") ? (missing ? null : g) : [g];
    }
    if (path.endsWith("nba_observations")) {
      observations++;
      data = [
        "FanDuel",
        "DraftKings",
        "BetMGM",
        "Caesars",
        "BetRivers",
        "Fanatics",
      ].map((book, i) => ({
        id: "quote" + i,
        game_id: game.id,
        kind: "odds",
        provider: "The Odds API NBA",
        source: "https://the-odds-api.com",
        observed_at: new Date(
          Date.now() - (i === 2 ? 3600000 : 60000),
        ).toISOString(),
        recorded_at: new Date().toISOString(),
        payload: {
          market: "h2h",
          book,
          outcomes: [
            {
              name: "Boston Celtics",
              price: [-180, -170, 200, -190, -195, -185][i],
            },
          ],
        },
      }));
      data.push({
        id: "prop",
        game_id: game.id,
        kind: "prop",
        provider: "The Odds API NBA props",
        source: "https://the-odds-api.com",
        observed_at: new Date().toISOString(),
        recorded_at: new Date().toISOString(),
        payload: {
          book: "FanDuel",
          market: "player_points",
          outcomes: [
            {
              name: "Over",
              description: "Fixture Player",
              point: 20.5,
              price: -110,
            },
          ],
        },
      });
    }
    if (path.endsWith("nba_name_key")) data = "fixture player";
    if (path.endsWith("nba_player_results")) data = [];
    if (path.endsWith("nba_grade")) {
      grades++;
      assert.deepEqual(r.request().postDataJSON(), {
        p_game: game.id,
        p_market: "h2h",
        p_side: "Boston Celtics",
        p_point: null,
        p_player: null,
      });
      data = "LOSS";
    }
    return r.fulfill({ json: data });
  });
  await p.goto(base + "/nba");
  const ticket = p.locator(".nba-game-ticket a").first();
  await ticket.waitFor();
  assert.equal(await ticket.getAttribute("href"), "/nba/games/boston-detroit");
  await ticket.click();
  await p.waitForURL("**/nba/games/boston-detroit");
  await p
    .getByRole("heading", {
      name: "Boston Celtics @ Detroit Pistons",
      exact: true,
    })
    .waitFor();
  await p.getByText("Best observed -170", { exact: true }).waitFor();
  assert.equal(await p.locator(".nba-book-quotes li").count(), 7);
  assert.equal(
    await p.getByText("BetMGM +200 · Best observed", { exact: true }).count(),
    0,
  );
  assert.equal(grades, 0);
  await p
    .getByText("Recent recorded form · Fixture Player", { exact: true })
    .click();
  await p
    .getByText(
      "No confirmed regular season results recorded for this player yet.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  final = true;
  await p.reload();
  await p.getByRole("button", { name: "Check final result" }).first().waitFor();
  await p.getByRole("button", { name: "Check final result" }).first().click();
  await p
    .getByText("LOSS · observed selection, not a published pick", {
      exact: true,
    })
    .waitFor();
  assert.equal(grades, 1);
  await p.evaluate(() =>
    document.querySelectorAll("dialog[open]").forEach((d) => d.close()),
  );
  await p.screenshot({ path: `/tmp/vq-nba-game-${width}.png`, fullPage: true });
  member = false;
  const before = observations;
  await p.reload();
  await p.getByText("Sign in with research access", { exact: true }).waitFor();
  assert.equal(observations, before);
  assert.equal(await p.locator(".nba-price-card").count(), 0);
  missing = true;
  await p.reload();
  await p.getByRole("heading", { name: "Matchup not found" }).waitFor();
  assert.equal(observations, before);
  fail = true;
  await p.reload();
  await p
    .getByRole("alert")
    .filter({ hasText: "This matchup could not refresh" })
    .waitFor();
  assert.equal(observations, before);
  await ctx.close();
}
await browser.close();
console.log(
  "NBA game pages: ticket deep links, 6-book exact-line comparison/stale exclusion, lazy form, final grading, member isolation, missing/error states and no overflow pass at 390/1280.",
);

// Synthetic fixtures only; never published. Run against a local server with the stub URL.
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const now = Date.now(),
  stamp = new Date(now - 60000).toISOString();
const game = {
  id: "game",
  provider_id: "123",
  slug: "fixture",
  away_team: "Fixture Away",
  home_team: "Fixture Home",
  away_abbreviation: "AWY",
  home_abbreviation: "HME",
  tipoff: new Date(now + 86400000).toISOString(),
  tipoff_tbd: false,
  season: 2027,
  season_type: 2,
  status: "STATUS_SCHEDULED",
  away_score: null,
  home_score: null,
  source: "https://www.espn.com/nba/",
  updated_at: stamp,
};
const quote = (id, book, price, at = stamp) => ({
  id,
  game_id: "game",
  kind: "prop",
  provider: "Odds",
  source: "https://the-odds-api.com",
  observed_at: at,
  recorded_at: stamp,
  payload: {
    book,
    market: "player_points",
    outcomes: [
      { name: "Over", description: "Fixture Player", point: 20.5, price },
    ],
  },
});
for (const width of [390, 1280]) {
  const ctx = await browser.newContext({ viewport: { width, height: 950 } }),
    page = await ctx.newPage();
  let member = true,
    obsCalls = 0,
    formCalls = 0,
    fail = false,
    empty = false;
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data = [];
    if (path.endsWith("membership_status"))
      data = { allowed: member, admin: false };
    if (path.endsWith("nba_games"))
      data = empty
        ? []
        : [
            game,
            {
              ...game,
              id: "final",
              status: "STATUS_FINAL",
              season_type: 1,
              away_score: 102,
              home_score: 108,
              tipoff: new Date(now - 3600000).toISOString(),
            },
          ];
    if (path.endsWith("nba_observations")) {
      obsCalls++;
      data = [
        quote("a", "FanDuel", -110),
        quote("b", "DraftKings", 105),
        quote("c", "BetMGM", 200, null),
      ];
    }
    if (path.endsWith("nba_name_key")) {
      formCalls++;
      data = "fixture player";
    }
    if (path.endsWith("nba_game_results"))
      data = [
        {
          game_id: "old",
          source_url: "https://www.espn.com/nba/boxscore/_/gameId/1",
          nba_games: { tipoff: new Date(now - 86400000).toISOString() },
        },
      ];
    if (path.endsWith("nba_result_progress"))
      data = [{ game_id: "old", status: "FINAL" }];
    if (path.endsWith("nba_player_results"))
      data = [
        {
          game_id: "old",
          athlete_id: "1",
          player: "Fixture Player",
          played: true,
          minutes: 30,
          nba_game_results: {
            source_url: "https://www.espn.com/nba/boxscore/_/gameId/1",
            nba_games: { tipoff: new Date(now - 86400000).toISOString() },
          },
          points: 25,
          rebounds: 7,
          assists: 4,
          threes: 3,
        },
      ];
    return route.fulfill({
      status: fail && path.endsWith("nba_games") ? 500 : 200,
      json: data,
    });
  });
  await page.goto(process.env.UI_SMOKE_URL || "http://127.0.0.1:3101/nba");
  const board = page.locator(".nba-live-board");
  await board.getByText("Fixture Away", { exact: false }).first().waitFor();
  await page.evaluate(() =>
    document.querySelectorAll("dialog[open]").forEach((d) => d.close()),
  );
  assert.equal(obsCalls, 0);
  assert.equal(await board.locator(".nba-board-score").count(), 0);
  await board
    .getByText("Open research · lines, props & form", { exact: true })
    .click();
  await board.getByText("Best observed +105", { exact: true }).waitFor();
  assert.equal(obsCalls, 1);
  assert.equal(formCalls, 0);
  assert.ok((await board.innerText()).includes("BetMGM +200"));
  assert.ok((await board.innerText()).includes("Older / unverified snapshot"));
  await board
    .getByLabel("Market", { exact: true })
    .selectOption("player_rebounds");
  await board.getByText("No selections match these filters.").waitFor();
  await board.getByLabel("Market", { exact: true }).selectOption("all");
  await board.getByLabel("Player or team").fill("missing");
  await board.getByText("No selections match these filters.").waitFor();
  await board.getByLabel("Player or team").fill("");
  await board
    .getByText("Recent recorded form · Fixture Player", { exact: true })
    .click();
  await board
    .getByText("25 PTS · 7 REB · 4 AST · 3 3PM · 30 MIN", { exact: true })
    .waitFor();
  assert.equal(formCalls, 1);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await board.screenshot({ path: `/tmp/vq-nba-research-${width}.png` });
  await board.getByRole("button", { name: "Recent finals & changes" }).click();
  await board.getByText("AWY 102 · HME 108").waitFor();
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
  "NBA research: phone/desktop comparisons, stale exclusion, filters, lazy form, access, scores, empty/error and overflow pass.",
);

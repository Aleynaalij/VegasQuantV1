// Synthetic schedule only; no props or research observations are supplied.
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const first = {
  id: "opening",
  away_team: "Boston Celtics",
  home_team: "Detroit Pistons",
  away_abbreviation: "BOS",
  home_abbreviation: "DET",
  tipoff: "2026-10-20T19:00:00Z",
  tipoff_tbd: false,
  venue: "Little Caesars Arena",
  season_type: 2,
  status: "STATUS_SCHEDULED",
  away_score: null,
  home_score: null,
};
for (const width of [390, 1280]) {
  const c = await b.newContext({ viewport: { width, height: 950 } }),
    p = await c.newPage();
  let observations = 0;
  await p.route("**/rest/v1/**", (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith("nba_games") && url.searchParams.get("limit") === "60") {
      assert.ok(Date.parse(url.searchParams.getAll("tipoff").find(v => v.startsWith("gte.")).slice(4)) < Date.now() - 3.9 * 3600000);
    }
    let data = [];
    if (path.endsWith("nba_games"))
      data = [
        first,
        ...Array.from({ length: 11 }, (_, i) => ({
          ...first,
          id: "game-" + i,
          away_team: "Philadelphia 76ers",
          home_team: "New York Knicks",
          away_abbreviation: "PHI",
          home_abbreviation: "NY",
          tipoff: new Date(
            Date.parse(first.tipoff) + (i + 1) * 3600000,
          ).toISOString(),
        })),
      ];
    if (path.endsWith("membership_status"))
      data = { allowed: false, admin: false };
    if (path.endsWith("nba_observations")) observations++;
    return route.fulfill({ json: data });
  });
  await p.goto((process.env.UI_SMOKE_URL || "http://127.0.0.1:3105") + "/nba");
  await p.getByText("Celtics", { exact: true }).first().waitFor();
  const main = p.locator("main");
  assert.ok((await main.innerText()).includes("Pistons"));
  assert.ok((await main.innerText()).includes("3:00 PM"));
  for (const text of [
    "What we’ll study",
    "How every NBA play",
    "The rulebook",
    "Core rules",
    "Building toward opening night",
    "Minutes & rotation",
  ])
    assert.ok(
      !(await p.locator("body").innerText()).includes(text),
      text + " absent from Home",
    );
  assert.equal(await p.locator(".nba-live-board").count(), 0);
  assert.equal(observations, 0);
  assert.equal(await p.locator(".nba-game-ticket").count(), 12);
  assert.equal(
    await p
      .locator(".nba-ticket-rail")
      .evaluate((el) => el.scrollWidth > el.clientWidth),
    true,
  );
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  assert.equal(await p.locator(".nba-home-brief .vq-matchup .team-logo").count(), 2);
  await p.evaluate(() =>
    document.querySelectorAll("dialog[open]").forEach((d) => d.close()),
  );
  await p.screenshot({
    path: `/tmp/vq-nba-home-clean-${width}.png`,
    fullPage: true,
  });
  await c.close();
}
await b.close();
console.log(
  "NBA Home: Boston/Detroit 3 PM hero without props, compact ticket rail, no research logic/rules, no vertical game board or horizontal page overflow; 390/1280 pass.",
);

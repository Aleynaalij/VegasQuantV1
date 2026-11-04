// Synthetic NBA lineup acceptance: no member data, provider calls, database writes or credentials.
import fs from "node:fs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
    : {},
);
const BASE = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100",
  OUT = process.argv[2] || "/tmp/nba-lineups-evidence";
fs.mkdirSync(OUT, { recursive: true });
const NOW = "2026-11-04T20:00:00.000Z",
  UID = "00000000-0000-4000-8000-000000000099",
  GAME = "00000000-0000-4000-8000-000000000098";
const game = {
  id: GAME,
  provider_id: "999999",
  slug: "mil-bos-20261104",
  away_team: "Milwaukee Bucks",
  home_team: "Boston Celtics",
  away_abbreviation: "MIL",
  home_abbreviation: "BOS",
  tipoff: "2026-11-05T00:30:00Z",
  tipoff_tbd: false,
  venue: "Sample Arena",
  season: 2027,
  season_type: 2,
  status: "STATUS_SCHEDULED",
  away_score: null,
  home_score: null,
  source: "https://www.espn.com/nba/game/_/gameId/999999",
  updated_at: NOW,
};
const side = (team, start) => ({
  team,
  status: "expected",
  starters: ["PG", "SG", "SF", "PF", "C"].map((position, n) => ({
    id: String(start + n),
    name: `Sample ${team} Starter ${n + 1}`,
    position,
    status: null,
  })),
  availability: [
    {
      id: String(start + 10),
      name: `Sample ${team} Out Forward`,
      position: "F",
      status: "Out",
    },
    {
      id: String(start + 11),
      name: `Sample ${team} Uncertain Guard`,
      position: "G",
      status: "Questionable",
    },
  ],
});
const source = () => ({
  version: 1,
  source: "https://www.rotowire.com/basketball/nba-lineups.php",
  checked_at: NOW,
  server_now: NOW,
  games: [
    {
      day: "2026-11-04",
      time: "19:30",
      away: side("MIL", 10),
      home: side("BOS", 30),
    },
  ],
});
const failures = [];
let cases = 0;
async function run(name, width, fn) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  await page.clock.setFixedTime(new Date(NOW));
  await ctx.addInitScript((uid) => {
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
          email: "sample@example.test",
          app_metadata: {},
          user_metadata: { vq_welcome_version: 1 },
        },
      }),
    );
    sessionStorage.setItem("vq-prompt-shown", "fixture");
    localStorage.setItem(`vq-app-refresh:${uid}`, "gold-2026-10-22-v2");
  }, UID);
  await ctx.route("**/rest/v1/nba_games*", (r) =>
    r.fulfill({
      json: r.request().headers()["accept"]?.includes("vnd.pgrst.object")
        ? game
        : [game],
    }),
  );
  await ctx.route("**/rest/v1/nba_observations*", (r) =>
    r.fulfill({ json: [] }),
  );
  let mode = "expected",
    calls = 0;
  await ctx.route("**/api/nba/lineups", async (r) => {
    calls++;
    if (mode === "failure")
      return r.fulfill({
        status: 503,
        json: { error: "Sample source failure" },
      });
    const body = source();
    if (mode === "confirmed")
      body.games.forEach((g) => {
        g.away.status = "confirmed";
        g.home.status = "confirmed";
      });
    if (mode === "wrong-game") body.games[0].away.team = "LAL";
    if (mode === "stale") body.checked_at = "2026-11-04T19:50:00.000Z";
    if (mode === "invalid") body.version = 99;
    if (process.env.UI_SMOKE_NEGATIVE === "missing-out")
      body.games.forEach((g) => {
        g.home.availability = [];
        g.away.availability = [];
      });
    return r.fulfill({ json: body });
  });
  const fail = (m) => failures.push(`${name}: ${m}`);
  try {
    await page.goto(`${BASE}/nba`, { waitUntil: "networkidle" });
    await page.locator(`.vq-game-row[data-game="${GAME}"]`).waitFor();
    await fn({ page, fail, setMode: (m) => (mode = m), calls: () => calls });
    cases++;
    console.log(`ok ${name}`);
  } catch (e) {
    fail(String(e));
  } finally {
    await ctx.close();
  }
}
for (const width of [360, 390, 1280])
  await run(
    `Out visible before opening; expected vs confirmed; ${width}px`,
    width,
    async ({ page, fail, setMode, calls }) => {
      const row = page.locator(`.vq-game-row[data-game="${GAME}"]`);
      if (
        !(await row.locator("summary").innerText()).includes(
          "Sample BOS Out Forward",
        )
      )
        fail("Out warning missing from collapsed game");
      if ((await row.getAttribute("open")) !== null)
        fail("game unexpectedly opens itself");
      await row.locator("summary").click();
      const panel = page.getByRole("region", {
        name: "Starting lineups and availability",
      });
      await panel.waitFor();
      if ((await panel.innerText()).includes("Confirmed starters"))
        fail("expected lineup labelled confirmed");
      if (!(await panel.innerText()).includes("Sample BOS Uncertain Guard"))
        fail("Questionable player status missing");
      if (
        await panel
          .locator("li")
          .filter({ hasText: "Sample BOS Starter 1" })
          .count()
      )
        fail("expected player presented as confirmed starter");
      setMode("confirmed");
      await panel.getByRole("button", { name: "Refresh lineups" }).click();
      await panel
        .locator("li")
        .filter({ hasText: "Sample BOS Starter 1" })
        .waitFor();
      if (
        (await panel
          .getByText("Confirmed starters", { exact: true })
          .count()) !== 2
      )
        fail("both confirmed starting fives not shown");
      if (calls() !== 2)
        fail(`shared source should load once per refresh, got ${calls()}`);
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        )
      )
        fail("lineup causes horizontal overflow");
      await page.screenshot({
        path: `${OUT}/confirmed-${width}.png`,
        fullPage: true,
      });
      setMode("expected");
      await panel.getByRole("button", { name: "Refresh lineups" }).click();
      await page.waitForTimeout(100);
      if (
        await panel
          .locator("li")
          .filter({ hasText: "Sample BOS Starter 1" })
          .count()
      )
        fail("withdrawn confirmation remains visible");
    },
  );
for (const mode of ["wrong-game", "stale", "invalid", "failure"])
  await run(
    `${mode} response cannot show starters or clear availability`,
    390,
    async ({ page, fail, setMode }) => {
      const row = page.locator(`.vq-game-row[data-game="${GAME}"]`);
      await row.locator("summary").click();
      const panel = page.getByRole("region", {
        name: "Starting lineups and availability",
      });
      await panel.waitFor();
      setMode(mode);
      await panel.getByRole("button", { name: "Refresh lineups" }).click();
      await page.waitForTimeout(100);
      if (
        (await panel.innerText()).includes("Confirmed starters") ||
        (await panel
          .getByText("Sample BOS Out Forward", { exact: true })
          .count())
      )
        fail("invalid report shown for this game");
      if (
        !(await panel.innerText()).match(/unavailable|No current lineup report/)
      )
        fail("missing explicit unavailable warning");
    },
  );
await run(
  "cross-tab sign-out hides report; detail page has the same panel",
  390,
  async ({ page, fail }) => {
    await page.goto(`${BASE}/nba/games/${game.slug}`, {
      waitUntil: "networkidle",
    });
    const panel = page.getByRole("region", {
      name: "Starting lineups and availability",
    });
    await panel.waitFor();
    if (!(await panel.innerText()).includes("Sample BOS Out Forward"))
      fail("detail page missing Out player");
    await page.evaluate(() => {
      localStorage.removeItem("sb-127-auth-token");
      new BroadcastChannel("sb-127-auth-token").postMessage({
        event: "SIGNED_OUT",
        session: null,
      });
    });
    await page.waitForTimeout(150);
    if (
      await panel.getByText("Sample BOS Out Forward", { exact: true }).count()
    )
      fail("report survives sign-out");
  },
);
await browser.close();
if (failures.length) {
  console.error(failures.map((x) => `FAIL ${x}`).join("\n"));
  process.exit(1);
}
console.log(`NBA lineup acceptance passed: ${cases} cases`);

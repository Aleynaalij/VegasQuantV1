// NBA is live again (owner, Oct 31 2026, #166): the NBA chip opens the NBA desk in NFL's layout, games
// open to FanDuel lines and published selections, old research/Zone links redirect, and the Zone's
// sport chips filter one feed. Runs against the app on :3100 with the stub; NBA reads are routed here.
import assert from "node:assert/strict";
const pw = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const { chromium } = pw.default || pw;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const base = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const iso = (h) => new Date(Date.now() + h * 3600000).toISOString();
const games = [
  {
    id: "g1",
    slug: "por-uta",
    away_team: "Portland Trail Blazers",
    home_team: "Utah Jazz",
    away_abbreviation: "POR",
    home_abbreviation: "UTAH",
    tipoff: iso(5),
    tipoff_tbd: false,
    venue: "Delta Center",
    status: "STATUS_SCHEDULED",
  },
  {
    id: "g2",
    slug: "okc-hou",
    away_team: "Oklahoma City Thunder",
    home_team: "Houston Rockets",
    away_abbreviation: "OKC",
    home_abbreviation: "HOU",
    tipoff: iso(9),
    tipoff_tbd: false,
    venue: "Toyota Center",
    status: "STATUS_SCHEDULED",
  },
  // Start time not set yet: its placeholder has passed, but it still lists, as TBD.
  {
    id: "g3",
    slug: "tbd",
    away_team: "Miami Heat",
    home_team: "Orlando Magic",
    away_abbreviation: "MIA",
    home_abbreviation: "ORL",
    tipoff: iso(-1),
    tipoff_tbd: true,
    venue: null,
    status: "STATUS_SCHEDULED",
  },
  {
    id: "g0",
    slug: "done",
    away_team: "Boston Celtics",
    home_team: "New York Knicks",
    away_abbreviation: "BOS",
    home_abbreviation: "NY",
    tipoff: iso(-2),
    tipoff_tbd: false,
    venue: null,
    status: "STATUS_FINAL",
  },
];
const quote = (game_id, market, outcomes, kind = "odds") => ({
  game_id,
  kind,
  recorded_at: iso(-1),
  payload: { book: "FanDuel", market, outcomes, provider_updated_at: iso(-1) },
});
const obs = [
  quote("g1", "h2h", [
    { name: "Portland Trail Blazers", price: -270 },
    { name: "Utah Jazz", price: 220 },
  ]),
  quote("g1", "spreads", [
    { name: "Portland Trail Blazers", point: -6.5, price: -108 },
    { name: "Utah Jazz", point: 6.5, price: -112 },
  ]),
  quote("g1", "totals", [
    { name: "Over", point: 231.5, price: -110 },
    { name: "Under", point: 231.5, price: -110 },
  ]),
  quote(
    "g1",
    "player_points",
    [
      { name: "Over", point: 23.5, price: -102, description: "Deni Avdija" },
      { name: "Under", point: 23.5, price: -130, description: "Deni Avdija" },
    ],
    "prop",
  ),
];
const picks = [
  // p0 was revised by p1; only the revision shows.
  {
    id: "p0",
    game_id: "g1",
    player: "Deni Avdija",
    market: "player_points",
    direction: "Under",
    line: 24.5,
    odds: -110,
    book: "FanDuel",
    rationale: "Old.",
    risk: "Old.",
    quote_observed_at: iso(-2),
    expires_at: iso(5),
    supersedes_id: null,
  },
  {
    supersedes_id: "p0",
    id: "p1",
    game_id: "g1",
    player: "Deni Avdija",
    market: "player_points",
    direction: "Over",
    line: 23.5,
    odds: -102,
    book: "FanDuel",
    rationale: "Usage climbed with the starting role.",
    risk: "Blowout minutes.",
    quote_observed_at: iso(-1),
    expires_at: iso(5),
  },
];
const session = () =>
  localStorage.setItem(
    "sb-127-auth-token",
    JSON.stringify({
      access_token: "smoke",
      token_type: "bearer",
      expires_in: 86400,
      expires_at: Math.floor(Date.now() / 1000) + 86400 * 400,
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
for (const width of [390, 1280]) {
  for (const signedIn of [false, true]) {
    const ctx = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
    });
    if (signedIn) await ctx.addInitScript(session);
    const feedSports = [];
    let recordWins = 2;
    await ctx.route("**/rest/v1/rpc/nba_editorial_records", (r) =>
      r.fulfill({
        json: signedIn
          ? {
              selections: 3,
              win: recordWins,
              loss: 1,
              push: 0,
              void: 0,
              pending: 0,
            }
          : { selections: 0, win: 0, loss: 0, push: 0, void: 0, pending: 0 },
      }),
    );
    await ctx.route("**/rest/v1/nba_games*", (r) => r.fulfill({ json: games }));
    // A finished profile, so the profile setup dialog never covers the Zone chips.
    await ctx.route("**/rest/v1/community_profiles*", (r) => {
      const row = {
        username: "NbaMember",
        avatar: "a.jpg",
        region: null,
        visible: true,
      };
      return r.fulfill({
        json: (r.request().headers().accept || "").includes("vnd.pgrst.object")
          ? row
          : [row],
      });
    });
    await ctx.route("**/rest/v1/nba_observations*", (r) =>
      r.fulfill({ json: obs }),
    );
    await ctx.route("**/rest/v1/nba_editorial_picks*", (r) =>
      r.fulfill({ json: picks }),
    );
    await ctx.route("**/rest/v1/rpc/community_feed", async (r) => {
      feedSports.push(JSON.parse(r.request().postData() || "{}").p_sport);
      await r.fallback();
    });
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    const label = `@${width}${signedIn ? " signed in" : ""}`;
    await p.goto(`${base}/`, { waitUntil: "networkidle" });
    await p.evaluate(() =>
      document.querySelectorAll("dialog[open]").forEach((d) => d.close()),
    );
    const chips = p.getByRole("navigation", { name: "Sport selection" });
    // The NHL chip appears once the member's anniversary status is known (Frank's surprise).
    await chips.locator('a[data-sport="nhl"]').waitFor();
    assert.deepEqual(
      await chips
        .locator("a[data-sport]")
        .evaluateAll((a) => a.map((x) => x.textContent.trim())),
      ["NFL", "NBA", "NHL", "NCAAB"],
      `live chips ${label}`,
    );
    await chips.locator('a[data-sport="nba"]').click();
    await p.waitForURL(`${base}/nba`);
    await p.locator(".home-brief[data-sport=nba] .vq-matchup").waitFor();
    assert.match(await p.locator(".home-brief").innerText(), /NEXT TIP-OFF/i);
    assert.match(await p.locator(".home-brief").innerText(), /Trail Blazers/);
    // Finished games never show; the rest are rows with chevrons.
    assert.equal(await p.locator(".vq-game-row").count(), 3, label);
    assert.equal(await p.locator(".vq-game-row .vq-expand-chevron").count(), 3);
    assert.match(
      await p.locator(".vq-game-row[data-game=g3]").innerText(),
      /TBD/,
    );
    assert.equal(
      await chips.locator('a[data-sport="nba"]').getAttribute("aria-current"),
      "page",
    );
    if (signedIn) {
      await p.locator(".vq-game-row .vq-ml-face").first().waitFor();
      await p
        .locator(".vq-game-row[data-game=g1]")
        .evaluate((d) => (d.open = true));
      await p.locator(".sport-selections li").first().waitFor();
      const open = await p.locator(".vq-game-row[data-game=g1]").innerText();
      assert.equal(
        await p
          .locator(".vq-game-row[data-game=g1]")
          .locator(".sport-selections li")
          .count(),
        1,
        "superseded hidden",
      );
      assert.ok(
        !(await p.locator(".vq-game-row[data-game=g1]").innerText()).includes(
          "Under 24.5 PTS",
        ),
      );
      for (const text of [
        "Deni Avdija",
        "Over 23.5 PTS",
        "Trail Blazers -6.5",
        "Over 231.5",
        "Open the matchup",
      ])
        assert.ok(open.includes(text), `${text} ${label}`);
    } else {
      await p
        .locator(".vq-game-row")
        .first()
        .evaluate((d) => (d.open = true));
      await p.getByText("Sign in to see game markets.").first().waitFor();
      assert.equal(await p.locator(".vq-ml-face").count(), 0);
    }
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth - innerWidth <= 1,
      ),
      `overflow ${label}`,
    );
    for (const [path, target] of [
      ["/nba-research", "/nba"],
      ["/nba/zone", "/community"],
    ]) {
      await p.goto(base + path, { waitUntil: "networkidle" });
      assert.equal(new URL(p.url()).pathname, target, path);
    }
    if (signedIn) {
      // One Zone: All by default, sport chips filter the same feed and keep the filter in the URL.
      feedSports.length = 0;
      await p.goto(`${base}/community`, { waitUntil: "networkidle" });
      await p.evaluate(() =>
        document.querySelectorAll("dialog[open]").forEach((d) => d.close()),
      );
      const sports = p.locator(".zone-sports button");
      assert.deepEqual(await sports.allInnerTexts(), [
        "All",
        "NFL",
        "NBA",
        "NHL",
        "NCAAB",
      ]);
      assert.equal(await sports.first().getAttribute("aria-pressed"), "true");
      await sports.nth(2).click();
      await p.waitForURL(/sport=nba/);
      await p.waitForTimeout(500);
      assert.equal(feedSports[0], "all");
      assert.equal(feedSports.at(-1), "nba");
      assert.equal(
        await p.locator(".zone-sport-pick select").inputValue(),
        "nba",
      );
    }
    await p.clock.install({ time: Date.now() });
    await p.goto(base + "/nba/records", { waitUntil: "networkidle" });
    await p.getByRole("heading", { name: "NBA record", exact: true }).waitFor();
    if (signedIn) {
      await p.waitForFunction(
        () => document.querySelector(".sport-record dd")?.textContent === "2",
      );
      recordWins = 3;
      await p.clock.fastForward(60001);
      await p.waitForFunction(
        () => document.querySelector(".sport-record dd")?.textContent === "3",
      );
    } else
      await p
        .getByText("No NBA selections have been published yet.", {
          exact: true,
        })
        .waitFor();
    assert.deepEqual(errors, [], label);
    await ctx.close();
  }
}
await browser.close();
console.log(
  "NBA live: chips, NFL-layout NBA Home with lines and selections, redirects and one-Zone sport chips passed at phone and desktop width.",
);

// NHL and college basketball (#166): Home in NFL's layout from sports_home, game pages from sports_game,
// records from sports_records. Codex's synthetic contract fixtures, moved into the future, stand in for
// the backend; nothing here is real data. Runs against the app on :3100 with the stub.
import assert from "node:assert/strict";
import fs from "node:fs";
const pw = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const { chromium } = pw.default || pw;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const base = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const iso = (h) => new Date(Date.now() + h * 3600000).toISOString();
function page(sport, access) {
  const p = JSON.parse(
    fs.readFileSync(`tests/fixtures/sports/${sport}/page.json`, "utf8"),
  );
  const g = p.games[0];
  g.start_time = iso(6);
  const second = {
    ...g,
    id: "00000000-0000-4000-8000-0000000000aa",
    slug: "second-game",
    start_time: iso(30),
    neutral_site: sport === "ncaab",
  };
  const done = {
    ...g,
    id: "00000000-0000-4000-8000-0000000000bb",
    slug: "done",
    start_time: iso(-3),
    completed: true,
    status: "STATUS_FINAL",
  };
  p.games = [g, second, done];
  const m0 = {
    ...p.markets[0],
    game_id: g.id,
    observed_at: iso(-1),
    expires_at: iso(6),
  };
  const markets = [
    { ...m0, id: "m-away", side: "away", selection: g.away.name, odds: -140 },
    { ...m0, id: "m-home", side: "home", selection: g.home.name, odds: 118 },
    {
      ...m0,
      id: "m-expired",
      side: "away",
      selection: g.away.name,
      odds: -999,
      observed_at: iso(-3),
      expires_at: iso(-2),
    },
  ];
  if (sport === "nhl")
    markets.push(
      {
        ...m0,
        id: "m-tot",
        market: "totals",
        side: null,
        selection: "Over",
        direction: "Over",
        line: 6.5,
        odds: -105,
      },
      {
        ...m0,
        id: "m-pts",
        market: "player_points",
        side: null,
        player: "A Skater",
        selection: "A Skater",
        direction: "Over",
        line: 0.5,
        odds: -150,
        settlement: "skater_stats_excluding_shootout",
        settlement_note: "Skater stats exclude the shootout",
      },
      {
        ...m0,
        id: "m-goal",
        market: "player_goal_scorer_anytime",
        side: null,
        player: "A Skater",
        selection: "A Skater",
        direction: "Yes",
        line: null,
        odds: 210,
        settlement: "skater_stats_excluding_shootout",
        settlement_note: "Skater stats exclude the shootout",
      },
    );
  else
    markets.push(
      {
        ...m0,
        id: "m-spread",
        market: "spreads",
        side: "home",
        selection: g.home.name,
        line: -3.5,
        odds: -110,
        settlement: "including_overtime",
        settlement_note: "Full game including overtime",
      },
      {
        ...m0,
        id: "m-total",
        market: "totals",
        side: null,
        selection: "Over",
        direction: "Over",
        line: 141.5,
        odds: -110,
      },
    );
  p.markets = access ? markets : [];
  p.selections = access
    ? [
        {
          id: "s1",
          game_id: g.id,
          market_id: "m-away",
          title: `${g.away.short_name} to win`,
          why: "Fixture rationale.",
          risk: "Fixture risk.",
          published_at: iso(-1),
          expires_at: iso(6),
          sources: [],
          classification: "QUALITATIVE_EDITORIAL",
        },
      ]
    : [];
  p.facts = access
    ? [
        {
          id: "f1",
          game_id: g.id,
          kind: "team_context",
          payload: {
            injuries: [
              {
                team: { displayName: g.home.name },
                injuries: [
                  {
                    athlete: { displayName: "Fixture Player" },
                    status: "Day-To-Day",
                  },
                ],
              },
            ],
            availability:
              "Provider-reported only; omissions do not confirm availability",
          },
          source: g.source,
        },
      ]
    : [];
  p.access = access;
  return p;
}
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
for (const width of [390, 1280])
  for (const signedIn of [false, true])
    for (const sport of ["nhl", "ncaab"]) {
      const label = `${sport} @${width}${signedIn ? " signed in" : ""}`;
      const ctx = await browser.newContext({
        viewport: { width, height: 900 },
        reducedMotion: "reduce",
      });
      if (signedIn) await ctx.addInitScript(session);
      // A finished profile, so the profile setup dialog never covers the page.
      await ctx.route("**/rest/v1/community_profiles*", (r) => {
        const row = {
          username: "SportsMember",
          avatar: "a.jpg",
          region: null,
          visible: true,
        };
        return r.fulfill({
          json: (r.request().headers().accept || "").includes(
            "vnd.pgrst.object",
          )
            ? row
            : [row],
        });
      });
      // DraftKings pays more on the away moneyline (-130 vs FanDuel -140), less on the home side.
      const bookReads = [];
      await ctx.route("**/rest/v1/sports_book_quotes*", (r) => {
        const game = page(sport, true).games[0];
        bookReads.push(new URL(r.request().url()).searchParams.get("game_id"));
        return r.fulfill({
          json: [
            {
              game_id: game.id,
              observed_at: new Date(Date.now() - 5 * 60000).toISOString(),
              payload: {
                book: "DraftKings",
                market: "h2h",
                outcomes: [
                  { name: "away", price: -130 },
                  { name: "home", price: 110 },
                ],
              },
            },
          ],
        });
      });
      const calls = [];
      await ctx.route("**/rest/v1/rpc/sports_*", async (r) => {
        const name = new URL(r.request().url()).pathname.split("/").at(-1);
        const body = JSON.parse(r.request().postData() || "{}");
        calls.push([name, body.p_sport]);
        if (name === "sports_records")
          return r.fulfill({
            json: {
              selections: 3,
              win: 2,
              loss: 1,
              push: 0,
              void: 0,
              pending: 0,
            },
          });
        const p = page(body.p_sport, signedIn);
        if (name === "sports_game")
          p.games = p.games.filter((g) => g.slug === body.p_slug);
        return r.fulfill({ json: p });
      });
      const p = await ctx.newPage();
      const errors = [];
      p.on("pageerror", (e) => errors.push(e.message));
      await p.goto(`${base}/${sport}`, { waitUntil: "networkidle" });
      await p.evaluate(() =>
        document.querySelectorAll("dialog[open]").forEach((d) => d.close()),
      );
      await p.locator(`.home-brief[data-sport=${sport}] .vq-matchup`).waitFor();
      assert.match(
        await p.locator(".home-brief").innerText(),
        sport === "nhl" ? /NEXT PUCK DROP/i : /NEXT TIP-OFF/i,
        label,
      );
      assert.equal(
        await p.locator(".vq-game-row").count(),
        2,
        `finished games hidden ${label}`,
      );
      assert.equal(
        await p
          .getByRole("navigation", { name: "Sport selection" })
          .locator(`a[data-sport=${sport}]`)
          .getAttribute("aria-current"),
        "page",
      );
      if (sport === "ncaab")
        assert.match(
          await p.locator(".vq-game-row").nth(1).innerText(),
          /\bvs\b/i,
          "neutral site",
        );
      await p
        .locator(".vq-game-row")
        .first()
        .evaluate((d) => (d.open = true));
      const row = p.locator(".vq-game-row").first();
      if (signedIn) {
        await row.locator(".sport-market-group").first().waitFor();
        // Player menus start closed; open them to read every exact line.
        await row
          .locator("details.sport-props")
          .evaluateAll((ds) => ds.forEach((d) => (d.open = true)));
        const text = await row.innerText();
        assert.ok(!text.includes("-999"), `expired quote hidden ${label}`);
        assert.ok(text.includes("to win"), `selection ${label}`);
        assert.equal(await row.locator(".vq-ml-face").count(), 1);
        if (sport === "nhl") {
          for (const t of [
            "Over 6.5",
            "A Skater",
            "To score",
            "Full game including OT/SO",
            "Skater stats exclude the shootout",
          ])
            assert.ok(text.includes(t), `${t} ${label}`);
        } else {
          assert.ok(
            text.includes("-3.5") &&
              text.includes("Full game including overtime"),
            label,
          );
          // College basketball shows moneyline and spreads only (owner scope).
          assert.ok(!text.includes("141.5"), `no NCAAB totals ${label}`);
        }
      } else {
        await row.getByText("Sign in to see game markets.").waitFor();
      }
      assert.ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth - innerWidth <= 1,
        ),
        `overflow ${label}`,
      );
      if (process.env.SHOTS)
        await p.screenshot({
          path: `${process.env.SHOTS}/${sport}-${width}-${signedIn}.png`,
          fullPage: true,
        });
      const href = await row.locator(".sport-open").getAttribute("href");
      assert.match(href, new RegExp(`^/${sport}/games/`));
      await p.goto(base + href, { waitUntil: "networkidle" });
      await p.locator(".sport-game-head .vq-matchup").waitFor();
      if (signedIn) {
        await p.getByText("Fixture Player").waitFor();
        await p.locator(".sport-best").first().waitFor();
        // The away side shows it on the published selection and on its market row; home never.
        assert.deepEqual(
          [...new Set(await p.locator(".sport-best").allInnerTexts())],
          ["Best -130 · DraftKings"],
          `only the beaten side names a book ${label}`,
        );
        assert.equal(bookReads.at(-1), `eq.${page(sport, true).games[0].id}`);
        assert.ok(
          (await p.locator("body").innerText()).includes(
            "omissions do not confirm availability",
          ),
        );
      } else await p.getByText(/Sign in with research access/).waitFor();
      await p.goto(`${base}/${sport}/games/no-such-game`, {
        waitUntil: "networkidle",
      });
      await p.getByRole("heading", { name: "Matchup not found" }).waitFor();
      await p.goto(`${base}/${sport}/records`, { waitUntil: "networkidle" });
      await p.locator(".sport-record").waitFor();
      assert.match(await p.locator(".sport-record").innerText(), /Won\s*2/i);
      assert.ok(
        calls.every(([, s]) => s === sport),
        `only ${sport} requested`,
      );
      assert.deepEqual(errors, [], label);
      await ctx.close();
    }
// An aging quote stays visibly labelled as an older snapshot, including during a feed outage.
for (const width of [390, 1280])
  for (const sport of ["nhl", "ncaab"]) {
    const ctx = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
    });
    await ctx.addInitScript(session);
    let unavailable = false;
    const fixedNow = Date.now();
    await ctx.route("**/rest/v1/rpc/sports_home", async (r) => {
      if (unavailable)
        return r.fulfill({ status: 503, json: { message: "Fixture outage" } });
      const data = page(sport, true);
      data.markets = data.markets.map((m) => ({
        ...m,
        observed_at: new Date(fixedNow - 60000).toISOString(),
        expires_at: new Date(fixedNow + 90000).toISOString(),
      }));
      return r.fulfill({ json: data });
    });
    const p = await ctx.newPage();
    await p.clock.install({ time: fixedNow });
    await p.goto(`${base}/${sport}`, { waitUntil: "networkidle" });
    await p.evaluate(() =>
      document.querySelectorAll("dialog[open]").forEach((d) => d.close()),
    );
    await p.locator(".vq-ml-face").waitFor();
    unavailable = true;
    await p.clock.fastForward(120001);
    await p.getByText(/Older quote; price may have moved/).waitFor();
    assert.equal(await p.locator(".vq-ml-face").count(), 1);
    await p
      .getByText(
        `The ${sport === "nhl" ? "NHL" : "College basketball"} schedule could not load.`,
        { exact: false },
      )
      .waitFor();
    await ctx.close();
  }
// Large real-world slate: bounded initial DOM, lazy panels, and every remaining game reachable.
for (const width of [390, 1280]) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    reducedMotion: "reduce",
  });
  await ctx.addInitScript(session);
  let calls = 0;
  await ctx.route("**/rest/v1/rpc/sports_home", (r) => {
    calls++;
    const data = page("ncaab", true),
      g = data.games[0];
    data.games = Array.from({ length: 380 }, (_, i) => ({
      ...g,
      id: i === 0 ? g.id : "perf-" + i,
      slug: "perf-" + i,
      home: { ...g.home, short_name: "Home " + i },
    }));
    data.facts = [];
    data.results = [];
    return r.fulfill({ json: data });
  });
  const p = await ctx.newPage();
  await p.goto(base + "/ncaab", { waitUntil: "networkidle" });
  await p.evaluate(() =>
    document.querySelectorAll("dialog[open]").forEach((d) => d.close()),
  );
  assert.equal(await p.locator(".vq-game-row").count(), 32);
  assert.equal(await p.locator(".sport-market-group").count(), 0);
  assert.equal(calls, 1, "no duplicate INITIAL_SESSION load");
  await p.locator(".vq-game-row summary").first().click();
  await p.locator(".sport-market-group").first().waitFor();
  await p.locator(".vq-game-row summary").first().click();
  await p.waitForFunction(() => !document.querySelector(".sport-market-group"));
  for (let i = 0; i < 11; i++)
    await p.getByRole("button", { name: /Show more games/ }).click();
  assert.equal(await p.locator(".vq-game-row").count(), 380);
  await p.getByText("Home 379", { exact: true }).waitFor();
  assert.ok(
    await p.evaluate(
      () => document.documentElement.scrollWidth - innerWidth <= 1,
    ),
  );
  await ctx.close();
}
await browser.close();
console.log(
  "NHL/NCAAB: Home, rows, exact markets with settlement notes, NCAAB scope, game pages, injuries, records and member gating passed at phone and desktop width.",
);

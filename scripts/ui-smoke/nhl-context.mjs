import assert from "node:assert/strict";
import fs from "node:fs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE,
  headless: true,
  args: ["--no-sandbox"],
});
const base = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const version = fs
  .readFileSync("src/components/app-refresh-notice.tsx", "utf8")
  .match(/const VERSION = "([^"]+)"/)[1];
const fixture = JSON.parse(
  fs.readFileSync("tests/fixtures/sports/nhl/page.json", "utf8"),
);
fixture.games = fixture.games.slice(0, 1);
fixture.games[0].start_time = new Date(Date.now() + 6 * 3600000).toISOString();
const g = fixture.games[0],
  source = {
    url: "https://www.rotowire.com/hockey/nhl-lineups.php?date=2026-10-31",
    sha256: "a".repeat(64),
    retrieved_at: new Date().toISOString(),
  };
function report() {
  return {
    version: 1,
    game_id: g.id,
    cutoff: g.start_time,
    generated_at: new Date().toISOString(),
    nhl_game_id: 2026020001,
    nhl_url: "https://www.nhl.com/gamecenter/2026020001",
    sources: [source],
    teams: [g.away, g.home].map((t, i) => ({
      abbreviation: t.abbreviation,
      name: t.name,
      games: Array.from({ length: 5 }, (_, j) => ({
        id: j + 1,
        date: "2026-10-" + (20 + j),
        opponent: i ? "PIT" : "MTL",
        result: "W",
        goalsFor: 3,
        goalsAgainst: 2,
        url: "https://www.nhl.com/gamecenter/" + j,
      })),
      record: { wins: 3, losses: 1, overtimeLosses: 1 },
      goalsForPerGame: 3,
      goalsAgainstPerGame: 2,
      boxesVerified: 5,
      skaters: [
        {
          id: 100 + i,
          name: "Fixture " + (i ? "Beta" : "Alpha"),
          goals: 4,
          points: 8,
          appearances: 5,
        },
      ],
      roster: [{ id: 100 + i, name: "Fixture " + (i ? "Beta" : "Alpha") }],
      goalie: {
        id: 200 + i,
        name: "Fixture Keeper " + i,
        status: i ? "expected" : "confirmed",
        sample: 5,
        gaa: i ? 0 : 2.4,
        seconds: 18000,
        goalsAgainst: i ? 0 : 12,
        source,
      },
      powerPlay: {
        players: Array.from({ length: 5 }, (_, j) => ({
          name: "Fixture PP " + j,
          position: "C",
        })),
        status: "projected",
        source,
      },
      notes: [],
    })),
  };
}
try {
  for (const width of [390, 1280])
    for (const role of ["member", "frank", "anon"]) {
      const ctx = await browser.newContext({
        viewport: { width, height: 900 },
        reducedMotion: "reduce",
      });
      let reads = 0,
        state = "ready";
      const uid = "00000000-0000-4000-8000-000000000001";
      await ctx.addInitScript(
        ({ uid, version, role }) => {
          sessionStorage.setItem("vq-prompt-shown", "fixture");
          localStorage.setItem("vq-app-refresh:" + uid, version);
          if (role !== "anon")
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
        { uid, version, role },
      );
      await ctx.route("**/rest/v1/rpc/frank_anniversary", (r) =>
        r.fulfill({ json: { state: "hidden" } }),
      );
      await ctx.route("**/rest/v1/rpc/sports_home", (r) =>
        r.fulfill({ json: { ...fixture, access: role !== "anon", facts: [] } }),
      );
      await ctx.route("**/rest/v1/rpc/sports_game", (r) =>
        r.fulfill({ json: { ...fixture, access: role !== "anon" } }),
      );
      await ctx.route("**/rest/v1/rpc/nhl_game_context", (r) => {
        reads++;
        const p = JSON.parse(r.request().postData() || "{}");
        assert.equal(p.p_game, g.id);
        return r.fulfill({
          json:
            state === "error"
              ? { state: "ready", report: { ...report(), game_id: "wrong" } }
              : state === "ready"
                ? {
                    state,
                    report: report(),
                    checked_at: new Date().toISOString(),
                    watchlist: role === "frank" ? "Fixture Alpha" : null,
                  }
                : { state },
        });
      });
      const p = await ctx.newPage(),
        errors = [];
      p.on("pageerror", (e) => errors.push(e.message));
      await p.goto(base + "/nhl", { waitUntil: "networkidle" });
      assert.equal(reads, 0, "closed Home rows must not fetch NHL context");
      assert.equal(await p.locator(".nhl-report").count(), 0);
      await p.locator("details.vq-game-row summary").first().click();
      if (role === "anon") {
        assert.equal(await p.locator(".nhl-report").count(), 0);
        assert.equal(reads, 0);
        await ctx.close();
        continue;
      }
      const panel = p.locator(".nhl-report");
      await panel
        .getByText("Starting goalie report", { exact: true })
        .first()
        .waitFor();
      assert.equal(reads, 1);
      assert.equal(await panel.locator(".nhl-report-team").count(), 2);
      assert.equal(
        await panel
          .getByText("First power-play unit · projected", { exact: true })
          .count(),
        2,
      );
      assert.ok((await panel.innerText()).includes("0.00"));
      assert.ok((await panel.innerText()).includes("3–1–1"));
      assert.equal(
        await panel
          .getByText("Your watchlist in this matchup", { exact: true })
          .count(),
        role === "frank" ? 1 : 0,
      );
      const overflow = await p.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      );
      assert.equal(overflow, false);
      state = "waiting";
      await p.goto(base + "/nhl/games/" + g.slug, { waitUntil: "networkidle" });
      await p
        .getByText(/This report is waiting for verified NHL.com/)
        .waitFor();
      state = "failed";
      await p
        .getByRole("button", { name: "Check report", exact: true })
        .click();
      await p.getByText(/The source refresh could not complete/).waitFor();
      state = "error";
      await p
        .getByRole("button", { name: "Check report", exact: true })
        .click();
      await p.getByText(/The NHL report could not load/).waitFor();
      state = "ready";
      await p
        .getByRole("button", { name: "Retry report", exact: true })
        .click();
      await p
        .getByText("Starting goalie report", { exact: true })
        .first()
        .waitFor();
      assert.deepEqual(errors, []);
      assert.ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await ctx.close();
      console.log(
        `PASS NHL context ${width}px ${role}: lazy Home, game report, private favorites, valid zero, source states, mismatch refusal, retry and no overflow`,
      );
    }
} finally {
  await browser.close();
}

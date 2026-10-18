// Synthetic fixtures only; never published as research or account data.
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const base = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const firstGame = {
  id: "g2",
  slug: "sample-hou-jax-2026-10-18",
  away_team: "Houston Texans",
  home_team: "Jacksonville Jaguars",
  kickoff: "2026-10-18T13:30:00Z",
  venue: "Sample Stadium",
  slot: "Sunday International",
  week: 6,
};
for (const width of [390, 1280]) {
  let game = { ...firstGame };
  const ctx = await browser.newContext({ viewport: { width, height: 950 } });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("vq-prompt-shown", "fixture");
    localStorage.setItem(
      "sb-127-auth-token",
      JSON.stringify({
        access_token: "smoke",
        refresh_token: "smoke",
        token_type: "bearer",
        expires_in: 86400,
        expires_at: Math.floor(Date.now() / 1000) + 86400,
        user: {
          id: "00000000-0000-0000-0000-000000000001",
          aud: "authenticated",
          role: "authenticated",
          app_metadata: {},
          user_metadata: { vq_welcome_version: 1 },
        },
      }),
    );
  });
  const p = await ctx.newPage();
  p.setDefaultTimeout(12000);
  p.on("pageerror", (e) => console.error("page error", e.message));
  if (process.env.DEBUG_FIXTURE)
    p.on("console", (m) => console.log(m.type(), m.text()));
  let official = false,
    settled = false;
  let mode = "member",
    analysisReads = 0,
    deskReads = 0,
    release;
  let gate = new Promise((resolve) => {
    release = resolve;
  });
  await p.route("**/rest/v1/**", async (r) => {
    const url = new URL(r.request().url()),
      path = url.pathname;
    if (process.env.DEBUG_FIXTURE) console.log("fixture", path);
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204 });
    let data = [];
    if (path.endsWith("age_verification_status"))
      data = { required: true, verified: true };
    if (path.endsWith("membership_status")) {
      await gate;
      if (mode === "access-error")
        return r.fulfill({ status: 500, json: { message: "fixture failure" } });
      data = {
        allowed: mode !== "denied",
        admin: false,
        member_code: "SAMPLE",
      };
    }
    if (path.endsWith("matchup_directory"))
      data = [{ game, analysis: null, market: null }];
    if (path.endsWith("community_profiles"))
      data = [
        {
          user_id: "00000000-0000-0000-0000-000000000001",
          username: "FixtureMember",
          avatar: "https://example.com/avatar.png",
          visible: true,
        },
      ];
    if (path.endsWith("public_research_status"))
      data = { games: [{ game_id: game.id }] };
    if (path.endsWith("desk_data")) deskReads++;
    if (
      ["analysis_versions", "market_snapshots", "official_picks"].some((t) =>
        path.endsWith(t),
      )
    ) {
      assert.equal(
        url.searchParams.get("game_id"),
        `eq.${game.id}`,
        "research reads must be game scoped",
      );
      if (path.endsWith("analysis_versions")) {
        analysisReads++;
        if (mode === "research-error")
          return r.fulfill({
            status: 500,
            json: { message: "fixture failure" },
          });
        data = [
          {
            id: "a2",
            game_id: game.id,
            version: 2,
            title: "Sample verified game research",
            sections: { "Game Summary": "Sample current matchup facts." },
            projections: {},
            source: "https://example.com",
            created_at: new Date().toISOString(),
            intelligence: null,
          },
        ];
        if (mode === "missing-research") data = [];
      }
    }
    if (path.endsWith("official_picks") && official)
      data = [
        {
          id: "fixture-pick",
          game_id: game.id,
          stage_id: null,
          analysis_id: "a2",
          market: "Player Prop",
          selection: "Sample Official Player 60+ rushing yards",
          recommended_line: 59.5,
          direction: "over",
          odds: -150,
          stake_cents: 1000,
          model_probability: 65,
          market_probability: 60,
          edge: 5,
          confidence: 6,
          risk: 4,
          predicted_close: "Sample close",
          best_number: "59.5",
          bet_grade: "B",
          fear_index: 3,
          timing: "Sample timing",
          why_like: "Sample case.",
          why_lose: "Sample risk.",
          playable_number: "59.5",
          pass_number: "69.5",
          book: "Sample book",
          created_at: new Date().toISOString(),
        },
      ];
    const relatedTables = [
      "pick_entries",
      "closing_lines",
      "pick_results",
      "process_reviews",
      "bankroll_transactions",
    ];
    if (relatedTables.some((t) => path.endsWith(t))) {
      assert.equal(
        url.searchParams.get("pick_id"),
        "in.(fixture-pick)",
        "dependent reads must stay scoped to this game's pick IDs",
      );
      if (settled) {
        const common = {
          id: "fixture-record",
          pick_id: "fixture-pick",
          source: "https://example.com",
          created_at: new Date().toISOString(),
        };
        if (path.endsWith("pick_entries"))
          data = [{ ...common, line: 59.5, odds: -160 }];
        if (path.endsWith("closing_lines"))
          data = [{ ...common, line: 59.5, odds: -170 }];
        if (path.endsWith("pick_results"))
          data = [
            {
              ...common,
              result: "WIN",
              away_score: 24,
              home_score: 17,
              profit_cents: 625,
              bankroll_cents: null,
            },
          ];
        if (path.endsWith("process_reviews"))
          data = [
            {
              ...common,
              grade: "A",
              classification: "GOOD HANDICAP / GOOD RESULT",
              lessons: "Sample review arrived after the page opened.",
            },
          ];
      }
    }
    return r.fulfill({ json: data });
  });
  await p.goto(base + "/matchups/" + game.slug, {
    waitUntil: "domcontentloaded",
  });
  await p
    .getByText("Loading game research…", { exact: true })
    .waitFor()
    .catch(async (e) => {
      console.error(await p.locator("body").innerText());
      throw e;
    });
  assert.equal(
    await p.getByText("Check your research access", { exact: true }).count(),
    0,
  );
  release();
  await p.getByText("Sample current matchup facts.", { exact: true }).waitFor();
  assert.equal(deskReads, 0, "browser must never download the whole desk");
  // A background same-user token event must not clear already loaded research.
  gate = new Promise((resolve) => {
    release = resolve;
  });
  await p.evaluate(() => {
    const channel = new BroadcastChannel("sb-127-auth-token");
    channel.postMessage({
      event: "TOKEN_REFRESHED",
      session: JSON.parse(localStorage.getItem("sb-127-auth-token")),
    });
    channel.close();
    window.dispatchEvent(new Event("focus"));
  });
  assert.equal(
    await p.getByText("Sample current matchup facts.", { exact: true }).count(),
    1,
  );
  release();
  for (const scenario of [
    "access-error",
    "research-error",
    "missing-research",
    "denied",
  ]) {
    mode = scenario;
    const before = analysisReads;
    await p.reload({ waitUntil: "domcontentloaded" });
    if (scenario === "denied") {
      await p
        .getByRole("heading", {
          name: "Check your research access",
          exact: true,
        })
        .waitFor();
      assert.equal(
        analysisReads,
        before,
        "denied accounts must not request protected research",
      );
    } else {
      await p
        .getByRole("button", { name: "Retry research", exact: true })
        .waitFor();
      assert.equal(
        await p
          .getByText("Check your research access", { exact: true })
          .count(),
        0,
      );
      mode = "member";
      await p
        .getByRole("button", { name: "Retry research", exact: true })
        .click();
      await p
        .getByText("Sample current matchup facts.", { exact: true })
        .waitFor();
    }
  }
  mode = "member";
  official = true;
  await p.reload({ waitUntil: "domcontentloaded" });
  const pickCard = p.locator(".official-card");
  await pickCard.locator("summary.slip-expand-cta").click();
  await pickCard.getByText("Not confirmed", { exact: true }).waitFor();
  await pickCard.getByText("Pending", { exact: true }).waitFor();
  settled = true;
  await p.evaluate(() => window.dispatchEvent(new Event("focus")));
  await pickCard
    .getByRole("heading", { name: "FINAL · 24 – 17", exact: true })
    .waitFor();
  await pickCard
    .getByText("Sample review arrived after the page opened.", { exact: true })
    .waitFor();
  assert.match(
    await pickCard.locator(".number-track > div").nth(1).innerText(),
    /-160/,
  );
  assert.match(
    await pickCard.locator(".number-track > div").nth(2).innerText(),
    /-170/,
  );
  assert.equal(
    await pickCard.getByText("Not confirmed", { exact: true }).count(),
    0,
  );
  official = false;
  game = {
    ...firstGame,
    id: "g1",
    slug: "sample-sea-den-2026-10-15",
    away_team: "Seattle Seahawks",
    home_team: "Denver Broncos",
  };
  await p.goto(base + "/matchups/" + game.slug, {
    waitUntil: "domcontentloaded",
  });
  await p.getByText("Sample current matchup facts.", { exact: true }).waitFor();
  await p
    .getByRole("heading", {
      name: "Seattle Seahawks @ Denver Broncos",
      exact: true,
    })
    .waitFor();
  mode = "denied";
  const beforeSignOut = analysisReads;
  await p.evaluate(() => {
    localStorage.removeItem("sb-127-auth-token");
    const channel = new BroadcastChannel("sb-127-auth-token");
    channel.postMessage({ event: "SIGNED_OUT", session: null });
    channel.close();
  });
  await p
    .getByRole("heading", {
      name: "Sign in to view game research",
      exact: true,
    })
    .waitFor();
  assert.equal(
    await p.getByText("Sample current matchup facts.", { exact: true }).count(),
    0,
  );
  assert.equal(
    analysisReads,
    beforeSignOut,
    "sign-out must clear research without another protected read",
  );
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  await ctx.close();
}
await browser.close();
console.log(
  "NFL game loading: member research, pending access, retry, denied access, game-scoped reads and mobile/desktop passed.",
);

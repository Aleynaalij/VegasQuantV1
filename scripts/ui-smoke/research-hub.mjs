// Synthetic research fixtures only. No production credentials, provider calls or member writes.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const uid = "00000000-0000-4000-8000-000000000001",
  now = Date.parse("2026-11-06T18:00:00Z"),
  at = new Date(now).toISOString(),
  old = new Date(now - 30 * 3600000).toISOString(),
  kickoff = new Date(now + 3600000).toISOString();
const version = readFileSync(
  "src/components/app-refresh-notice.tsx",
  "utf8",
).match(/const VERSION = "([^"]+)"/)[1];
const out = process.env.UI_ARTIFACT_DIR || "artifacts/research-hub";
mkdirSync(out, { recursive: true });
const nfl = {
  id: "nfl-1",
  slug: "sample-seattle-denver",
  away_team: "Seattle Seahawks",
  home_team: "Denver Broncos",
  kickoff,
  kickoff_tbd: false,
  venue: "Sample Field",
  roof: "outdoors",
  schedule_source: "https://example.com/nfl-schedule",
  schedule_observed_at: old,
};
const nba = {
  id: "nba-1",
  slug: "sample-boston-detroit",
  away_team: "Boston Celtics",
  home_team: "Detroit Pistons",
  away_abbreviation: "BOS",
  home_abbreviation: "DET",
  tipoff: kickoff,
  tipoff_tbd: false,
  venue: "Sample Arena",
  status: "STATUS_SCHEDULED",
  source: "https://example.com/nba-schedule",
  updated_at: at,
};
const game = (sport) => ({
  id: `${sport}-1`,
  sport,
  slug: `sample-${sport}`,
  away: { name: sport === "nhl" ? "Calgary Flames" : "Bowie Sample Bears" },
  home: { name: sport === "nhl" ? "Anaheim Ducks" : "Sample State" },
  start_time: kickoff,
  start_time_tbd: false,
  venue: "Sample Center",
  status: "STATUS_SCHEDULED",
  completed: false,
  source: { url: "https://example.com/schedule", retrieved_at: at },
});
const analysis = {
  id: "analysis-1",
  game_id: nfl.id,
  version: 1,
  title: "Sample briefing",
  sections: {
    Injuries: "Sample Runner: Questionable. Report status can change.",
    Weather: "Wind 15 mph in the saved forecast.",
    Sources: "https://example.com/briefing",
  },
  source: "https://example.com/briefing",
  created_at: old,
  intelligence: { weather: { forecast: "Wind 15 mph", issued_at: old } },
};
const news = {
  id: "news-1",
  game_id: nfl.id,
  category: "Injury watch",
  title: "Sample Runner availability",
  summary: "Sample Runner is listed questionable.",
  why_watch: "Watch the next injury report.",
  caution: "Availability is not confirmed.",
  source_url: "https://example.com/injuries",
  source_at: old,
  created_at: at,
};
const wrong = {
  ...news,
  id: "wrong",
  game_id: "wrong-event",
  title: "Wrong Event Player must never appear",
  summary: "Wrong Event Player",
};
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE,
  headless: true,
  args: ["--no-sandbox"],
});
async function setup(width, theme = "light", mode = "ready", signedIn = true) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    reducedMotion: "reduce",
  });
  await ctx.addInitScript(
    ({ uid, version, theme, signedIn }) => {
      sessionStorage.setItem("vq-prompt-shown", "fixture");
      localStorage.setItem("vq-theme", theme);
      if (document.documentElement)
        document.documentElement.dataset.theme = theme;
      if (signedIn) {
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
      }
    },
    { uid, version, theme, signedIn },
  );
  let state = mode;
  await ctx.route("**/rest/v1/rpc/membership_status", (r) =>
    r.fulfill({
      json: { allowed: state !== "denied", admin: false, member_code: null },
    }),
  );
  await ctx.route("**/rest/v1/games?**", (r) =>
    r.fulfill(
      state === "failure"
        ? { status: 503, json: { message: "Fixture source offline" } }
        : { json: state === "empty" ? [] : [nfl] },
    ),
  );
  await ctx.route("**/rest/v1/nba_games?**", (r) =>
    r.fulfill(
      state === "failure"
        ? { status: 503, json: { message: "Fixture source offline" } }
        : { json: state === "empty" ? [] : [nba] },
    ),
  );
  await ctx.route("**/rest/v1/rpc/sports_slate", (r) => {
    const sport = r.request().postDataJSON().p_sport;
    return r.fulfill(
      state === "failure"
        ? { status: 503, json: { message: "Source unavailable" } }
        : {
            json: {
              version: 1,
              sport,
              access: state !== "denied",
              games: state === "empty" ? [] : [game(sport)],
              facts: [],
              markets: [],
              selections: [],
              results: [],
            },
          },
    );
  });
  await ctx.route("**/rest/v1/analysis_versions?**", (r) =>
    r.fulfill({ json: state === "missing" ? [] : [analysis] }),
  );
  await ctx.route("**/rest/v1/research_feed_posts?**", (r) =>
    r.fulfill({ json: state === "missing" ? [] : [news, wrong] }),
  );
  await ctx.route("**/rest/v1/source_observations?**", (r) =>
    r.fulfill({ json: [] }),
  );
  await ctx.route("**/rest/v1/published_legs?**", (r) =>
    r.fulfill({ json: [] }),
  );
  await ctx.route("**/rest/v1/market_snapshots?**", (r) =>
    r.fulfill({ json: [] }),
  );
  await ctx.route("**/rest/v1/nba_observations?**", (r) =>
    r.fulfill({
      json:
        state === "missing"
          ? []
          : [
              {
                id: "nba-injury",
                game_id: nba.id,
                kind: "injury",
                provider: "ESPN",
                source: "https://example.com/nba-injury",
                observed_at: old,
                recorded_at: at,
                payload: {
                  team: "Boston",
                  player: "Sample Guard",
                  status: "Out",
                },
              },
            ],
    }),
  );
  await ctx.route("**/api/nba/lineups", (r) => {
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(kickoff));
    const time = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(kickoff));
    const team = (name, status) => ({
      team: name,
      status,
      starters:
        status === "confirmed"
          ? Array.from({ length: 5 }, (_, i) => ({
              id: String(i + 1),
              name: `Sample Starter ${i + 1}`,
              position: "G",
              status: null,
            }))
          : [],
      availability: [],
    });
    return r.fulfill({
      json: {
        version: 1,
        source: "https://www.rotowire.com/basketball/nba-lineups.php",
        checked_at: at,
        server_now: at,
        games:
          state === "missing"
            ? []
            : [
                {
                  day,
                  time,
                  away: team("BOS", "confirmed"),
                  home: team("DET", "expected"),
                },
              ],
      },
    });
  });
  const page = await ctx.newPage(),
    errors = [];
  await page.clock.setFixedTime(new Date(now));
  page.on("pageerror", (e) => errors.push(e.message));
  return { ctx, page, errors, setState: (v) => (state = v) };
}
try {
  for (const width of [360, 390, 1280])
    for (const theme of ["light", "dark"]) {
      const { ctx, page, errors } = await setup(width, theme);
      await page.goto(base + "/feed?view=latest");
      await page.waitForURL("**/research");
      await page.locator(".rh-event").first().waitFor();
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      assert.equal(await page.locator(".rh-event").count(), 4);
      await page.screenshot({
        path: `${out}/${width}-${theme}-ledger.png`,
        fullPage: true,
      });
      await page.getByRole("button", { name: "NFL", exact: true }).click();
      await page.waitForFunction(
        () => document.querySelectorAll(".rh-event").length === 1,
      );
      assert.equal(await page.locator(".rh-event").count(), 1);
      await page.getByLabel("Event date", { exact: true }).fill("2026-11-06");
      await page.waitForURL("**/*date=2026-11-06*");
      await page
        .getByRole("searchbox", { name: "Search teams, players or events" })
        .fill("Sample Runner");
      await page.waitForURL("**/*q=Sample+Runner*");
      assert.equal(await page.locator(".rh-event").count(), 1);
      await page.locator(".rh-event").click();
      await page
        .getByRole("region", { name: "Event dossier", exact: true })
        .waitFor();
      if (process.env.UI_SMOKE_NEGATIVE === "wrong-event")
        await page
          .locator(".rh-dossier")
          .evaluate((e) => e.append("Wrong Event Player"));
      assert.ok(
        !(await page.locator(".rh-dossier").innerText()).includes(
          "Wrong Event Player",
        ),
        "wrong-event research is rejected",
      );
      assert.ok(
        (await page.locator(".rh-dossier").innerText()).includes(
          "Older source snapshot",
        ),
        "source age survives a new receipt",
      );
      const unknown = page.locator('[data-age="Source time unknown"]').first();
      if (process.env.UI_SMOKE_NEGATIVE === "false-freshness")
        await unknown.evaluate(
          (e) => (e.textContent = "Recent source snapshot"),
        );
      assert.equal(
        await unknown.textContent(),
        "Source time unknown",
        "publication is not proof of source freshness",
      );
      await page.screenshot({
        path: `${out}/${width}-${theme}-dossier.png`,
        fullPage: true,
      });
      await page.reload();
      await page
        .getByRole("region", { name: "Event dossier", exact: true })
        .waitFor();
      assert.ok(
        page.url().includes("sport=nfl") &&
          page.url().includes("q=Sample+Runner"),
      );
      await page
        .getByRole("link", { name: "All tracked events", exact: true })
        .click();
      await page.locator(".rh-event").waitFor();
      await page.goBack();
      await page
        .getByRole("region", { name: "Event dossier", exact: true })
        .waitFor();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        "no horizontal clipping",
      );
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  {
    const { ctx, page } = await setup(390, "light");
    await page.goto(
      base + "/research?sport=nba&event=nba%3Anba-1&topic=lineups",
    );
    await page.locator(".nba-lineup-confirmed").waitFor();
    assert.equal(
      await page.locator(".nba-lineup-confirmed").innerText(),
      "Confirmed starters",
    );
    assert.ok(
      (await page.locator(".nba-lineups").innerText()).includes(
        "Awaiting confirmed starters",
      ),
    );
    assert.equal(
      await page.locator(".nba-lineup-team ol li").count(),
      5,
      "expected lineup does not invent starters",
    );
    await page.screenshot({
      path: `${out}/390-lineup-status.png`,
      fullPage: true,
    });
    await ctx.close();
  }
  for (const mode of ["empty", "missing", "failure", "denied"]) {
    const { ctx, page, setState } = await setup(
      390,
      "dark",
      mode,
      mode !== "denied",
    );
    await page.goto(base + "/research");
    if (mode === "empty")
      await page
        .getByRole("heading", { name: "No upcoming events returned" })
        .waitFor();
    if (mode === "missing") {
      await page.locator(".rh-event").first().click();
      await page
        .getByText("No linked injury report is available in this view.", {
          exact: false,
        })
        .waitFor();
    }
    if (mode === "failure") {
      await page.getByText("Partial coverage", { exact: true }).waitFor();
      if (process.env.UI_SMOKE_NEGATIVE === "failure-as-empty")
        await page.locator(".rh-warning").evaluate((e) => e.remove());
      assert.ok(
        (await page.locator(".rh-warning").count()) > 0,
        "failure shown as unavailable, not empty",
      );
      setState("ready");
      await page
        .getByRole("button", { name: "Retry unavailable sources" })
        .click();
      await page.locator(".rh-event").first().waitFor();
    }
    if (mode === "denied") {
      await page
        .getByRole("heading", { name: "Open your research access" })
        .waitFor();
      assert.equal(await page.locator(".rh-finding").count(), 0);
    }
    await page.screenshot({ path: `${out}/390-${mode}.png`, fullPage: true });
    await ctx.close();
  }
  // A second tab changes the actual Supabase storage key: the research tab must discard protected data.
  const { ctx, page, setState } = await setup(390);
  await page.goto(base + "/research?event=nfl%3Anfl-1");
  await page.locator(".rh-finding").first().waitFor();
  setState("denied");
  const other = await ctx.newPage();
  await other.goto(base + "/about");
  await other.evaluate(() => {
    localStorage.removeItem("sb-127-auth-token");
    // This is the SDK's real cross-tab auth transport, also used by signOut().
    const channel = new BroadcastChannel("sb-127-auth-token");
    channel.postMessage({ event: "SIGNED_OUT", session: null });
    setTimeout(() => channel.close(), 1000);
  });
  await page
    .getByRole("heading", { name: "Open your research access" })
    .waitFor();
  assert.equal(
    await page.locator(".rh-finding").count(),
    0,
    "protected findings cleared on account change",
  );
  await ctx.close();
  console.log(
    "PASS research hub 360/390/1280, both themes, filters, Back/refresh, source identity/time, empty/missing/failure/retry/denied and account clearing",
  );
} finally {
  await browser.close();
}

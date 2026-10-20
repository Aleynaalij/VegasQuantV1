// Synthetic fixtures only; never published or used as research.
import assert from "node:assert/strict";
const pw = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const { chromium } = pw.default || pw;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const base = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
for (const width of [390, 1280]) {
  const ctx = await browser.newContext({ viewport: { width, height: 950 } });
  const p = await ctx.newPage();
  let member = true,
    fail = false,
    closed = false;
  const quote = new Date(Date.now() - 3600000).toISOString();
  const tipoff = new Date(Date.now() + 86400000).toISOString();
  await p.route("**/rest/v1/**", async (r) => {
    const path = new URL(r.request().url()).pathname;
    let data = [];
    if (path.endsWith("membership_status"))
      data = { allowed: member, admin: false };
    if (path.endsWith("nba_editorial_picks")) {
      if (fail)
        return r.fulfill({ status: 500, json: { message: "fixture error" } });
      data = [
        {
          id: "fixture",
          publication_key: "fixture",
          player: "Fixture Player",
          market: "player_rebounds",
          direction: "Over",
          line: 11.5,
          odds: 100,
          book: "FanDuel",
          rationale: "Fixture role and matchup case.",
          risk: "Fixture foul trouble risk.",
          unknowns: "Fixture final availability unknown.",
          sources: [
            { label: "Fixture source", url: "https://www.nba.com/" },
            { label: "Unhashed citation", url: "https://example.com/unhashed" },
          ],
          evidence_sources: [
            {
              url: "https://www.nba.com/",
              sha256: "a".repeat(64),
              retrieved_at: quote,
            },
          ],
          published_at: quote,
          expires_at: tipoff,
          quote_observed_at: quote,
          quote_recorded_at: quote,
          quote_source_url: "https://the-odds-api.com/",
          game: {
            slug: "fixture",
            away_team: "Away",
            home_team: "Home",
            tipoff,
            tipoff_tbd: false,
            status: closed ? "STATUS_IN_PROGRESS" : "STATUS_SCHEDULED",
          },
        },
      ];
    }
    return r.fulfill({ json: data });
  });
  await p.goto(base + "/nba/zone");
  await p.getByText("Fixture Player", { exact: true }).first().waitFor();
  assert.equal(
    await p.getByText("FanDuel +100 · observed", { exact: true }).count(),
    1,
  );
  await p.getByText("Sources & availability", { exact: true }).click();
  assert.equal(
    await p.getByText("Preparation mode", { exact: true }).count(),
    0,
  );
  assert.equal(
    await p.getByRole("link", { name: "Unhashed citation ↗" }).count(),
    0,
  );
  assert.equal(
    await p.getByRole("link", { name: "Fixture source ↗" }).count(),
    1,
  );
  await p
    .getByText("Fixture final availability unknown.", { exact: true })
    .waitFor();
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  await p.screenshot({
    path: `/tmp/vq-nba-editorial-${width}.png`,
    fullPage: true,
  });
  await p
    .getByRole("button", { name: "Copy pick & open Gambly ↗", exact: true })
    .click();
  await p.getByRole("dialog").waitFor();
  await p
    .getByRole("checkbox", { name: "I confirm I am 21 or older." })
    .check();
  await p.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (t) => {
          window.fixtureCopy = t;
        },
      },
    });
  });
  await p
    .getByRole("button", { name: "Copy pick to clipboard", exact: true })
    .click();
  await p
    .getByRole("link", { name: "Open Gambly · Paste pick there ↗" })
    .waitFor();
  assert.equal(
    await p.evaluate(() => window.fixtureCopy),
    "Fixture Player over 11.5 rebounds",
  );
  closed = true;
  await p.reload();
  await p
    .getByText("Pregame copying closed. Original selection preserved.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await p
      .getByRole("button", { name: "Copy pick & open Gambly ↗", exact: true })
      .count(),
    0,
  );
  member = false;
  await p.reload();
  await p
    .getByText("Sign in to see NBA selections →", { exact: true })
    .waitFor();
  assert.equal(await p.getByText("Fixture Player", { exact: true }).count(), 0);
  member = true;
  fail = true;
  await p.reload();
  await p
    .getByRole("alert")
    .filter({ hasText: "NBA selections could not refresh." })
    .waitFor();
  fail = false;
  await p.getByRole("button", { name: "Retry", exact: true }).click();
  await p.getByText("Fixture Player", { exact: true }).first().waitFor();
  await ctx.close();
}
await browser.close();
console.log(
  "NBA editorial cards: price, evidence, Gambly copy, cutoff, denied access, failure/retry and no overflow passed at 390/1280.",
);

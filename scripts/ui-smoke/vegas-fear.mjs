import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const base = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const out = process.env.UI_ARTIFACT_DIR || "artifacts/vegas-fear";
const version = readFileSync(
  "src/components/app-refresh-notice.tsx",
  "utf8",
).match(/const VERSION = "([^"]+)"/)[1];
const uid = "00000000-0000-4000-8000-000000000001";
const now = Date.parse("2026-11-06T20:00:00Z");
const at = (min) => new Date(now - min * 60_000).toISOString();
const event = {
  id: "fear-event",
  home_team: "Fixture Home",
  away_team: "Fixture Away",
  kickoff: at(-120),
  kickoff_tbd: false,
};
const path = "/vegas-fear?sport=nfl&event=fear-event&market=spreads";
const negative = process.env.UI_SMOKE_NEGATIVE || "";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE,
  headless: true,
});

function quote(
  minutes,
  book,
  point,
  price,
  game = event.id,
  market = "spreads",
) {
  return {
    id: `${minutes}-${book}`,
    game_id: game,
    kind: "odds",
    provider: "The Odds API",
    source: "https://the-odds-api.com",
    observed_at: at(minutes),
    recorded_at: at(0),
    payload: {
      book,
      market,
      event_id: "provider-event",
      outcomes: [{ name: event.home_team, point, price }],
    },
  };
}
const rows = [
  quote(20, "FanDuel", -2, -110),
  quote(4, "FanDuel", -3, -112),
  quote(2, "DraftKings", -3, 105),
  quote(40, "Fanatics", -3, -115),
  quote(1, "Wrong event", -3, -105, "wrong-event"),
  quote(1, "Wrong market", -3, -105, event.id, "spreads_q1"),
];

async function fixture(width, theme, access = "allowed", mode = "ready") {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    hasTouch: width < 500,
  });
  await ctx.addInitScript(
    ({ uid, version, theme, access, now }) => {
      sessionStorage.setItem("vq-prompt-shown", "fixture");
      localStorage.setItem("vq-theme", theme);
      localStorage.setItem("vq-app-refresh:" + uid, version);
      if (access !== "signed-out")
        localStorage.setItem(
          "sb-127-auth-token",
          JSON.stringify({
            access_token: "smoke",
            refresh_token: "smoke",
            token_type: "bearer",
            expires_at: Math.floor(now / 1000) + 86400,
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
    { uid, version, theme, access, now },
  );
  await ctx.route("**/rest/v1/rpc/membership_status", (r) =>
    r.fulfill({ json: { allowed: access === "allowed", admin: false } }),
  );
  await ctx.route("**/rest/v1/games?**", (r) => r.fulfill({ json: [event] }));
  let reads = 0;
  await ctx.route("**/rest/v1/source_observations?**", (r) => {
    reads++;
    const q = new URL(r.request().url()).searchParams;
    assert.equal(q.get("game_id"), "eq.fear-event");
    if (q.get("kind") === "eq.injury") return r.fulfill({ json: [] });
    assert.equal(q.get("kind"), "in.(odds)");
    return mode === "error"
      ? r.fulfill({ status: 503, json: { message: "Fixture source offline" } })
      : r.fulfill({ json: mode === "empty" ? [] : rows });
  });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(now));
  return {
    page,
    ctx,
    reads: () => reads,
    setMode: (value) => {
      mode = value;
    },
    deny: () => {
      access = "denied";
    },
  };
}

async function inspect(page) {
  const main = page.locator(".fear-page");
  await page.getByText("Line moved from -2 to -3.", { exact: false }).waitFor();
  if (negative)
    await main.evaluate((element, mode) => {
      if (mode === "wrong-comparison") element.append("Wrong event");
      if (mode === "false-freshness")
        [...element.querySelectorAll("p")]
          .find((p) => p.textContent.includes("Older snapshot"))
          .remove();
      if (mode === "missing-as-zero") element.append("0% pressure");
    }, negative);
  const body = await main.innerText();
  assert.doesNotMatch(
    body,
    /Wrong event|Wrong market/,
    "wrong event or market is excluded",
  );
  assert.match(body, /Older snapshot/, "receipt cannot establish freshness");
  assert.doesNotMatch(
    body,
    /0% pressure/,
    "missing evidence stays unavailable",
  );
  assert.match(body, /Movement unavailable/);
  assert.match(body, /2 books/);
  assert.equal(
    await main
      .getByRole("link", { name: /Odds API source/ })
      .first()
      .getAttribute("href"),
    "https://the-odds-api.com/",
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
}

try {
  for (const width of [360, 390, 1280])
    for (const theme of ["light", "dark"]) {
      const { page, ctx } = await fixture(width, theme);
      await page.goto(base + path);
      await inspect(page);
      if (width < 500) {
        await Promise.all([
          page.waitForResponse((response) => {
            const url = new URL(response.url());
            return (
              url.pathname.endsWith("/source_observations") &&
              url.searchParams.get("kind") === "in.(odds)" &&
              response.ok()
            );
          }),
          page.getByRole("button", { name: "Refresh sources" }).tap(),
        ]);
        await inspect(page);
      }
      await page.screenshot({
        path: `${out}/${width}-${theme}.png`,
        fullPage: true,
      });
      const filter = page.getByLabel("Market", { exact: true });
      await filter.focus();
      await filter.press("Tab");
      assert.equal(
        await page.evaluate(() => document.activeElement.textContent),
        "Refresh sources",
      );
      await filter.selectOption("h2h");
      await page
        .getByText(
          "Movement unavailable. No eligible quote history for this selection.",
        )
        .waitFor();
      await page.goBack();
      await page.waitForURL(base + path);
      await inspect(page);
      await page.reload();
      await inspect(page);
      await page.getByLabel("Sport", { exact: true }).selectOption("nhl");
      await page
        .getByText("Market pressure for NHL is unavailable in this draft.")
        .waitFor();
      await ctx.close();
      console.log(`PASS market pressure ${width} ${theme}`);
    }
  for (const access of ["signed-out", "denied"]) {
    const { page, ctx, reads } = await fixture(390, "light", access);
    await page.goto(base + path);
    await page
      .getByText(
        access === "denied"
          ? "Research access is required."
          : "Sign in to see market observations.",
        { exact: false },
      )
      .waitFor();
    assert.equal(reads(), 0);
    await ctx.close();
  }
  {
    const { page, ctx, reads, setMode, deny } = await fixture(
      390,
      "light",
      "allowed",
      "error",
    );
    await page.goto(base + path);
    await page
      .getByText("Quote source unavailable.", { exact: false })
      .waitFor();
    const before = reads();
    setMode("empty");
    await page.getByRole("button", { name: "Refresh sources" }).click();
    await page
      .getByText(
        "Movement unavailable. No eligible quote history for this selection.",
      )
      .waitFor();
    assert.ok(reads() > before);
    setMode("ready");
    await page.getByRole("button", { name: "Refresh sources" }).click();
    await inspect(page);
    deny();
    await page.evaluate(() => {
      localStorage.removeItem("sb-127-auth-token");
      const channel = new BroadcastChannel("sb-127-auth-token");
      channel.postMessage({ event: "SIGNED_OUT", session: null });
    });
    await page
      .getByText("Sign in to see market observations.", { exact: false })
      .waitFor();
    assert.equal(await page.locator(".fear-quote").count(), 0);
    await ctx.close();
  }
  console.log(
    "PASS access, account clearing, source failure, retry, empty and unsupported",
  );
} finally {
  await browser.close();
}

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

async function fixture(width, access = "allowed", mode = "ready") {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    hasTouch: width < 500,
    reducedMotion: "reduce",
  });
  await ctx.addInitScript(
    ({ uid, version, access, now }) => {
      sessionStorage.setItem("vq-prompt-shown", "fixture");
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
    { uid, version, access, now },
  );
  await ctx.route("**/rest/v1/rpc/membership_status", (r) =>
    r.fulfill({ json: { allowed: access === "allowed", admin: false } }),
  );
  await ctx.route("**/rest/v1/games?**", (r) => r.fulfill({ json: [event] }));
  const nba = {
    ...event,
    id: "nba-event",
    tipoff: event.kickoff,
    tipoff_tbd: false,
  };
  await ctx.route("**/rest/v1/nba_games?**", (r) => r.fulfill({ json: [nba] }));
  await ctx.route("**/rest/v1/nba_observations?**", (r) => {
    const q = new URL(r.request().url()).searchParams;
    assert.equal(q.get("game_id"), "eq.nba-event");
    if (q.get("kind") === "eq.injury") {
      assert.equal(q.get("limit"), "101");
      if (mode === "partial")
        return r.fulfill({
          status: 403,
          json: { message: "Fixture injury source unavailable" },
        });
      return r.fulfill({
        json: [
          {
            ...quote(180, "fixture", -3, -110, nba.id),
            id: "injury",
            kind: "injury",
            source: "https://www.espn.com/nba/injuries",
            payload: {
              team: nba.home_team,
              player: "Fixture Guard",
              status: "Questionable",
            },
          },
          {
            ...quote(10, "fixture", -3, -110, "other-game"),
            id: "unrelated",
            kind: "injury",
            payload: {
              team: nba.home_team,
              player: "Unrelated Injury",
              status: "Out",
            },
          },
        ],
      });
    }
    assert.equal(q.get("kind"), "in.(odds,prop)");
    assert.equal(q.get("limit"), "501");
    const spread = {
      ...quote(4, "FanDuel", -3, -112, nba.id),
      provider: "The Odds API NBA",
    };
    const prop = {
      ...quote(3, "FanDuel", 21.5, -110, nba.id, "player_points"),
      kind: "prop",
      provider: "The Odds API NBA props",
      payload: {
        book: "FanDuel",
        market: "player_points",
        event_id:
          negative === "nba-identity"
            ? "different-provider-event"
            : "provider-event",
        outcomes: [
          {
            name: "Over",
            description: "Fixture Guard",
            point: 21.5,
            price: -110,
          },
        ],
      },
    };
    const quotes = [
      spread,
      prop,
      {
        ...quote(2, "DraftKings", -3, 105, nba.id),
        provider: "The Odds API NBA",
      },
    ];
    if (mode === "truncated")
      quotes.push(
        ...Array.from({ length: 498 }, (_, i) => ({
          ...spread,
          id: "duplicate-" + i,
        })),
      );
    return r.fulfill({ json: quotes });
  });
  const pending = Promise.withResolvers();
  const release = Promise.withResolvers();
  let reads = 0;
  await ctx.route("**/rest/v1/source_observations?**", async (r) => {
    reads++;
    const q = new URL(r.request().url()).searchParams;
    assert.equal(q.get("game_id"), "eq.fear-event");
    if (q.get("kind") === "eq.injury") return r.fulfill({ json: [] });
    assert.equal(q.get("kind"), "in.(odds)");
    if (mode === "delayed") {
      pending.resolve();
      await release.promise;
    }
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
    pending: pending.promise,
    release: release.resolve,
    setMode: (value) => {
      mode = value;
    },
    deny: () => {
      access = "denied";
    },
  };
}

async function openFromLobby(page, width) {
  await page.goto(base + "/");
  const section = page.getByRole("region", { name: "VQ Intelligence" });
  const fear = section.getByRole("link", {
    name: "Fear Index, NFL and NBA market pressure",
    exact: true,
  });
  await page.locator(".vq-brand-opening").waitFor({ state: "hidden" });
  await fear.waitFor();
  if (width) {
    await section.evaluate((element) =>
      element.scrollIntoView({ block: "center", behavior: "instant" }),
    );
    assert.ok(
      await fear.evaluate((element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return element.contains(
          document.elementFromPoint(x + width / 2, y + height / 2),
        );
      }),
      "the lobby Fear card is unobstructed in the screenshot",
    );
    await section.screenshot({ path: `${out}/${width}-lobby-dark.png` });
  }
  await fear.click();
  await page.waitForURL(base + "/vegas-fear");
  await page.getByRole("heading", { name: "Market pressure" }).waitFor();
}

async function selectFixtureEvent(page) {
  const picker = page.getByLabel("Event", { exact: true });
  await picker
    .locator('option[value="fear-event"]')
    .waitFor({ state: "attached" });
  await picker.selectOption("fear-event");
}

async function inspect(page) {
  const main = page.locator(".fear-page");
  await page.getByText("Line moved from -2 to -3.", { exact: false }).waitFor();
  if (negative && negative !== "nba-identity")
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
  if (!negative)
    for (const width of [360, 390, 1280]) {
      const { page, ctx } = await fixture(width);
      await openFromLobby(page, width);
      await page.goBack();
      await page.waitForURL(base + "/");
      await page.getByRole("link", { name: /Fear Index, NFL and NBA/ }).click();
      await page.waitForURL(base + "/vegas-fear");
      await selectFixtureEvent(page);
      await inspect(page);
      await page.reload();
      await inspect(page);
      await ctx.close();
      console.log(
        `PASS lobby to Fear, allowed member, Back and reload at ${width}px`,
      );
    }
  if (negative !== "nba-identity")
    for (const width of [360, 390, 1280]) {
      const { page, ctx } = await fixture(width);
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
      await page.locator(".vq-brand-opening").waitFor({ state: "hidden" });
      assert.equal(
        await page.locator("html").getAttribute("data-theme"),
        "dark",
      );
      await page.getByRole("heading", { name: "Market pressure" }).waitFor();
      await page.getByLabel("Sport", { exact: true }).waitFor();
      await page.getByLabel("Event", { exact: true }).waitFor();
      await page.getByLabel("Market", { exact: true }).waitFor();
      assert.ok(
        await page
          .getByRole("heading", { name: "Market pressure" })
          .boundingBox(),
      );
      await page.screenshot({
        path: `${out}/${width}-dark.png`,
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
      console.log(`PASS market pressure ${width} dark`);
    }
  {
    const { page, ctx, setMode } = await fixture(390);
    await page.goto(base + "/vegas-fear");
    await page.getByLabel("Sport", { exact: true }).selectOption("nba");
    const picker = page.getByLabel("Event", { exact: true });
    await picker
      .locator('option[value="nba-event"]')
      .waitFor({ state: "attached" });
    await picker.selectOption("nba-event");
    await page
      .getByRole("heading", { name: "Fixture Away at Fixture Home" })
      .waitFor();
    const tape = await page.locator(".fear-page").innerText();
    assert.match(
      tape,
      /Fixture Guard · Over/,
      "mixed NBA feeds preserve both tapes",
    );
    assert.match(
      tape,
      /FanDuel · Spread/i,
      "mixed NBA feeds preserve both tapes",
    );
    assert.match(tape, /The Odds API NBA props source/);
    assert.match(tape, /Fixture Guard · Fixture Home · Reported Questionable/);
    assert.doesNotMatch(
      tape,
      /Unrelated Injury|Multiple provider event identities/,
    );
    setMode("partial");
    await page.getByRole("button", { name: "Refresh sources" }).click();
    await page
      .getByText("Availability source could not load.", { exact: false })
      .waitFor();
    await page.getByRole("heading", { name: "Fixture Guard · Over" }).waitFor();
    setMode("truncated");
    await page.getByRole("button", { name: "Refresh sources" }).click();
    await page
      .getByText("Dispersion unavailable with truncated book coverage.")
      .waitFor();
    await page.getByRole("heading", { name: "Fixture Guard · Over" }).waitFor();
    await ctx.close();
    console.log(
      "PASS NBA event picker, mixed feeds, injury isolation, partial source failure and truncation",
    );
  }
  {
    const { page, ctx, pending, release, deny } = await fixture(
      390,
      "allowed",
      "delayed",
    );
    await page.goto(base + path);
    await pending;
    deny();
    await page.evaluate(() => {
      const storage = "sb-127-auth-token";
      const session = JSON.parse(localStorage.getItem(storage));
      session.user.id = "00000000-0000-4000-8000-000000000002";
      session.access_token = "fixture-account-b";
      localStorage.setItem(storage, JSON.stringify(session));
      const channel = new BroadcastChannel(storage);
      channel.postMessage({ event: "SIGNED_IN", session });
    });
    await page
      .getByText("Research access is required.", { exact: false })
      .waitFor();
    const old = page.waitForResponse(
      (r) =>
        r.url().includes("source_observations") &&
        new URL(r.url()).searchParams.get("kind") === "in.(odds)",
    );
    release();
    await (await old).finished();
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    assert.equal(
      await page.locator(".fear-quote").count(),
      0,
      "pending A response cannot populate B",
    );
    await page
      .getByText("Research access is required.", { exact: false })
      .waitFor();
    await ctx.close();
    console.log("PASS delayed A-to-B account switch");
  }
  for (const access of ["signed-out", "denied"]) {
    const { page, ctx, reads } = await fixture(390, access);
    await openFromLobby(page);
    await selectFixtureEvent(page);
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
    console.log(`PASS lobby to Fear, ${access} without protected reads`);
  }
  {
    const { page, ctx, reads, setMode, deny } = await fixture(
      390,
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

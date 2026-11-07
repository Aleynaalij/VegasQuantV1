import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const base = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const path = "/fear-tester-diagnostic";
const storage = "sb-127-auth-token";
const version = readFileSync(
  "src/components/app-refresh-notice.tsx",
  "utf8",
).match(/const VERSION = "([^"]+)"/)[1];
const now = Date.parse("2026-11-06T20:00:00Z");
const receipt = "2026-11-06T19:59:00.123456+00:00";
const uid = "00000000-0000-4000-8000-000000000001";
const otherUid = "00000000-0000-4000-8000-000000000002";
const token = "fixture-private-access-token";
const otherToken = "fixture-private-other-token";
const privateError = "fixture-private-error-body";
const ids = { nfl: "fixture-nfl-event", nba: "fixture-nba-event" };

const rows = Array.from({ length: 251 }, (_, i) => ({
  id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  kind: "odds",
  provider: "Fixture provider",
  source: "https://example.com/odds",
  observed_at: "2026-11-06T19:58:00Z",
  recorded_at: receipt,
  payload: {
    book: "FanDuel",
    market: "spreads",
    event_id: "fixture-provider-event",
    outcomes: [{ name: "Fixture Home", point: -3, price: -110 }],
  },
}));
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE,
  headless: true,
});
const deniedResponse = (route) =>
  route.fulfill({
    status: 403,
    json: { code: "42501", message: privateError },
  });

async function fixture(initialMode) {
  let mode = initialMode;
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 900 },
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  await ctx.addInitScript(
    ({ uid, token, storage, version, now, signedOut }) => {
      sessionStorage.setItem("vq-prompt-shown", "fixture");
      localStorage.setItem("vq-app-refresh:" + uid, version);
      if (!signedOut)
        localStorage.setItem(
          storage,
          JSON.stringify({
            access_token: token,
            refresh_token: "fixture-private-refresh-token",
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
    {
      uid,
      token,
      storage,
      version,
      now,
      signedOut: initialMode === "signed-out",
    },
  );
  const calls = [];
  const eligibility = [];
  let rawReads = 0;
  let membershipReads = 0;
  let schedules = 0;
  const logs = [];
  const pending = Promise.withResolvers();
  const release = Promise.withResolvers();
  await ctx.route("**/rest/v1/rpc/membership_status", (route) => {
    membershipReads++;
    return route.fulfill({ json: { allowed: true, admin: true } });
  });
  await ctx.route("**/rest/v1/*observations?**", (route) => {
    rawReads++;
    return deniedResponse(route);
  });
  const allowed = (route) =>
    (mode === "enabled" || mode === "partial" || mode === "delayed") &&
    route.request().headers().authorization === "Bearer " + token;
  await ctx.route("**/rest/v1/rpc/tester_feature_access", (route) => {
    const args = route.request().postDataJSON();
    assert.ok(["fear", "research"].includes(args.p_feature));
    eligibility.push(args.p_feature);
    return route.fulfill({ json: allowed(route) });
  });
  await ctx.route("**/rest/v1/rpc/tester_observation_page", async (route) => {
    const args = route.request().postDataJSON();
    calls.push(args);
    assert.equal(args.p_as_of, new Date(now).toISOString());
    assert.equal(args.p_game, ids[args.p_sport]);
    if (!allowed(route)) return deniedResponse(route);
    if (args.p_section === "context" && args.p_feature === "fear")
      return route.fulfill({
        status: 400,
        json: { code: "22023", message: privateError },
      });
    if (args.p_section !== "quotes") {
      return route.fulfill({
        json: [
          {
            ...rows[0],
            game_id: args.p_game,
            kind: args.p_section === "injury" ? "injury" : "news",
            payload: {
              team: "Fixture Home",
              player: privateError,
              status: "Out",
            },
          },
        ],
      });
    }
    const batch = rows.map((row) => ({ ...row, game_id: args.p_game }));
    if (args.p_after_id) {
      assert.equal(
        args.p_before,
        receipt,
        "timestamp cursor preserves microseconds",
      );
      assert.equal(
        args.p_after_id,
        rows[249].id,
        "cursor uses the last kept row",
      );
      if (mode === "partial")
        return route.fulfill({ status: 503, json: { message: privateError } });
      return route.fulfill({ json: batch.slice(249) });
    }
    if (mode === "delayed" && args.p_feature === "fear") {
      pending.resolve();
      await release.promise;
      return route.fulfill({ json: batch }).catch(() => {});
    }
    return route.fulfill({ json: batch });
  });
  for (const sport of ["nfl", "nba"]) {
    const column = sport === "nfl" ? "kickoff" : "tipoff";
    const table = sport === "nfl" ? "games" : "nba_games";
    await ctx.route(`**/rest/v1/${table}?**`, (route) => {
      schedules++;
      return route.fulfill({
        json: [
          {
            id: ids[sport],
            away_team: "Fixture Away",
            home_team: "Fixture Home",
            [column]: "2026-11-07T02:00:00Z",
            [column + "_tbd"]: false,
          },
        ],
      });
    });
  }
  const page = await ctx.newPage();
  page.on("console", (message) => logs.push(message.text()));
  page.on("pageerror", (error) => logs.push(error.message));
  await page.clock.setFixedTime(new Date(now));
  await page.goto(base + path);
  await page.getByRole("heading", { name: "Fear tester diagnostic" }).waitFor();
  await page.locator(".vq-brand-opening").waitFor({ state: "hidden" });
  return {
    page,
    ctx,
    calls,
    eligibility,
    logs,
    setMode: (next) => {
      mode = next;
    },
    pending: pending.promise,
    release: release.resolve,
    counts: () => ({ rawReads, membershipReads, schedules }),
  };
}

async function select(page, sport = "nfl") {
  await page.getByLabel("Sport", { exact: true }).selectOption(sport);
  await page.getByRole("button", { name: "Load games" }).click();
  await page.getByLabel("Event", { exact: true }).selectOption(ids[sport]);
}
const start = (page) =>
  page.getByRole("button", { name: "Run diagnostic" }).click();
async function finish(page) {
  await page.getByText("Diagnostic complete.", { exact: true }).waitFor();
  return page.getByRole("region", { name: "Tester evidence" }).innerText();
}
function clean(f, text) {
  for (const sentinel of [
    uid,
    otherUid,
    token,
    otherToken,
    privateError,
    "fixture-private-refresh-token",
  ]) {
    assert.ok(
      !text.includes(sentinel),
      "sensitive fixture data must not render",
    );
    assert.ok(
      !f.logs.some((line) => line.includes(sentinel)),
      "sensitive fixture data must not log",
    );
  }
  assert.equal(
    f.counts().rawReads,
    0,
    "diagnostic must never read raw observations",
  );
  assert.equal(
    f.counts().membershipReads,
    0,
    "diagnostic must never use the membership shortcut",
  );
}

try {
  {
    const f = await fixture("signed-out");
    await f.page.getByRole("button", { name: "Load games" }).click();
    await f.page
      .getByText("Sign in to run the diagnostic.", { exact: true })
      .waitFor();
    assert.deepEqual(f.eligibility, []);
    assert.deepEqual(f.calls, []);
    assert.equal(f.counts().schedules, 0);
    clean(f, "");
    await f.ctx.close();
  }
  {
    const f = await fixture("disabled");
    await select(f.page);
    for (const mode of ["disabled", "revoked"]) {
      f.setMode(mode);
      const count = f.calls.length;
      await start(f.page);
      const text = await finish(f.page);
      assert.match(text, /fear eligibility: false/);
      assert.match(text, /research eligibility: false/);
      assert.match(text, /fear quotes: denied/);
      assert.match(text, /research quotes: denied/);
      assert.doesNotMatch(text, /paginated history/);
      assert.deepEqual(
        f.calls.slice(count).map(({ p_section }) => p_section),
        ["quotes", "quotes"],
      );
      clean(f, text);
    }
    await f.ctx.close();
  }
  {
    const f = await fixture("enabled");
    for (const sport of ["nfl", "nba"]) {
      await select(f.page, sport);
      const count = f.calls.length;
      await start(f.page);
      const text = await finish(f.page);
      assert.match(text, /fear eligibility: true/);
      assert.match(text, /research eligibility: true/);
      assert.match(text, /fear invalid context scope: invalid scope/);
      assert.match(text, /fear injuries: 1 rows/);
      assert.match(text, /research injuries: 1 rows/);
      assert.match(text, /251 unique quote rows/);
      assert.match(text, /More than one page of unique rows/);
      assert.equal(
        f.calls
          .slice(count)
          .filter(
            (x) => x.p_feature === "research" && x.p_section === "context",
          ).length,
        sport === "nfl" ? 1 : 0,
      );
      clean(f, text);
    }
    f.setMode("partial");
    await start(f.page);
    const text = await finish(f.page);
    assert.match(text, /250 unique quote rows/);
    assert.match(text, /Quote coverage partial/);
    clean(f, text);
    await f.ctx.close();
  }
  {
    const f = await fixture("delayed");
    await select(f.page);
    await start(f.page);
    await f.pending;
    const stopped = f.page.waitForEvent("requestfailed", (request) =>
      request.url().endsWith("/tester_observation_page"),
    );
    await f.page.evaluate(
      ({ storage, otherUid, otherToken }) => {
        const session = JSON.parse(localStorage.getItem(storage));
        session.user.id = otherUid;
        session.access_token = otherToken;
        localStorage.setItem(storage, JSON.stringify(session));
        const channel = new BroadcastChannel(storage);
        channel.postMessage({ event: "SIGNED_IN", session });
        channel.close();
      },
      { storage, otherUid, otherToken },
    );
    await stopped;
    f.release();
    await f.page.getByRole("button", { name: "Load games" }).waitFor();
    assert.equal(
      await f.page.getByRole("region", { name: "Tester evidence" }).count(),
      0,
    );
    await select(f.page);
    await start(f.page);
    const text = await finish(f.page);
    assert.match(text, /fear eligibility: false/);
    assert.match(text, /fear quotes: denied/);
    assert.doesNotMatch(text, /paginated history/);
    clean(f, text);
    await f.ctx.close();
  }
  {
    const f = await fixture("delayed");
    await select(f.page);
    await start(f.page);
    await f.pending;
    await f.page.getByRole("button", { name: "Cancel read" }).click();
    f.release();
    await f.page
      .getByText("Read cancelled. Evidence cleared.", { exact: true })
      .waitFor();
    assert.equal(
      await f.page.getByRole("region", { name: "Tester evidence" }).count(),
      0,
    );
    clean(f, "");
    await f.ctx.close();
  }
  console.log(
    "PASS preview-only tester diagnostic with synthetic signed-out, disabled, revoked, canary, invalid scope, exact pagination, partial and cancellation evidence",
  );
} finally {
  await browser.close();
}

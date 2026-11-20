// Synthetic caller/transport only: no live authentication or writes.
// Run against loopback consumer-enabled build with synthetic.supabase.co config.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const axePath =
  process.env.AXE_CORE_PATH || require.resolve("axe-core/axe.min.js");
const base = new URL(process.env.CONSUMER_TEST_URL || "http://127.0.0.1:3201");
assert(
  ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname),
  "Loopback only",
);
const out = process.env.CONSUMER_AUDIT_OUTPUT || "/tmp/consumer-zone-signed-in";
await fs.mkdir(out, { recursive: true });
const report = {
  scope:
    "Synthetic signed-in compact Zone and expanded NBA sheet rendering. No real permissions, social mutations, production data, real chart download or screen-reader certification.",
  cases: [],
  failures: [],
  blockedRequests: [],
  diagnostics: [],
  browserErrors: [],
};
const uid = "00000000-0000-4000-8000-000000000001";
const postId = "00000000-0000-4000-8000-000000000002";
const author = "00000000-0000-4000-8000-000000000003";
const fullMarker = "SYNTHETIC COMPLETE SOURCE DETAIL";
const post = {
  id: postId,
  user_id: author,
  author_name: "SyntheticDealer",
  sport: "nba",
  kind: "talk",
  title: "NBA Matchup Cheat Sheet · Sample Visitors @ Sample Hosts",
  body: `${"Synthetic example only. ".repeat(20)}\n${fullMarker}\nhttps://www.espn.com/nba/game/_/gameId/123456789`,
  legs: [],
  card: "vq-publication:v1",
  created_at: "2026-11-16T12:00:00Z",
  stake: null,
  reactions: 0,
  reacted: false,
  following: false,
  comments: 0,
  photo_path: null,
};
// Synthetic JPEG follows the existing avatar data-URL constraint; never a real person.
const syntheticAvatar =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAgACADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDhqKKKzPOCiiigAooooAKKKKAP/9k=";
const completedProfile = {
  username: "SyntheticMember",
  avatar: syntheticAvatar,
};
const session = {
  access_token: "synthetic-zone-token",
  refresh_token: "synthetic-zone-refresh",
  token_type: "bearer",
  expires_in: 86400,
  expires_at: Math.floor(Date.now() / 1000) + 86400,
  user: {
    id: uid,
    aud: "authenticated",
    role: "authenticated",
    email: "synthetic@example.invalid",
    app_metadata: {},
    user_metadata: { vq_welcome_version: 1 },
    created_at: "2026-11-16T12:00:00Z",
  },
};
const version = (
  await fs.readFile("src/components/app-refresh-notice.tsx", "utf8")
).match(/const VERSION = "([^"]+)"/)[1];
let browser, activePage, activeWidth;
try {
  browser = await chromium.launch(
    process.env.PLAYWRIGHT_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
      : {},
  );
  for (const width of [360, 390, 768, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    // Route handlers never connect these sockets to a server. REST interception alone
    // does not stop Supabase realtime WebSocket transport.
    await context.routeWebSocket("**/*", (socket) => {
      report.blockedRequests.push({
        width,
        method: "WEBSOCKET",
        destination: socket.url(),
      });
      socket.close({
        code: 1000,
        reason: "Synthetic test: external transport disabled",
      });
    });
    await context.addInitScript(
      ({ session, version }) => {
        localStorage.setItem(
          "sb-synthetic-auth-token",
          JSON.stringify(session),
        );
        localStorage.setItem("vq-app-refresh:" + session.user.id, version);
        sessionStorage.setItem("vq-prompt-shown", "fixture");
      },
      { session, version },
    );
    let chartReads = 0,
      feedReads = 0;
    await context.route("**/*", async (route) => {
      const req = route.request(),
        u = new URL(req.url()),
        path = u.pathname;
      const json = (body) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "*",
            "access-control-allow-methods": "GET,POST,OPTIONS",
          },
          body: JSON.stringify(body),
        });
      if (u.origin === base.origin && ["GET", "HEAD"].includes(req.method())) {
        if (path === `/api/nba/matchup-sheet/${postId}`) {
          assert.equal(
            req.headers().authorization,
            "Bearer synthetic-zone-token",
            "Original sheet renderer must attach the synthetic caller token",
          );
          chartReads++;
          return json({
            title: "Sample Visitors at Sample Hosts",
            summary: "Synthetic chart only",
            sources: [],
            svg: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#08120f"/><text x="40" y="80" fill="#ffffff">SYNTHETIC CHART ONLY</text></svg>',
          });
        }
        if (!path.startsWith("/api/")) return route.continue();
      }
      if (u.origin === "https://synthetic.supabase.co") {
        if (req.method() === "OPTIONS") return json({});
        if (path === "/auth/v1/user" && req.method() === "GET")
          return json(session.user);
        // Only named read RPCs are fulfilled; mutations/unknown RPCs never reach a server.
        const rpc = path.startsWith("/rest/v1/rpc/")
          ? path.split("/").at(-1)
          : null;
        if (rpc === "community_feed" || rpc === "community_dealer_feed") {
          feedReads++;
          return json([post]);
        }
        if (rpc === "community_post")
          return json(req.postDataJSON().p_id === postId ? post : null);
        if (rpc === "community_avatars")
          return json([
            {
              user_id: author,
              username: "SyntheticDealer",
              avatar: null,
              staff: false,
            },
          ]);
        if (rpc === "age_verification_status")
          return json({ required: true, verified: true });
        if (rpc === "membership_status") return json({ allowed: true });
        if (["is_admin", "tester_feature_access"].includes(rpc))
          return json(false);
        if (rpc === "frank_anniversary") return json({ state: "hidden" });
        if (
          [
            "community_activity",
            "community_comments",
            "ruby_card_comment_counts",
            "notification_counts",
            "notification_pulse",
          ].includes(rpc)
        )
          return json([]);
        if (path.startsWith("/rest/v1/") && !rpc && req.method() === "GET")
          return json(
            path.endsWith("/community_profiles") ? completedProfile : [],
          );
      }
      report.blockedRequests.push({
        width,
        method: req.method(),
        destination: u.origin + path,
      });
      return route.abort();
    });
    const page = await context.newPage();
    activePage = page;
    activeWidth = width;
    page.on("pageerror", (error) =>
      report.browserErrors.push({ width, error: error.message }),
    );
    page.on("console", (message) => {
      if (message.type() === "error")
        report.browserErrors.push({ width, error: message.text() });
    });
    const diagnostic = async (stage) => {
      report.diagnostics.push({
        stage,
        width,
        ...(await page.evaluate(() => ({
          url: location.href,
          inputs: [...document.querySelectorAll('input[type="search"]')].map(
            (e) => ({ value: e.value, outerHTML: e.outerHTML }),
          ),
          status: [
            ...document.querySelectorAll('.zone2-scope,[role="status"]'),
          ].map((e) => e.textContent),
          posts: [...document.querySelectorAll(".zone-post")].map((e) => ({
            id: e.id,
            title: e.querySelector("h2")?.textContent,
          })),
          events: window.__zoneTestEvents || [],
        }))),
      });
    };
    const audit = async (state) => {
      await page.addScriptTag({ path: axePath });
      const axe = await page.evaluate(async () =>
        window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        }),
      );
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      );
      report.cases.push({
        state,
        width,
        overflow,
        violations: axe.violations,
        incomplete: axe.incomplete,
      });
      if (overflow || axe.violations.length)
        report.failures.push(
          `${state}@${width}: overflow=${overflow}, axe violations=${axe.violations.length}`,
        );
      await page.screenshot({
        path: `${out}/${state}-${width}.png`,
        fullPage: true,
      });
    };
    await page.goto(base.origin + "/community", { waitUntil: "networkidle" });
    await page.locator(".zone2-experience").waitFor();
    const item = page.locator(`#post-${postId}`);
    const compact = item.locator(".zone2-publication");
    await compact.waitFor();
    assert(
      feedReads > 0,
      "Real feed component must read synthetic caller feed",
    );
    // The stat sheet shows inline and loads on its own once the post is near the screen: no tap.
    assert.equal(
      await compact.getByText("Full research, charts and downloads").count(),
      0,
    );
    assert.equal(
      await compact.locator("time").getAttribute("datetime"),
      post.created_at,
    );
    const reference = compact.getByRole("link", {
      name: "Original publication",
      exact: true,
    });
    assert.equal(
      await reference.getAttribute("href"),
      `/community?post=${postId}#post-${postId}`,
    );
    const search = page.getByRole("searchbox", {
      name: "Search loaded content",
    });
    // An incomplete fixture profile legitimately opens a focus-trapping setup dialog.
    // Do not dismiss or disable that production behavior to make this test pass.
    await page
      .locator('.profile-setup-dialog[data-profile-required="false"]')
      .waitFor({ state: "attached" });
    assert.equal(
      await page.locator(".profile-setup-dialog[open]").count(),
      0,
      "Complete fixture profile must not require setup",
    );
    assert.equal(
      await page.locator("dialog[open]").count(),
      0,
      "Search must not run behind a focus-trapping modal",
    );
    // Feed choices are native toggle filters, not tabs containing an action.
    const feedFilters = page.getByRole("group", { name: "Feed", exact: true });
    assert.equal(await feedFilters.getByRole("button").count(), 4);
    assert.equal(await feedFilters.locator('[aria-pressed="true"]').count(), 1);
    await feedFilters.locator("button.zone-refresh:not(:disabled)").waitFor();
    await feedFilters.getByRole("button", { name: "Community", exact: true }).focus();
    for (const [index, name] of ["Community", "Following", "Dealer only", "Refresh"].entries()) {
      const control = feedFilters.getByRole("button", { name, exact: true });
      if (index > 0) await page.keyboard.press("Tab");
      assert(await control.evaluate((el) => el === document.activeElement));
    }
    assert.equal(await page.getByRole("group", { name: "Sport", exact: true }).count(), 1);
    await diagnostic("before-search");
    assert.equal(
      new URL(page.url()).searchParams.get("post"),
      null,
      "Search audit must not be in the intentional deep-link filter bypass",
    );
    assert.equal(new URL(page.url()).searchParams.get("ruby"), null);
    assert.equal(await search.count(), 1);
    await page.evaluate(() => {
      window.__zoneTestEvents = [];
      for (const name of ["input", "change"])
        document.addEventListener(
          name,
          (e) => {
            if (
              e.target instanceof HTMLInputElement &&
              e.target.type === "search"
            )
              window.__zoneTestEvents.push({
                type: e.type,
                value: e.target.value,
                trusted: e.isTrusted,
              });
          },
          true,
        );
    });
    await search.fill("NO SUCH SYNTHETIC PUBLICATION");
    assert.equal(
      await search.inputValue(),
      "NO SUCH SYNTHETIC PUBLICATION",
      "Search must receive the intended input before asserting filtering",
    );
    await diagnostic("after-search-fill");
    try {
      await item.waitFor({ state: "hidden" });
    } catch (error) {
      await diagnostic("search-timeout");
      throw error;
    }
    await search.fill("");
    await item.waitFor();
    await audit("compact-signed-in");
    await compact.locator(".zone2-full-research").waitFor();
    const preview = item.locator(".zone-sheet-preview");
    await preview.scrollIntoViewIfNeeded();
    const image = preview.locator("img");
    await image.waitFor();
    await image.evaluate((img) => img.decode());
    assert(chartReads > 0, "Inline original renderer must load mocked sheet on its own");
    assert.equal(
      await preview.getAttribute("href"),
      `/nba/matchup-sheet/${postId}`,
    );
    const sources = item.getByText("Original research and sources", {
      exact: true,
    });
    await sources.focus();
    await page.keyboard.press("Enter");
    await item
      .getByText(fullMarker, { exact: false })
      .waitFor({ state: "visible" });
    await audit("expanded-signed-in");
    await context.close();
  }
} catch (error) {
  report.failures.push(error.stack || String(error));
  if (activePage && !activePage.isClosed()) {
    await activePage
      .screenshot({ path: `${out}/failure-${activeWidth}.png`, fullPage: true })
      .catch(() => {});
    await fs
      .writeFile(
        `${out}/failure-${activeWidth}.html`,
        await activePage.content(),
      )
      .catch(() => {});
  }
} finally {
  await browser?.close();
  await fs.writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
}
console.log(
  JSON.stringify(
    {
      cases: report.cases.length,
      failures: report.failures,
      report: `${out}/report.json`,
    },
    null,
    2,
  ),
);
if (report.failures.length) process.exitCode = 1;

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE,
  headless: true,
  args: ["--no-sandbox"],
});
const base = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100",
  uid = "00000000-0000-4000-8000-000000000001";
const version = readFileSync(
  "src/components/app-refresh-notice.tsx",
  "utf8",
).match(/const VERSION = "([^"]+)"/)[1];
const posts = ["nfl", "nba", "nhl", "ncaab"].map((sport, i) => ({
  id: `00000000-0000-4000-8000-00000000000${i + 3}`,
  user_id: uid,
  author_name: "MikeQ",
  sport,
  kind: "talk",
  title: `${sport.toUpperCase()} stored selection`,
  body: `Fixture player Over 6.5 (+124)\n\n${"Original analysis with source timestamps. ".repeat(20)}\n\nRisk: uncertain role.\n\nUnknowns: verify updates.\n\nhttps://example.com/${"W".repeat(100)}`,
  legs: ["Fixture player Over 6.5 (+124)"],
  card: "vq-publication:v1",
  created_at: "2026-10-31T16:00:00Z",
  stake: null,
  reactions: 2,
  comments: 1,
  following: false,
  reacted: false,
  photo_path: null,
}));
posts.push(
  {
    ...posts[0],
    id: "manual",
    title: "Manual owner post",
    body: "Cash it",
    card: null,
    legs: [],
  },
  {
    ...posts[1],
    id: "threes",
    title: "3-point volume",
    card: "nba-threes:2026-10-31",
    legs: [],
    body: "Research only, not picks",
  },
);
try {
  for (const width of [390, 1280]) {
    const ctx = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
      acceptDownloads: true,
    });
    await ctx.addInitScript(
      ({ uid, version }) => {
        sessionStorage.setItem("vq-prompt-shown", "fixture");
        localStorage.setItem("vq-app-refresh:" + uid, version);
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
        window.fixtureCopies = [];
        Object.defineProperty(navigator, "clipboard", {
          value: {
            writeText: async (text) => {
              window.fixtureCopies.push(text);
            },
          },
        });
      },
      { uid, version },
    );
    await ctx.route("**/rest/v1/rpc/community_feed", (r) => {
      const p = JSON.parse(r.request().postData() || "{}");
      return r.fulfill({
        json: posts.filter((x) => p.p_sport === "all" || p.p_sport === x.sport),
      });
    });
    await ctx.route("**/rest/v1/rpc/frank_anniversary", (r) =>
      r.fulfill({ json: { state: "hidden" } }),
    );
    const p = await ctx.newPage(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(base + "/community", { waitUntil: "networkidle" });
    await p.locator(".zone-publication").first().waitFor();
    await p.evaluate(() => document.fonts.ready);
    assert.equal(await p.locator(".zone-publication").count(), 4);
    for (const [sport, color] of [
      ["nfl", "#7db8ff"],
      ["nba", "#e8ca7d"],
      ["nhl", "#ff858e"],
      ["ncaab", "#74d6a4"],
    ]) {
      const card = p.locator(`.zone-publication[data-sport=${sport}]`);
      assert.equal(
        await card.locator(".publication-headline").getAttribute("fill"),
        color,
      );
      await card
        .getByRole("button", { name: "Copy picks", exact: true })
        .click();
      assert.equal(
        await p.evaluate(() => window.fixtureCopies.at(-1)),
        `${sport.toUpperCase()} stored selection\n${posts[0].legs[0]}`,
      );
      const lines = [];
      for (;;) {
        lines.push(
          ...(await card.locator("svg text[font-size='32']").allTextContents()),
        );
        const bounded = await card.locator("svg text").evaluateAll((es) =>
          es.every((e) => {
            const b = e.getBBox();
            return b.x >= 27 && b.x + b.width <= 1054 && b.y + b.height <= 1322;
          }),
        );
        assert.ok(bounded, `${sport} text within frame`);
        const next = card.getByRole("button", {
          name: "Next card",
          exact: true,
        });
        if (await next.isDisabled()) break;
        await next.click();
      }
      assert.equal(
        lines.join("").replace(/\s/g, ""),
        posts[0].body.replace(/\s/g, ""),
      );
    }
    const first = p.locator(".zone-publication[data-sport=nfl]");
    const dl = p.waitForEvent("download");
    await first.getByRole("button", { name: /Download card/ }).click();
    const file = await (await dl).path(),
      bytes = readFileSync(file);
    assert.equal(bytes.readUInt32BE(16), 1080);
    assert.equal(bytes.readUInt32BE(20), 1350);
    await first
      .getByRole("button", { name: "Open with Gambly ↗", exact: true })
      .click();
    const dialog = p
      .getByRole("dialog")
      .filter({ hasText: "Copy here. Paste in Gambly." });
    assert.equal(
      await dialog.locator("a[href='https://gambly.com']").count(),
      0,
    );
    await dialog.getByRole("checkbox").check();
    await dialog
      .getByRole("button", { name: "Copy pick to clipboard", exact: true })
      .click();
    await dialog.locator("a[href='https://gambly.com']").waitFor();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await p.locator("#post-manual .zone-publication").count(), 0);
    assert.equal(
      await p.locator("#post-threes img").getAttribute("src"),
      "/api/nba/threes-card/2026-10-31",
    );
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    assert.deepEqual(errors, []);
    await ctx.close();
    console.log(
      `PASS publication cards ${width}px: four sport colors, full paginated content, bounded text, copy, 1080x1350 download, Gambly age gate and unchanged manual/threes`,
    );
  }
} finally {
  await browser.close();
}

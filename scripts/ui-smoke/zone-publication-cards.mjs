import assert from "node:assert/strict";
import sharp from "sharp";
// This fixture tests a loaded daily card; failure/retry has dedicated acceptance.
const threesPng = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: "#07090d" } }).png().toBuffer();
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
    created_at: "2026-10-30T16:00:00Z",
    title: "Manual owner post",
    body: "Cash it",
    card: null,
    legs: [],
  },
  {
    ...posts[1],
    id: "threes",
    created_at: "2026-10-30T16:00:00Z",
    title: "3-point volume",
    card: "nba-threes:2026-10-31",
    legs: [],
    body: "Research only, not picks",
  },
);
const memberLegs = Array.from({length: 7}, (_, i) => `Member Player ${i + 1} 40+ rushing yards`);
posts.push({
  ...posts[0], id: "member-parlay", title: "My parlay", kind: "slip", card: null,
  created_at: "2026-10-31T15:00:00Z", legs: memberLegs, body: "Member-created combination.",
});
const sheetPost = {
  ...posts[1],
  id: "5937fd42-e301-4fd5-92b6-abbe3f0d3de0",
  title: "NBA Matchup Cheat Sheet · New York Knicks @ Cleveland Cavaliers",
  body: [
    "Nov 7 · 8:00 PM ET · Rocket Arena",
    "",
    "FANDUEL SNAPSHOTS",
    "Spread · Cleveland Cavaliers +4.5 (-104) | New York Knicks -4.5 (-118) · 9:31 AM ET",
    "Total · Over 224.5 (-104) | Under 224.5 (-118) · 9:31 AM ET",
    "",
    "https://vegasquant.app/nba/games/ny-cle-20261107",
  ].join("\n"),
  legs: [],
  created_at: "2026-10-29T17:00:00Z",
};
const fixtureSheetSvg = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1290" viewBox="0 0 1200 1290">',
  '<rect width="1200" height="1290" fill="#08120f"/>',
  '<g fill="#a3f4c4" font-family="Arial" font-size="48">',
  '<text x="64" y="106">NBA MATCHUP CHEAT SHEET</text>',
  '<text x="64" y="390">Team form</text>',
  '<text x="64" y="695">Player research</text>',
  '<text x="64" y="1180">Official availability</text>',
  '</g></svg>',
].join("");
posts.push(sheetPost);
try {
  for (const width of [360, 390, 1280]) {
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
    await ctx.route("**/rest/v1/community_profiles**", r => {
      const profile = { user_id: uid, username: "SampleMember", display_name: "Sample member", avatar: "/icons/icon-192.png", region: "Sample", visible: true };
      return r.fulfill({ json: (r.request().headers()["accept"] || "").includes("vnd.pgrst.object") ? profile : [profile] });
    });
    await ctx.route("**/rest/v1/rpc/community_feed", (r) => {
      const p = JSON.parse(r.request().postData() || "{}");
      return r.fulfill({
        json: posts.filter((x) => p.p_sport === "all" || p.p_sport === x.sport),
      });
    });
    await ctx.route("**/rest/v1/rpc/frank_anniversary", (r) =>
      r.fulfill({ json: { state: "hidden" } }),
    );
    let sheetReads = 0, allowSheet = true;
    await ctx.route(`**/api/nba/matchup-sheet/${sheetPost.id}`, (r) => {
      sheetReads++;
      assert.equal(r.request().headers().authorization, "Bearer smoke");
      if (!allowSheet) return r.fulfill({status: 403, json: {error: "Research access is required for the full matchup sheet."}});
      return r.fulfill({json: {
        title: "New York Knicks at Cleveland Cavaliers",
        summary: "Cleveland had not submitted.",
        sources: [{label:"NBA injury report",href:"https://official.nba.com/"}],
        svg: fixtureSheetSvg,
      }});
    });
    await ctx.route("**/api/nba/threes-card/**", r => r.fulfill({ contentType: "image/png", body: threesPng }));
    const p = await ctx.newPage(),
      errors = [];
    p.on("console", (m) => {
      if (m.text().includes("card export failed")) console.log(m.text());
    });
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(base + "/community", { waitUntil: "networkidle" });
    await p.locator(".zone-publication").first().waitFor();
    await p.evaluate(() => document.fonts.ready);
    await p.locator(".vq-brand-opening").waitFor({ state: "hidden" });
    assert.equal(await p.locator(".zone-publication").count(), 4);
    assert.equal(sheetReads, 0, "offscreen matchup sheets must load lazily");
    if (process.env.UI_SMOKE_NEGATIVE === "card-palette")
      await p.locator('.zone-publication .publication-headline').first().evaluate(e => e.setAttribute('fill', '#ff858e'));
    const out = process.env.UI_ARTIFACT_DIR || "artifacts/sports-zone-design";
    mkdirSync(out, { recursive: true });
    await p.screenshot({ path: `${out}/${width}-zone.png` });
    const selected = p.locator('.sports-rail > a[aria-current="page"]');
    assert.equal(await selected.count(), 0, "Zone must not select NFL by default");
    for (const link of await p.locator('.sports-rail > a').all()) {
      const box = await link.boundingBox();
      assert.ok(box && box.height >= 44, "sport navigation touch height");
    }
    const colors = { green: "#8fdbb1", gold: "#f1d58e", black: "#d7c393" };
    for (const sport of ["nfl", "nba", "nhl", "ncaab"]) {
      const card = p.locator(`.zone-publication[data-sport=${sport}]`);
      assert.equal(
        await card.locator(".publication-headline").getAttribute("fill"),
        colors[await card.getAttribute("data-palette")],
        "publication palette must match approved lounge design",
      );
      await card
        .getByRole("button", { name: "Copy picks", exact: true })
        .click();
      assert.equal(
        await p.evaluate(() => window.fixtureCopies.at(-1)),
        `${sport.toUpperCase()} stored selection\n${posts[0].legs[0]}`,
      );
      assert.ok((await card.locator('svg').boundingBox()).width * 56 / 1080 >= 14, "analysis must remain readable at phone scale");
      await card.scrollIntoViewIfNeeded();
      await p.screenshot({ path: `${out}/${width}-${sport}-card.png` });
      const geometry = await card.locator('svg').evaluate(svg => {
        const divider = svg.querySelector(':scope > path');
        const body = svg.querySelector('text[font-size="56"]');
        return { divider: divider.getBBox().y, body: body.getBBox().y };
      });
      assert.ok(geometry.divider < geometry.body, "divider must not strike through analysis");
      const lines = await card.locator("svg text[font-size='56']").allTextContents();
      const columns = await card.locator("svg text[font-size='56']").evaluateAll(
        (rows) => [...new Set(rows.map((row) => Number(row.getAttribute("x"))))],
      );
      assert.deepEqual(columns, [74, 554], "long Dealer analysis reads down two columns");
      const overflow = await card.locator("svg text").evaluateAll((elements) =>
        elements.filter((e) => e.textContent.trim()).flatMap((e) => {
          const b = e.getBBox();
          return b.x >= 27 && b.x + b.width <= 1054 &&
            b.y + b.height <= e.ownerSVGElement.viewBox.baseVal.height - 28 ? [] : [e.textContent];
        }),
      );
      assert.deepEqual(overflow, [], `${sport} text within frame`);
      assert.equal(await card.getByRole("button", {name: "Next card", exact: true}).count(), 0);
      assert.equal(
        lines.join("").replace(/\s/g, ""),
        posts[0].body.replace(/\s/g, ""),
      );
    }
    const first = p.locator(".zone-publication[data-sport=nfl]");
    await first.getByRole("button", { name: /Download card/ }).click();
    const save = first.getByRole("link", { name: /Save image/ });
    await save.waitFor();
    const dl = p.waitForEvent("download");
    await save.click();
    const file = await (await dl).path(),
      bytes = readFileSync(file);
    assert.equal(bytes.readUInt32BE(16), 1080);
    const expectedHeight = await first.locator("svg").evaluate((svg) => svg.viewBox.baseVal.height);
    assert.equal(bytes.readUInt32BE(20), expectedHeight);
    assert.ok(expectedHeight > 1350, "long analysis extends the same image");
    const parlay = p.locator("#post-member-parlay .community-parlay-card");
    assert.equal(await parlay.locator(".vqc").count(), 1);
    assert.equal(await parlay.locator(".vqc-legs li").count(), memberLegs.length);
    assert.match(await parlay.locator(".vqc-legs").innerText(), /Member Player 7/);
    assert.equal(await parlay.getByRole("button", { name: "Next", exact: true }).count(), 0);
    assert.match(await parlay.locator(".vqc").getAttribute("data-palette"), /^(green|gold|black)$/);
    await parlay.getByRole("button", { name: "Download card", exact: true }).click();
    const memberImage = parlay.getByRole("img", { name: "My parlay card" });
    await memberImage.waitFor();
    await memberImage.evaluate((img) => img.decode());
    assert.ok(await memberImage.evaluate((img) => img.naturalHeight > 1512));
    await parlay.locator(".vqc").screenshot({ path: `${out}/${width}-seven-leg-parlay.png` });
    writeFileSync(`${out}/${width}-downloaded-card.png`, bytes);
    await first.locator("svg").screenshot({ path: `${out}/${width}-matching-feed-card.png` });
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
    await p.locator("#post-threes .zone-card img").scrollIntoViewIfNeeded();
    await p.waitForFunction(() => { const img = document.querySelector("#post-threes .zone-card img"); return img?.complete && img.naturalWidth === 1080; });
    assert.equal(
      await p.locator("#post-threes .zone-card img").getAttribute("src"),
      "/api/nba/threes-card/2026-10-31",
    );
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    const sheet = p.locator(`#post-${sheetPost.id}`);
    assert.equal(await sheet.locator(".zone-publication").count(), 0);
    const preview = sheet.getByRole("link", { name: "Open matchup cheat sheet" });
    await preview.scrollIntoViewIfNeeded();
    const inlineSheet = preview.getByRole("img", {
      name: "Vegas Quant matchup cheat sheet for New York Knicks at Cleveland Cavaliers",
    });
    await inlineSheet.waitFor();
    await inlineSheet.evaluate((image) => image.decode());
    assert.equal(sheetReads, 1, "the sheet must load before opening the post");
    assert.equal(
      await inlineSheet.evaluate(async (image) => (await fetch(image.src)).text()),
      fixtureSheetSvg,
      "the feed must display the complete sheet returned by the protected endpoint",
    );
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await preview.screenshot({ path: `${out}/${width}-matchup-preview.png` });
    await preview.click();
    const board = p.locator(".nba-sheet-scroll img");
    await board.waitFor();
    assert.equal(
      await board.evaluate(async (image) => (await fetch(image.src)).text()),
      fixtureSheetSvg,
    );
    await p.getByRole("link", {name:"NBA injury report ↗"}).waitFor();
    assert.equal(await p.getByRole("link", {name:"NBA injury report ↗"}).getAttribute("href"), "https://official.nba.com/");
    await p.getByRole("button", {name:"Zoom to read"}).click();
    assert.ok((await board.boundingBox()).width >= 1200);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const sheetDownload = p.waitForEvent("download");
    await p.getByRole("link", {name:"Download PNG"}).click();
    const sheetBytes = readFileSync(await (await sheetDownload).path());
    assert.equal(sheetBytes.readUInt32BE(16), 2400);
    assert.equal(sheetBytes.readUInt32BE(20), 2580);
    await p.screenshot({ path: `${out}/${width}-matchup-sheet.png` });
    if (width === 390) {
      allowSheet = false;
      await p.goto(base + "/community", { waitUntil: "networkidle" });
      await preview.scrollIntoViewIfNeeded();
      await preview.getByText("Sheet unavailable in the feed.").waitFor();
      assert.equal(await preview.locator("img").count(), 0);
      assert.equal(await preview.getAttribute("href"), `/nba/matchup-sheet/${sheetPost.id}`);
    }
    assert.deepEqual(errors, []);
    await ctx.close();
    console.log(
      `PASS publication cards ${width}px: labelled sports with restrained accents, full single-card content, bounded text, copy, matching single-image download, Gambly age gate, inline matchup sheet, and unchanged manual/threes`,
    );
  }
} finally {
  await browser.close();
}

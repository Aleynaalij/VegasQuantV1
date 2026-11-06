// Synthetic incoming source-link acceptance. No real post, external account or trade.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const uid = "00000000-0000-0000-0000-000000000001";
const canonical =
  "https://kalshi.com/markets/kxmvecrosscategory/combo/sample-combo?marketTicker=SYNTHETIC-YES";
const out = process.argv[2] || "/tmp/kalshi-source-evidence";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
    : {},
);
try {
  for (const width of [390, 1280]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    let mine = null;
    let lost = true;
    const submissions = [];
    let outbound = 0;
    let photoMode = false; let photoDeletes = 0;
    await ctx.addInitScript((uid) => {
      sessionStorage.setItem("vq-prompt-shown", "fixture");
      localStorage.setItem(`vq-app-refresh:${uid}`, "gold-2026-10-22-v2");
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
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value) => {
            window.__copied = value;
          },
        },
      });
    }, uid);
    await ctx.route("https://kalshi.com/**", (r) => {
      outbound++;
      return r.fulfill({
        contentType: "text/html",
        body: "<title>Synthetic Kalshi destination</title><p>No trading occurs.</p>",
      });
    });
    await ctx.route("**/api/community/photo?*", r => r.fulfill({json:{path: `${uid}/${new URL(r.request().url()).searchParams.get("post")}.jpg`}}));
    await ctx.route("**/storage/v1/**", r => {
      if(r.request().method()==="DELETE") photoDeletes++;
      return r.fulfill({json:{signedURL:"/synthetic-photo.jpg"}});
    });
    await ctx.route("**/rest/v1/**", async (r) => {
      const path = new URL(r.request().url()).pathname;
      if (path.endsWith("/rpc/ruby_home"))
        return r.fulfill({
          json: {
            user_id: uid,
            day: "2026-11-05",
            contributor: {
              user_id: uid,
              brand: "The GOAT",
              theme: "diamond",
              active: true,
            },
            submitted: mine?.id || null,
            submission_count: mine ? 1 : 0,
            admin: true,
            due: [],
          },
        });
      if (path.endsWith("/rpc/is_admin")) return r.fulfill({ json: true });
      if (path.endsWith("/ruby_cards"))
        return r.fulfill({
          json: (r.request().headers().accept || "").includes(
            "vnd.pgrst.object",
          )
            ? mine
            : mine
              ? [mine]
              : [],
        });
      if (path.endsWith("/rpc/submit_ruby_link")) {
        const p = r.request().postDataJSON();
        submissions.push(p);
        assert.equal(p.p_source_link, canonical);
        assert.deepEqual(p.p_legs, []);
        if(photoMode) assert.match(p.p_photo, /\.jpg$/); else assert.equal(p.p_photo, null);
        assert.equal(p.p_odds, null);
        mine = {
          id: p.p_id,
          user_id: uid,
          brand: "The GOAT",
          theme: "diamond",
          submission_day: "2026-11-05",
          sport: p.p_sport,
          title: p.p_title,
          legs: [],
          note: "",
          photo_path: p.p_photo,
          source_link: canonical,
          sportsbook: null,
          reported_odds: null,
          created_at: new Date().toISOString(),
          revision: 0,
        };
        if (lost) {
          lost = false;
          return r.fulfill({
            status: 503,
            json: { message: "Synthetic lost response after commit" },
          });
        }
        return r.fulfill({ json: p.p_id });
      }
      if (path.endsWith("/rpc/edit_ruby_link")) {
        const p = r.request().postDataJSON();
        assert.equal(p.p_source_link, canonical);
        assert.equal(p.p_expected, 0);
        mine = { ...mine, title: p.p_title, revision: 1 };
        return r.fulfill({ json: crypto.randomUUID() });
      }
      if (
        path.endsWith("/ruby_daily_features") ||
        path.endsWith("/rpc/ruby_record_summary")
      )
        return r.fulfill({ json: [] });
      return r.fallback();
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(base + "/", { waitUntil: "networkidle" });
    await page.evaluate(() =>
      document.querySelectorAll("dialog[open]").forEach((d) => d.close()),
    );
    await page.locator(".ruby-submit-drawer summary").click();
    await page
      .getByRole("button", { name: "Submit today’s lay", exact: true })
      .click();
    const modal = page.getByRole("dialog", { name: "Make your daily lay." });
    await modal
      .getByLabel("Paste Kalshi link")
      .fill("https://kalshi.com.evil.example/markets/x?marketTicker=bad");
    await modal.getByRole("button", { name: "Publish to The Zone" }).click();
    assert.equal(
      submissions.length,
      0,
      "unsafe host reached submission boundary",
    );
    await modal
      .getByLabel("Paste Kalshi link")
      .fill(canonical + "&utm_source=sample&action=buy#fragment");
    await modal
      .getByText(/Contributor-shared Kalshi link · Preview:/)
      .waitFor();
    assert.equal(submissions.length, 0, "pasting automatically published");
    assert.equal(outbound, 0, "pasting navigated externally");
    await modal.getByRole("button", { name: "Remove Kalshi link" }).click();
    assert.equal(await modal.getByLabel("Paste Kalshi link").inputValue(), "");
    await modal.getByLabel("Paste Kalshi link").fill(canonical);
    await modal.getByRole("button", { name: "Close submission" }).click();
    assert.equal(submissions.length, 0, "cancel published a post");
    await page
      .getByRole("button", { name: "Submit today’s lay", exact: true })
      .click();
    await modal.getByRole("button", { name: "Publish to The Zone" }).click();
    await modal.getByText("Synthetic lost response after commit").waitFor();
    await modal.getByRole("button", { name: "Publish to The Zone" }).click();
    await modal.waitFor({ state: "hidden" });
    assert.equal(submissions.length, 2);
    assert.equal(
      submissions[0].p_id,
      submissions[1].p_id,
      "lost-response retry changed id",
    );
    await page.goto(base + "/community?view=vip&ruby=" + mine.id, {
      waitUntil: "networkidle",
    });
    // Pin by immutable card ID: an admin edit deliberately changes its title.
    const card = page.locator(`article.ruby-card[id="ruby-${mine.id}"]`).first();
    await card
      .getByText("Contributor-shared Kalshi link", { exact: true })
      .waitFor();
    assert.equal(
      await card.locator(".ruby-gambly").count(),
      0,
      "link-only card has a misleading Gambly action",
    );
    await card.getByRole("button", { name: "Copy this lay" }).click();
    assert.match(
      await page.evaluate(() => window.__copied),
      /marketTicker=SYNTHETIC-YES/,
    );
    await card
      .getByRole("button", { name: "Open source on Kalshi ↗" })
      .click();
    assert.equal(
      await card.getByRole("link", { name: "Continue to Kalshi ↗" }).count(),
      0,
    );
    await card.getByRole("checkbox", { name: /I am 21/ }).check();
    const link = card.getByRole("link", { name: "Continue to Kalshi ↗" });
    assert.equal(await link.getAttribute("href"), canonical);
    assert.equal(await link.getAttribute("rel"), "noopener noreferrer");
    const next = ctx.waitForEvent("page");
    await link.click();
    const popup = await next;
    await popup.waitForLoadState();
    assert.equal(await popup.evaluate(() => window.opener), null);
    await popup.close();
    assert.equal(outbound, 1, "unexpected navigation count");
    await card.getByRole("button", { name: "Edit card", exact: true }).click();
    assert.equal(
      await card.locator("input[name=source_link]").inputValue(),
      canonical,
    );
    await card.locator("input[name=title]").fill("Source retained after edit");
    await card.getByRole("button", { name: "Save changes" }).click();
    await card
      .getByText("Source retained after edit", { exact: true })
      .waitFor();
    if (process.env.UI_SMOKE_NEGATIVE === "missing-source")
      await page.evaluate(() =>
        document
          .querySelectorAll(".ruby-source-link")
          .forEach((el) => el.remove()),
      );
    assert.ok(
      await page.locator(".ruby-source-link").count(),
      "link-only source disappeared from the card",
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "horizontal overflow",
    );
    // The launch overlay is intentionally noninteractive; wait for its normal dismissal so
    // the evidence shows the actual card, rather than the brief welcome animation.
    await page.locator(".vq-brand-opening").waitFor({ state: "detached" });
    await card.screenshot({ path: `${out}/${width}-card-detail.png` });
    await page.screenshot({
      path: `${out}/${width}-link-only-edited.png`,
      fullPage: true,
    });
    await page.goto(base + "/", { waitUntil: "networkidle" });
    await page.locator(".ruby-submit-drawer summary").click();
    await page.getByRole("button", { name: "Submit today’s lay", exact: true }).click();
    // Committed screenshot-plus-source insert with a lost response takes the stored-card recovery path.
    photoMode = true; lost = true;
    await modal.getByLabel("Paste Kalshi link").fill(canonical);
    await modal.locator('input[type=file]').setInputFiles({name:"synthetic.png",mimeType:"image/png",buffer:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=","base64")});
    await modal.getByRole("button", {name:"Publish to The Zone"}).click();
    await modal.waitFor({state:"hidden"});
    const recoveredId=submissions.at(-1).p_id;
    assert.ok(mine.photo_path, "recovery discarded stored image");
    assert.equal(photoDeletes,0,"recovery deleted stored image");
    await page.getByRole("button", {name:"Submit today’s lay",exact:true}).click();
    assert.equal(await modal.getByLabel("Paste Kalshi link").inputValue(),"","reopening retained old source");
    assert.equal(await modal.locator('input[type=file]').inputValue(),"","reopening retained old photo");
    // A fresh source-only submission must receive a new identifier.
    photoMode=false;
    await modal.getByLabel("Paste Kalshi link").fill(canonical);
    await modal.getByRole("button", {name:"Publish to The Zone"}).click();
    await modal.waitFor({state:"hidden"});
    assert.notEqual(submissions.at(-1).p_id,recoveredId,"reopening retained pending ID");
    await page.getByRole("button", {name:"Submit today’s lay",exact:true}).click();
    await modal.getByLabel("Paste Kalshi link").fill(canonical);
    const beforeSignOut = submissions.length;
    await page.evaluate(() => new BroadcastChannel("sb-127-auth-token").postMessage({ event: "SIGNED_OUT", session: null }));
    await modal.waitFor({ state: "hidden" });
    assert.equal(submissions.length, beforeSignOut, "account change submitted a draft");

    await ctx.close();
    console.log(
      `${width}px Kalshi source preview/remove/cancel/retry/card/copy/eligibility/open/edit passed`,
    );
  }
} finally {
  await browser.close();
}

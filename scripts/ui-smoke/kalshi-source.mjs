// Synthetic temporary-pause acceptance. No real post, external account or trade.
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
    ? {
        executablePath: process.env.PLAYWRIGHT_EXECUTABLE,
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
      }
    : {},
);
try {
  for (const width of [390, 1280]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    let mine = {
      id: "11111111-1111-4111-8111-111111111111",
      user_id: uid,
      brand: "The GOAT",
      theme: "diamond",
      submission_day: "2026-11-05",
      sport: "NFL",
      title: "Retained source-only lay",
      legs: [],
      note: "",
      photo_path: null,
      source_link: canonical,
      sportsbook: null,
      reported_odds: null,
      created_at: new Date().toISOString(),
      revision: 0,
    };
    let lost = true;
    const submissions = [];
    const hideCalls = [];
    const forbiddenRequests = [];
    let photoMode = false;
    let photoDeletes = 0;
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
    await ctx.route(
      /https?:\/\/[^/]*kalshi\.com\/|\/api\/kalshi(?:[/?]|$)|\/rpc\/[^/?]*kalshi/i,
      (r) => {
        forbiddenRequests.push(r.request().url());
        return r.fulfill({ status: 503, json: { code: "KALSHI_PAUSED" } });
      },
    );
    await ctx.route("**/api/community/photo?*", (r) =>
      r.fulfill({
        json: {
          path: `${uid}/${new URL(r.request().url()).searchParams.get("post")}.jpg`,
        },
      }),
    );
    await ctx.route("**/storage/v1/**", (r) => {
      if (r.request().method() === "DELETE") photoDeletes++;
      return r.fulfill({ json: { signedURL: "/synthetic-photo.jpg" } });
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
        forbiddenRequests.push(path);
        return r.fulfill({
          status: 503,
          json: { message: "Kalshi is temporarily unavailable." },
        });
      }
      if (path.endsWith("/rpc/submit_ruby")) {
        const p = r.request().postDataJSON();
        submissions.push(p);
        assert.equal(p.p_source_link, undefined);
        if (photoMode) assert.deepEqual(p.p_legs, []);
        else
          assert.deepEqual(p.p_legs, [
            "Sample A 20+ points",
            "Sample B 5+ rebounds",
          ]);
        if (photoMode) assert.match(p.p_photo, /\.jpg$/);
        else assert.equal(p.p_photo, null);
        assert.equal(p.p_odds, null);
        mine = {
          id: p.p_id,
          user_id: uid,
          brand: "The GOAT",
          theme: "diamond",
          submission_day: "2026-11-05",
          sport: p.p_sport,
          title: p.p_title,
          legs: p.p_legs,
          note: "",
          photo_path: p.p_photo,
          source_link: null,
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
      if (path.endsWith("/rpc/hide_ruby")) {
        const p = r.request().postDataJSON();
        hideCalls.push(p);
        assert.equal(p.p_submission, mine.id);
        mine = { ...mine, hidden: p.p_hidden };
        return r.fulfill({ json: null });
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
    const assertPaused = async () => {
      assert.equal(
        await page.locator('a[href*="kalshi.com"]').count(),
        0,
        "paused Kalshi outbound link present",
      );
      assert.equal(
        await page
          .getByRole("button", { name: /Kalshi|Copy shared source/i })
          .count(),
        0,
        "paused Kalshi action present",
      );
      assert.deepEqual(
        forbiddenRequests,
        [],
        "paused Kalshi made a network or matching RPC request",
      );
    };
    const assertRetained = async (card) => {
      await card.waitFor();
      assert.equal(
        await card
          .locator(".ruby-source-link p")
          .filter({ hasText: "Kalshi is temporarily unavailable." })
          .count(),
        1,
        "source-only card lost its unavailable explanation",
      );
      assert.ok(
        (await card.innerText()).includes(mine.title),
        "source-only card lost its title",
      );
      assert.equal(
        await card
          .locator(
            ".ruby-source-link a, .ruby-source-link button, .ruby-source-link input",
          )
          .count(),
        0,
      );
      assert.ok(
        !(await card.innerText()).includes(canonical),
        "paused source locator exposed",
      );
      await assertPaused();
    };
    const retainedId = mine.id;
    await page.goto(base + "/community?view=vip&ruby=" + retainedId, {
      waitUntil: "networkidle",
    });
    await page.evaluate(() =>
      document.querySelectorAll("dialog[open]").forEach((d) => d.close()),
    );
    const card = page
      .locator(`article.ruby-card[id="ruby-${retainedId}"]`)
      .first();
    await assertRetained(card);
    assert.equal(
      await card.locator(".ruby-gambly").count(),
      0,
      "source-only card has misleading Gambly action",
    );
    await card
      .getByRole("button", { name: "Copy this lay", exact: true })
      .click();
    const copied = await page.evaluate(() => window.__copied);
    assert.ok(copied.includes(retainedId), "internal card sharing lost");
    assert.ok(
      !/kalshi.com|marketTicker|SYNTHETIC-YES/.test(copied),
      "copy leaked paused source locator",
    );
    await card.getByRole("button", { name: "Edit card", exact: true }).click();
    assert.equal(
      await card.locator('input[name="source_link"]').count(),
      0,
      "admin source input still exposed",
    );
    await card
      .locator('input[name="title"]')
      .fill("Source retained after edit");
    await card.getByRole("button", { name: "Save changes" }).click();
    await card
      .getByText("Source retained after edit", { exact: true })
      .waitFor();
    assert.equal(
      mine.source_link,
      canonical,
      "admin edit erased stored source",
    );
    await assertRetained(card);
    await card
      .getByRole("button", { name: "Remove from The Zone", exact: true })
      .click();
    await card
      .getByRole("button", { name: "Restore to The Zone", exact: true })
      .click();
    // Click completion does not await the asynchronous RPC and refreshed card.
    await card
      .getByRole("button", { name: "Remove from The Zone", exact: true })
      .waitFor();
    assert.deepEqual(
      hideCalls.map((p) => p.p_hidden),
      [true, false],
    );
    assert.equal(mine.source_link, canonical, "hide/restore erased source");
    await page.screenshot({
      path: `${out}/${width}-retained-detail.png`,
      fullPage: true,
    });
    await page.goto(base + "/community", { waitUntil: "networkidle" });
    const zone = page.locator(`article.zone-lay[id="lay-${retainedId}"]`);
    await assertRetained(zone);
    assert.equal(
      await zone
        .getByRole("button", { name: /Copy shared source|Copy legs/ })
        .count(),
      0,
    );
    assert.ok(
      (
        await zone.getByRole("link", { name: /Full card/ }).getAttribute("href")
      ).includes(retainedId),
    );
    await page.screenshot({
      path: `${out}/${width}-retained-zone.png`,
      fullPage: true,
    });
    await zone.getByRole("link", { name: /Full card/ }).click();
    await card.waitFor();
    if (process.env.UI_SMOKE_NEGATIVE === "outbound-control")
      await card.evaluate((el, href) => {
        const a = document.createElement("a");
        a.href = href;
        a.textContent = "Injected outbound regression";
        el.append(a);
      }, canonical);
    if (process.env.UI_SMOKE_NEGATIVE === "missing-source")
      await card.locator(".ruby-source-link").evaluate((el) => el.remove());
    await assertRetained(card);
    await page.goto(base + "/community?view=vip", { waitUntil: "networkidle" });
    await page.locator(".ruby-submit-drawer summary").click();
    const open = page.getByRole("button", {
      name: "Submit today’s lay",
      exact: true,
    });
    await open.click();
    const modal = page.getByRole("dialog", { name: "Make your daily lay." });
    const assertComposerPaused = async () => {
      assert.equal(await modal.getByLabel("Paste Kalshi link").count(), 0);
      assert.equal(await modal.locator('input[name="source_link"]').count(), 0);
      assert.equal(
        await modal
          .getByText(/Contributor-shared Kalshi link · Preview:/)
          .count(),
        0,
      );
      await assertPaused();
    };
    await assertComposerPaused();
    await modal.getByRole("button", { name: "Publish to The Zone" }).click();
    await modal.getByText(/Add at least two legs/).waitFor();
    assert.equal(submissions.length, 0, "empty composer submitted");
    await modal.getByText("Add details · optional", { exact: true }).click();
    await modal
      .getByLabel("Your legs")
      .fill("Sample A 20+ points\nSample B 5+ rebounds");
    await modal.getByRole("button", { name: "Publish to The Zone" }).click();
    await modal.getByText("Synthetic lost response after commit").waitFor();
    await modal.getByRole("button", { name: "Publish to The Zone" }).click();
    await modal.waitFor({ state: "hidden" });
    assert.equal(submissions.length, 2);
    assert.equal(submissions[0].p_id, submissions[1].p_id, "retry changed id");
    await open.click();
    await assertComposerPaused();
    // Text fields may retain a draft; explicitly clear them for screenshot-only acceptance.
    const details = modal.locator("details").filter({ hasText: "Add details" });
    if (
      (await details.count()) &&
      (await details.getAttribute("open")) === null
    )
      await modal.getByText("Add details · optional", { exact: true }).click();
    await modal.getByLabel("Your legs").fill("");
    photoMode = true;
    lost = true;
    await modal.locator("input[type=file]").setInputFiles({
      name: "synthetic.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await modal.getByRole("button", { name: "Publish to The Zone" }).click();
    await modal.waitFor({ state: "hidden" });
    assert.ok(mine.photo_path, "recovery discarded stored image");
    assert.equal(photoDeletes, 0, "recovery deleted stored image");
    assert.notEqual(
      submissions.at(-1).p_id,
      submissions[0].p_id,
      "new submission reused old id",
    );
    await open.click();
    assert.equal(
      await modal.locator("input[type=file]").inputValue(),
      "",
      "reopening retained photo",
    );
    await assertComposerPaused();
    const beforeSignOut = submissions.length;
    await page.evaluate(() =>
      new BroadcastChannel("sb-127-auth-token").postMessage({
        event: "SIGNED_OUT",
        session: null,
      }),
    );
    await modal.waitFor({ state: "hidden" });
    assert.equal(
      submissions.length,
      beforeSignOut,
      "account change submitted a draft",
    );
    await assertPaused();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "horizontal overflow",
    );
    await fs.writeFile(
      `${out}/${width}-pause-results.json`,
      JSON.stringify(
        {
          width,
          retainedSource: canonical,
          sourceHidden: true,
          internalCopyPreserved: true,
          forbiddenRequests,
          submissions: submissions.length,
          photoDeletes,
        },
        null,
        2,
      ),
    );
    await ctx.close();
    console.log(
      `${width}px Kalshi pause, retained cards, admin preservation, copy privacy, typed retry and screenshot recovery passed`,
    );
  }
} finally {
  await browser.close();
}

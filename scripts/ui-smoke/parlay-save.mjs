// Synthetic account data only. No live saves, shares or wagers.
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const base = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
for (const width of [390, 1280]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("vq-prompt-shown", "fixture");
    localStorage.setItem(
      "sb-127-auth-token",
      JSON.stringify({
        access_token: "smoke",
        refresh_token: "smoke",
        token_type: "bearer",
        expires_in: 86400,
        expires_at: Math.floor(Date.now() / 1000) + 86400,
        user: {
          id: "00000000-0000-0000-0000-000000000001",
          aud: "authenticated",
          role: "authenticated",
          app_metadata: {},
          user_metadata: { vq_welcome_version: 1 },
        },
      }),
    );
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(12000);
  const expires = new Date(Date.now() + 86400000).toISOString(),
    at = new Date().toISOString();
  const legs = Array.from({ length: 12 }, (_, i) => ({
    leg_key: `fixture:${i}`,
    name: `Sample Player ${i}`,
    market: "Full game · 20+ rushing yards",
    matchup: `Sample Away ${i} @ Sample Home ${i}`,
    game_id: `game-${i}`,
    kind: "RESEARCH",
    quote: null,
    quote_observed_at: null,
    published_at: at,
    expires_at: expires,
    result: null,
    why: "Sample workload",
    risk: "Sample rotation",
    copy_text: `Sample Player ${i} 20+ rushing yards`,
  }));
  const older = {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Older sample parlay",
    legs: legs.slice(2, 4),
    created_at: new Date(Date.now() - 3600000).toISOString(),
    expires_at: expires,
  };
  let mine = [older],
    creates = 0,
    shares = 0,
    shareFails = false;
  await page.route("**/rest/v1/**", async (route) => {
    const u = new URL(route.request().url()),
      path = u.pathname;
    let data = [];
    if (route.request().method() === "OPTIONS")
      return route.fulfill({ status: 204 });
    if (path.endsWith("membership_status"))
      data = { allowed: true, admin: false, member_code: "SAMPLE" };
    if (path.endsWith("beta_application_status"))
      return route.fulfill({ json: { state: "approved", approved: true, onboarding_complete: true } });
    if (path.endsWith("age_verification_status"))
      data = { required: true, verified: true };
    if (path.endsWith("community_profiles"))
      data = [
        {
          user_id: "00000000-0000-0000-0000-000000000001",
          username: "FixtureMember",
          avatar: "https://example.com/avatar.png",
          visible: true,
        },
      ];
    if (path.endsWith("published_leg_catalog")) data = legs;
    if (path.endsWith("member_parlays"))
      data = u.searchParams.has("id")
        ? mine.find((p) => `eq.${p.id}` === u.searchParams.get("id")) || null
        : mine;
    if (path.endsWith("create_member_parlay")) {
      creates++;
      const body = route.request().postDataJSON();
      assert.equal(body.p_leg_keys.length, 2);
      const existing = mine.find(
        (p) =>
          p.legs
            .map((l) => l.leg_key)
            .sort()
            .join() === [...body.p_leg_keys].sort().join(),
      );
      if (existing) data = existing.id;
      else {
        const id = `22222222-2222-4222-8222-${String(creates).padStart(12, "0")}`;
        mine = [
          older,
          ...mine.filter((p) => p.id !== older.id),
          {
            id,
            title: body.p_title,
            legs: legs.filter((l) => body.p_leg_keys.includes(l.leg_key)),
            created_at: at,
            expires_at: expires,
            community_post_id: null,
          },
        ];
        data = id;
      }
    }
    if (path.endsWith("share_member_parlay")) {
      shares++;
      if (shareFails)
        return route.fulfill({
          status: 400,
          json: { message: "Sample share failed. Retry or uncheck sharing." },
        });
      const id = route.request().postDataJSON().p_parlay;
      mine = mine.map((p) =>
        p.id === id ? { ...p, community_post_id: "sample-post" } : p,
      );
      data = "sample-post";
    }
    return route.fulfill({ json: data });
  });
  let kalshiChecks = 0;
  await page.route("**/api/kalshi", async (route) => {
    kalshiChecks++;
    const { keys } = route.request().postDataJSON();
    assert.deepEqual(keys, ["fixture:10", "fixture:11"]);
    await route.fulfill({
      json: {
        results: keys.map((key, i) => ({
          key,
          label: `Sample Kalshi ${i}`,
          status: i ? "NO_MATCH" : "MATCH",
          url: i ? null : "https://kalshi.com/markets/sample",
        })),
      },
    });
  });
  await page.goto(base + "/feed?view=legs");
  // A fresh member must acknowledge the app refresh before using the workshop.
  const refresh = page.getByRole("dialog", { name: "Get the new gold Vegas Quant app" });
  await refresh.waitFor();
  const continueApp = refresh.getByRole("button", { name: "Continue to Vegas Quant" });
  assert.equal(await continueApp.isEnabled(), false);
  await page.keyboard.press("Escape");
  assert.equal(await refresh.isVisible(), true);
  await refresh.getByRole("checkbox").check();
  await continueApp.click();
  await refresh.waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "+ Add to parlay", exact: true })
    .first()
    .waitFor();
  await page
    .getByRole("button", { name: "+ Create parlay", exact: true })
    .click();
  await page
    .getByLabel("Parlay name", { exact: true })
    .fill("My newest sample");
  const add = page.getByRole("button", {
    name: "+ Add to parlay",
    exact: true,
  });
  await add.nth(0).click();
  await add.nth(0).click();
  await page.locator(".workshop-card").last().scrollIntoViewIfNeeded();
  const save = page.getByRole("button", {
    name: "Save my parlay",
    exact: true,
  });
  const box = await save.boundingBox();
  assert.ok(
    box && box.y > 0 && box.y + box.height < 900,
    "save stays in viewport at bottom of library",
  );
  const nav = page.locator(".mobile-nav");
  if (await nav.isVisible()) {
    const n = await nav.boundingBox();
    assert.ok(
      box.y + box.height <= n.y,
      "save does not cover mobile navigation",
    );
  }
  await save.click();
  const prompt = page.getByRole("dialog", {
    name: "Parlay saved",
    exact: true,
  });
  await prompt.waitFor();
  assert.equal(creates, 1);
  assert.equal(shares, 0);
  assert.equal(await prompt.getByRole("checkbox").isChecked(), false);
  await prompt
    .getByRole("button", { name: "View My parlays", exact: true })
    .click();
  await page.waitForURL(/view=parlays.*saved=/);
  const first = page.locator(".workshop-saved > details").first();
  await first.waitFor();
  assert.match(await first.innerText(), /My newest sample/);
  assert.match(await first.innerText(), /Just saved/);
  assert.equal(await first.getAttribute("open"), "");
  assert.equal(shares, 0);
  // Repeat save in the Parlay tab, opt in to sharing, retain the dialog on failure.
  await page
    .getByRole("button", { name: "+ Create parlay", exact: true })
    .click();
  await page.getByLabel("Parlay name", { exact: true }).fill("Shared sample");
  await page
    .getByRole("button", { name: "+ Add to parlay", exact: true })
    .nth(4)
    .click();
  await page
    .getByRole("button", { name: "+ Add to parlay", exact: true })
    .nth(4)
    .click();
  await page
    .getByRole("button", { name: "Save my parlay", exact: true })
    .click();
  await prompt.waitFor();
  await prompt.getByRole("checkbox").check();
  shareFails = true;
  await prompt
    .getByRole("button", { name: "Open with Gambly ↗", exact: true })
    .click();
  await prompt.getByRole("alert").waitFor();
  assert.equal(shares, 1);
  assert.ok(await prompt.isVisible());
  shareFails = false;
  await prompt
    .getByRole("button", { name: "Open with Gambly ↗", exact: true })
    .click();
  const gambly = page.getByRole("dialog", {
    name: "Copy here. Paste in Gambly.",
    exact: true,
  });
  await gambly.waitFor();
  assert.equal(shares, 2);
  assert.equal(await prompt.isVisible(), false);
  await gambly.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.match(
    await page.locator(".workshop-saved > details").first().innerText(),
    /Shared sample/,
  );
  await page
    .getByRole("button", { name: "+ Create parlay", exact: true })
    .click();
  await page.getByLabel("Parlay name", { exact: true }).fill("Kalshi sample");
  await page
    .getByRole("button", { name: "+ Add to parlay", exact: true })
    .nth(10)
    .click();
  await page
    .getByRole("button", { name: "+ Add to parlay", exact: true })
    .nth(10)
    .click();
  await save.click();
  await prompt.waitFor();
  await prompt.getByRole("checkbox").check();
  shareFails = true;
  await prompt
    .getByRole("button", { name: "Open with Kalshi ↗", exact: true })
    .click();
  await prompt.getByRole("alert").waitFor();
  assert.equal(kalshiChecks, 0, "failed share keeps destination closed");
  shareFails = false;
  await prompt
    .getByRole("button", { name: "Open with Kalshi ↗", exact: true })
    .click();
  const kalshi = page.getByRole("dialog", {
    name: "Open selections on Kalshi",
    exact: true,
  });
  await kalshi
    .getByText("No exact available Kalshi match.", { exact: true })
    .waitFor();
  assert.equal(await prompt.isVisible(), false);
  assert.equal(await kalshi.getByRole("link").count(), 0);
  await kalshi.getByRole("checkbox").check();
  assert.equal(
    await kalshi.getByRole("link").getAttribute("href"),
    "https://kalshi.com/markets/sample",
  );
  assert.match(await kalshi.innerText(), /does not create a combined/);
  await kalshi.getByRole("button", { name: "Close", exact: true }).click();
  assert.equal(shares, 4);
  // Returning from an external tool leaves the saved card available to reuse.
  const kalshiSaved = page.locator(".workshop-saved > details").first();
  await kalshiSaved
    .getByRole("button", { name: "Reuse / edit a copy", exact: true })
    .click();
  const draft = page.getByRole("region", {
    name: "Your parlay draft",
    exact: true,
  });
  assert.equal(
    await draft.getByRole("button", { name: /^Remove / }).count(),
    2,
  );
  await draft
    .getByRole("button", { name: /^Remove / })
    .first()
    .click();
  await page.reload();
  await page
    .getByRole("region", { name: "Your parlay draft", exact: true })
    .waitFor();
  assert.equal(
    await draft.getByRole("button", { name: /^Remove / }).count(),
    1,
    "draft recovers after leaving/reloading",
  );
  await draft
    .getByRole("button", { name: "Clear selections", exact: true })
    .click();
  assert.equal(
    await draft.getByRole("button", { name: /^Remove / }).count(),
    0,
  );
  await page
    .locator(".workshop-saved > details")
    .first()
    .getByRole("button", { name: "Reuse / edit a copy", exact: true })
    .click();
  await draft
    .getByRole("button", { name: /^Remove / })
    .first()
    .click();
  await page
    .getByRole("button", { name: "+ Add to parlay", exact: true })
    .nth(0)
    .click();
  await save.click();
  await prompt.waitFor();
  assert.match(await prompt.innerText(), /Kalshi sample · copy/);
  await prompt.getByRole("button", { name: "Done", exact: true }).click();
  assert.equal(
    mine.find((p) => p.title === "Kalshi sample").legs.length,
    2,
    "original saved selections stay intact",
  );
  assert.deepEqual(
    mine
      .find((p) => p.title === "Kalshi sample · copy")
      .legs.map((l) => l.leg_key),
    ["fixture:0", "fixture:11"],
  );
  for (const title of ["Done sample", "Repeat sample", "Expired sample"]) {
    await page
      .getByRole("button", { name: "+ Create parlay", exact: true })
      .click();
    await page.getByLabel("Parlay name", { exact: true }).fill(title);
    await page
      .getByRole("button", { name: "+ Add to parlay", exact: true })
      .nth(title === "Done sample" ? 6 : title === "Repeat sample" ? 2 : 8)
      .click();
    await page
      .getByRole("button", { name: "+ Add to parlay", exact: true })
      .nth(title === "Done sample" ? 6 : title === "Repeat sample" ? 2 : 8)
      .click();
    await page
      .getByRole("button", { name: "Save my parlay", exact: true })
      .click();
    await prompt.waitFor();
    if (title === "Done sample") {
      await prompt.getByRole("checkbox").check();
      await prompt.getByRole("button", { name: "Done", exact: true }).click();
      await prompt.waitFor({ state: "hidden" });
      assert.equal(shares, 5, "Done honors the sharing checkbox");
    } else if (title === "Repeat sample") {
      assert.match(await prompt.innerText(), /already saved/);
      assert.match(await prompt.innerText(), /Older sample parlay/);
      await prompt
        .getByRole("button", { name: "View My parlays", exact: true })
        .click();
      await page.goto(base + "/feed?view=legs");
      await page
        .getByRole("button", { name: "+ Create parlay", exact: true })
        .waitFor();
      await page.goto(base + "/feed?view=parlays");
      await page
        .locator(".workshop-saved > details")
        .first()
        .getByRole("heading", { name: "Older sample parlay", exact: true })
        .waitFor();
      assert.match(
        await page.locator(".workshop-saved > details").first().innerText(),
        /Just saved/,
      );
      assert.equal(shares, 5);
    } else {
      await page.clock.install({ time: new Date(Date.now() + 2 * 86400000) });
      await prompt
        .getByRole("button", { name: "Open with Gambly ↗", exact: true })
        .click();
      await prompt.getByRole("alert").waitFor();
      assert.match(await prompt.innerText(), /parlay has closed/);
      assert.equal(await gambly.isVisible(), false);
      await prompt
        .getByRole("button", { name: "Open with Kalshi ↗", exact: true })
        .click();
      assert.equal(await kalshi.isVisible(), false);
      assert.equal(kalshiChecks, 1);
      await prompt
        .getByRole("button", { name: "View My parlays", exact: true })
        .click();
    }
  }
  await page.screenshot({ path: `/tmp/vq-parlay-save-${width}.png` });
  await ctx.close();
}
await browser.close();
console.log(
  "Parlay save: persistent bar, newest/highlighted card, optional sharing, share retry, Gambly/Kalshi, reuse/edit, clear, reload recovery and original preservation passed at phone/desktop widths.",
);

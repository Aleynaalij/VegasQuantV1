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
    if (path.endsWith("member_parlays")) data = mine;
    if (path.endsWith("create_member_parlay")) {
      creates++;
      const body = route.request().postDataJSON();
      assert.equal(body.p_leg_keys.length, 2);
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
  await page.goto(base + "/feed?view=legs");
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
    .nth(0)
    .click();
  await page
    .getByRole("button", { name: "+ Add to parlay", exact: true })
    .nth(0)
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
  for (const title of ["Done sample", "Expired sample"]) {
    await page
      .getByRole("button", { name: "+ Create parlay", exact: true })
      .click();
    await page.getByLabel("Parlay name", { exact: true }).fill(title);
    await page
      .getByRole("button", { name: "+ Add to parlay", exact: true })
      .nth(0)
      .click();
    await page
      .getByRole("button", { name: "+ Add to parlay", exact: true })
      .nth(0)
      .click();
    await page
      .getByRole("button", { name: "Save my parlay", exact: true })
      .click();
    await prompt.waitFor();
    if (title === "Done sample") {
      await prompt.getByRole("checkbox").check();
      await prompt.getByRole("button", { name: "Done", exact: true }).click();
      await prompt.waitFor({ state: "hidden" });
      assert.equal(shares, 3, "Done honors the sharing checkbox");
    } else {
      await page.clock.install({ time: new Date(Date.now() + 2 * 86400000) });
      await prompt
        .getByRole("button", { name: "Open with Gambly ↗", exact: true })
        .click();
      await prompt.getByRole("alert").waitFor();
      assert.match(await prompt.innerText(), /parlay has closed/);
      assert.equal(await gambly.isVisible(), false);
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
  "Parlay save: persistent bar, newest/highlighted card, optional sharing, share retry and Gambly dialog passed at phone/desktop widths.",
);

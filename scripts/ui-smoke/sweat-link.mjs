// Local synthetic fixtures only; verifies a release outside the first feed page.
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const id = "11111111-1111-4111-8111-111111111111",
  at = new Date().toISOString();
const target = {
  id,
  title: "Worth a dollar of your time",
  created_at: "2026-10-12T12:00:00Z",
  expires_at: new Date(Date.now() + 86400000).toISOString(),
  candidates: [
    {
      parlay: true,
      worth_a_dollar: true,
      sweat_until: new Date(Date.now() + 86400000).toISOString(),
      name: "Worth a dollar of your time",
      market: "10-leg parlay",
      matchup: "Weekly sleepers",
      why: "Fixture case",
      risk: "Fixture risk",
      next: "Fixture check",
      copy_text: "Fixture player 3+ receptions",
      gambly_url: "https://gambly.com",
      sources: [],
      parlay_legs: Array.from({ length: 10 }, (_, i) => ({
        name: `Fixture player ${i}`,
        market: "3+ receptions",
        matchup: "Fixture game",
        why: "Fixture",
        risk: "Fixture",
      })),
    },
  ],
};
for (const width of [390, 1280]) {
  const context = await browser.newContext({
      viewport: { width, height: 950 },
    }),
    page = await context.newPage();
  let targeted = 0;
  await page.route("**/rest/v1/**", (route) => {
    const u = new URL(route.request().url());
    let data = [];
    if (u.pathname.endsWith("membership_status"))
      data = { allowed: true, admin: false };
    else if (u.pathname.includes("/rpc/desk"))
      data = {
        games: [],
        analyses: [],
        picks: [],
        challenges: [],
        stages: [],
        markets: [],
        entries: [],
        closings: [],
        reviews: [],
        transactions: [],
        audit: [],
        results: [],
        access: { allowed: true, admin: false },
        free_core: true,
      };
    else if (u.pathname.endsWith("candidate_releases")) {
      if (u.searchParams.get("id") === `eq.${id}`) {
        targeted++;
        data = [target];
      } else if (
        (u.searchParams.get("candidates") || "").includes("worth_a_dollar")
      )
        data = [target];
      else if (u.searchParams.has("candidates")) data = [];
      else
        data = Array.from({ length: 21 }, (_, i) => ({
          id: `new-${i}`,
          title: "Newer research",
          created_at: at,
          expires_at: target.expires_at,
          candidates: [],
        }));
    }
    return route.fulfill({ json: data });
  });
  const base = process.env.UI_SMOKE_URL || "http://127.0.0.1:3104";
  for (const path of [
    "/",
    "/history",
    "/community",
    "/feed?view=legs",
    "/feed?view=injury",
    "/feed?view=parlays",
  ]) {
    await page.goto(base + path);
    await page.evaluate(() =>
      document.querySelectorAll("dialog[open]").forEach((d) => d.close()),
    );
    const link = page.getByRole("link", {
      name: "Let’s Sweat — Worth a dollar of your time",
    });
    await link.waitFor();
    assert.equal(
      await link.getAttribute("href"),
      `/feed?view=parlays&release=${id}#release-${id}`,
    );
    await link.click();
    await page.locator(`#release-${id}`).waitFor({ state: "visible" });
    assert.ok(page.url().includes("view=parlays&release=" + id));
    assert.equal(
      await page.locator('.zone-parlay[id^="release-"]').first().getAttribute("id"),
      `release-${id}`,
    );
  }
  assert.ok(targeted > 0, "fetch target directly, without load-more");
  await context.close();
}
await browser.close();
console.log(
  "Let’s Sweat: home, records, community and existing Zone tabs route directly to off-page card at phone/desktop widths.",
);

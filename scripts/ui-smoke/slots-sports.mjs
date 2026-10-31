// VQ Slots by sport (#166): members pick a sport first; a ticket only holds that sport's current FanDuel
// markets, switching clears the old ticket, and a thin board refuses to spin instead of padding.
// Synthetic NHL/NCAAB pages built from Codex's contract fixtures; runs against :3100 with the stub.
import assert from "node:assert/strict";
import fs from "node:fs";
const pw = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const { chromium } = pw.default || pw;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const base = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const iso = (m) => new Date(Date.now() + m * 60000).toISOString();
function page(sport) {
  const p = JSON.parse(fs.readFileSync(`tests/fixtures/sports/${sport}/page.json`, "utf8"));
  const g = p.games[0];
  g.start_time = iso(600);
  const src = { ...p.markets[0].source, url: "https://example.invalid/fixture" };
  const m0 = { ...p.markets[0], game_id: g.id, observed_at: iso(-5), expires_at: iso(300), source: src };
  // NHL: ten skaters with an exact points line each; NCAAB: one moneyline pair only.
  p.markets =
    sport === "nhl"
      ? Array.from({ length: 10 }, (_, i) => ({ ...m0, id: `m${i}`, market: "player_points", side: null, player: `Fixture Skater ${i}`, athlete_id: `a${i}`, selection: `Fixture Skater ${i}`, direction: "Over", line: 0.5, odds: -120, settlement: "skater_stats_excluding_shootout", settlement_note: "Skater stats exclude the shootout" }))
      : [{ ...m0, id: "c1", sport, side: "away", selection: g.away.name }, { ...m0, id: "c2", sport, side: "home", selection: g.home.name, odds: 105 }];
  p.access = true;
  return p;
}
const session = () =>
  localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: "smoke", token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400 * 400, refresh_token: "smoke", user: { id: "00000000-0000-0000-0000-000000000001", aud: "authenticated", role: "authenticated", email: "smoke@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-10-01T00:00:00Z" } }));
for (const width of [390, 1280]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
  await ctx.addInitScript(session);
  const asked = [];
  await ctx.route("**/rest/v1/rpc/sports_home", (r) => {
    const sport = JSON.parse(r.request().postData() || "{}").p_sport;
    asked.push(sport);
    return r.fulfill({ json: page(sport) });
  });
  await ctx.route("**/rest/v1/nba_games*", (r) => r.fulfill({ json: [] }));
  // A finished profile, so the profile setup dialog stays closed.
  await ctx.route("**/rest/v1/community_profiles*", (r) => {
    const row = { username: "SlotsMember", avatar: "a.jpg", region: null, visible: true };
    return r.fulfill({ json: (r.request().headers().accept || "").includes("vnd.pgrst.object") ? row : [row] });
  });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`${base}/slots`, { waitUntil: "networkidle" });
  await p.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
  const radios = p.getByRole("radiogroup", { name: "Sport" }).getByRole("radio");
  assert.deepEqual(await radios.allInnerTexts(), ["NFL", "NBA", "NHL", "NCAAB"]);
  assert.equal(await radios.first().getAttribute("aria-checked"), "true");
  await radios.nth(2).click();
  await p.getByText(/NHL · 1\s+games · 10 sourced selections/).waitFor();
  assert.deepEqual(asked, ["nhl"]);
  await p.locator("button.vq-spin").first().click();
  const ticket = p.locator("dialog.vq-ticket[open]");
  await ticket.waitFor();
  assert.match(await ticket.locator(".eyebrow").innerText(), /NHL/);
  const legs = await ticket.locator("ol li strong").allInnerTexts();
  assert.equal(legs.length, 8);
  assert.ok(legs.every((name) => name.startsWith("Fixture Skater")), "only NHL legs");
  await ticket.getByRole("button", { name: "Close ticket" }).click();
  // Switching sport clears the board; NCAAB's single moneyline pair can't fill eight reels.
  await radios.nth(3).click();
  await p.getByText(/NCAAB · 1\s+games · 2 sourced selections/).waitFor();
  assert.equal(await p.locator(".vq-reel-strip b").first().innerText(), "VQ");
  await p.locator("button.vq-spin").first().click();
  await p.getByText("Eight different eligible selections are needed.", { exact: false }).waitFor();
  assert.equal(await p.locator("dialog.vq-ticket[open]").count(), 0);
  await radios.nth(1).click();
  await p.getByText(/NBA · 0\s+games · 0 sourced selections/).waitFor();
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 1));
  assert.deepEqual(errors, []);
  await ctx.close();
}
await browser.close();
console.log("VQ Slots: sport picker, NHL-only eight-leg ticket, cleared board on switch and insufficient-pool refusal passed at phone and desktop width.");

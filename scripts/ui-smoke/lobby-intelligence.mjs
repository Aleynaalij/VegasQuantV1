// Verify the active Fear link and the inactive Simulator card on synthetic lobby data.
// Needs the app on :3100 built with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 and
// scripts/ui-smoke/stub.mjs running (see check.mjs).
// Negative control: UI_SMOKE_NEGATIVE=working-link turns a card into a link to /simulator in the
// browser, so the Simulator action guard must fail.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");

const BASE = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const NEG = process.env.UI_SMOKE_NEGATIVE || "";
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {});
const failures = [];

for (const width of [360, 390, 1280]) {
  const name = `@${width}: Fear opens the market view and Simulator stays Coming soon`;
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: "reduce" });
  await ctx.addInitScript(() => sessionStorage.setItem("vq-prompt-shown", "fixture"));
  const page = await ctx.newPage();
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const before = failures.length;
  const fail = (m) => failures.push(`${name}: ${m}`);
  try {
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
    if (NEG === "working-link")
      await page.evaluate(() => {
        const li = document.querySelector(".vq-intel-card");
        if (li) li.innerHTML = `<a href="/simulator">${li.innerHTML}</a>`;
      });
    const section = page.getByRole("region", { name: "VQ Intelligence" });
    await section.waitFor().catch(() => fail("no VQ Intelligence section"));
    const r = await page.evaluate(() => {
      const sec = document.querySelector(".vq-intel");
      if (!sec) return null;
      const cards = [...sec.querySelectorAll(".vq-intel-card")];
      const next = [...document.querySelectorAll("h2, h3")].find((h) => /your next move/i.test(h.textContent || ""));
      return {
        heading: sec.querySelector("h2")?.textContent.trim(),
        cards: cards.map((c) => ({
          text: c.textContent.replace(/\s+/g, " ").trim(),
          badge: (() => {
            const b = c.querySelector(".vq-intel-soon");
            if (!b) return null;
            const r = b.getBoundingClientRect();
            return { visible: r.width > 0 && r.height > 0 && getComputedStyle(b).visibility !== "hidden", fits: b.scrollWidth <= b.clientWidth + 1 };
          })(),
          box: (() => { const r = c.getBoundingClientRect(); return { w: r.width, h: r.height }; })(),
        })),
        simulatorActions: cards[0]?.querySelectorAll("a, button, [role=button], [role=link], [tabindex]:not([tabindex='-1'])").length,
        actions: [...sec.querySelectorAll("a, button, [role=button], [role=link], [tabindex]:not([tabindex='-1'])")].map((action) => action.getAttribute("href")),
        afterNextMove: next ? Boolean(next.compareDocumentPosition(sec) & Node.DOCUMENT_POSITION_FOLLOWING) : null,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
      };
    });
    if (!r) fail("section not rendered");
    else {
      if (r.heading !== "VQ Intelligence") fail(`heading "${r.heading}"`);
      const names = r.cards.map((c) => c.text);
      if (r.cards.length !== 2 || !/^Simulator/.test(names[0]) || !/^Fear Index/.test(names[1])) fail(`cards ${JSON.stringify(names)}`);
      if (!/Coming soon, not available yet/.test(names[0] || "")) fail("Simulator availability label is missing");
      if (!/NFL \/ NBA/.test(names[1] || "") || /Coming soon/.test(names[1])) fail("Fear coverage label is missing or misleading");
      for (const c of r.cards) {
        if (!c.badge?.visible) fail(`no visible status badge on "${c.text}"`);
        if (c.badge && !c.badge.fits) fail(`badge clipped on "${c.text}"`);
        if (c.box.h < 44) fail(`card under 44px tall (${c.box.h})`);
      }
      if (r.simulatorActions) fail("Unavailable cards are not actions: Simulator has an interactive control");
      if (r.actions.length !== 1 || r.actions[0] !== "/vegas-fear") fail(`expected one Fear link, got ${JSON.stringify(r.actions)}`);
      if (r.afterNextMove === false) fail("VQ Intelligence renders above Your next move");
      if (r.overflow) fail("horizontal overflow");
    }
    const fear = section.getByRole("link", { name: "Fear Index, NFL and NBA market pressure", exact: true });
    if (await fear.count() !== 1) fail("Fear lacks a discoverable accessible link");
  } catch (e) {
    fail(`threw · ${String(e).split("\n")[0].slice(0, 180)}`);
  }
  if (errors.length) fail(`page error · ${errors[0].slice(0, 140)}`);
  console.log(`${failures.length > before ? "FAIL" : "ok  "} ${name}`);
  await ctx.close();
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nLobby intelligence acceptance passed.");

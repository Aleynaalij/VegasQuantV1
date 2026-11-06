// Lobby arena decoration (lobby-arena-decor.tsx) once mounted in the lobby hero: decorative only,
// never over live content. Synthetic stub only.
// Needs the app on :3100 built with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 and
// scripts/ui-smoke/stub.mjs running (see check.mjs).
// Negative control: UI_SMOKE_NEGATIVE=overlap moves a pennant over the headline in the browser, so
// "pennants clear of the headline and controls" must fail.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");

const BASE = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const NEG = process.env.UI_SMOKE_NEGATIVE || "";
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {});
const failures = [];

for (const width of [360, 390, 1280]) {
  const name = `@${width}: pennants hang clear of live content, hidden and inert`;
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
    if (NEG === "overlap")
      await page.evaluate(() => {
        const p = document.querySelector(".vq-pennant-left");
        if (p) Object.assign(p.style, { left: "40%", top: "20px" });
      });
    const r = await page.evaluate(() => {
      const decor = document.querySelector(".vq-lobby-skybox > .vq-arena-decor");
      if (!decor) return { mounted: false };
      const box = (el) => el.getBoundingClientRect();
      const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      // Live content: each text line's rects (not the full-width block) and every control.
      const textRects = [...document.querySelectorAll(".vq-lobby-skybox h1, .vq-lobby-skybox p, .vq-lobby-skybox h2")].flatMap((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return [...range.getClientRects()].map((x) => ({ what: el.tagName, r: x }));
      });
      const controls = [...document.querySelectorAll(".vq-lobby-skybox a, .vq-lobby-skybox button")].map((el) => ({ what: el.textContent.trim().slice(0, 20), r: box(el), el }));
      const pennants = [...decor.querySelectorAll(".vq-pennant")].map(box);
      const overlaps = pennants.flatMap((p) => [...textRects, ...controls].filter((c) => hit(p, c.r)).map((c) => c.what));
      // Taps on each control land on the control, not on decoration.
      const blocked = controls.filter(({ r: c, el }) => {
        const at = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
        return at && !el.contains(at) && at !== el && c.top >= 0 && c.bottom <= innerHeight;
      }).map((c) => c.what);
      return {
        mounted: true,
        hidden: decor.getAttribute("aria-hidden") === "true",
        inert: getComputedStyle(decor).pointerEvents === "none",
        focusables: decor.querySelectorAll("a, button, input, [tabindex]").length,
        text: decor.textContent.trim(),
        pennants: pennants.length,
        visible: pennants.every((p) => p.width >= 24 && p.height >= 50),
        overlaps,
        blocked,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        skylineWithoutSrc: document.querySelectorAll(".vq-arena-skyline:not([style*='url'])").length,
      };
    });
    if (!r.mounted) fail("decor not mounted in the lobby hero");
    else {
      if (!r.hidden) fail("decor not aria-hidden");
      if (!r.inert) fail("decor takes pointer events");
      if (r.focusables) fail("focusable element inside decor");
      if (r.text) fail(`decor carries text: "${r.text.slice(0, 40)}"`);
      if (r.pennants !== 2 || !r.visible) fail(`expected two visible pennants, got ${r.pennants}`);
      if (r.overlaps.length) fail(`pennants clear of the headline and controls: overlaps ${r.overlaps.join(", ")}`);
      if (r.blocked.length) fail(`taps blocked on: ${r.blocked.join(", ")}`);
      if (r.overflow) fail("horizontal overflow");
      if (r.skylineWithoutSrc) fail("empty skyline frame rendered without an image");
    }
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
console.log("\nLobby arena decor acceptance passed.");

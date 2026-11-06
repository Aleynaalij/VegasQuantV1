// Signed-out Zone entry (Z-C2). A visitor gets an explanation, an honestly empty preview and a way
// in, and the page never requests or renders member content. Synthetic stub data only.
// Needs the app on :3100 built with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 and
// scripts/ui-smoke/stub.mjs running (see check.mjs).
// Negative control: UI_SMOKE_NEGATIVE=visitor-fetch requests the member feed from the visitor page
// (as a regression that loads posts for visitors would), so the "no member requests" check must fail.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");

const BASE = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const MEMBER_RPCS = /\/rest\/v1\/rpc\/(community_feed|community_post|community_activity|community_member|community_post_comments)\b/;
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {});
const failures = [];
for (const width of [360, 390, 1280]) {
  const name = `/community signed out @${width}`;
  const before = failures.length;
  const fail = (m) => failures.push(`${name}: ${m}`);
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: "reduce" });
  if (process.env.UI_SMOKE_NEGATIVE === "visitor-fetch")
    await ctx.addInitScript(() => {
      addEventListener("load", () => void fetch("http://127.0.0.1:54321/rest/v1/rpc/community_feed", { method: "POST", body: "{}" }));
    });
  const page = await ctx.newPage();
  const memberCalls = [];
  page.on("request", (r) => MEMBER_RPCS.test(r.url()) && memberCalls.push(r.url().split("/rpc/")[1]));
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    const res = await page.goto(BASE + "/community", { waitUntil: "networkidle" });
    const html = (await res.text()) + (await page.content());
    const text = await page.evaluate(() => document.body.innerText);
    for (const want of [/Join the conversation/, /member opinion, kept separate/i, /nothing to preview here/, /Sign in or create an account/, /Browse game research/])
      if (!want.test(text)) fail(`missing ${want}`);
    for (const leak of [/SampleMember/, /Sample post body/, /Sample slip/]) if (leak.test(html)) fail(`member content in visitor page: ${leak}`);
    if (memberCalls.length) fail(`visitor page requested member data: ${[...new Set(memberCalls)].join(", ")}`);
    const research = page.getByRole("link", { name: /Browse game research/ });
    if ((await research.getAttribute("href")) !== "/matchups") fail("research link does not go to /matchups");
    const box = await research.boundingBox();
    if (!box || box.height < 44) fail(`research link touch target is ${box?.height ?? 0}px tall`);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) fail("sideways scroll");
  } catch (e) {
    fail(`threw · ${String(e).split("\n")[0].slice(0, 200)}`);
  }
  if (errors.length) fail(`page error · ${errors[0].slice(0, 160)}`);
  console.log(`${failures.length > before ? "FAIL" : "ok  "} ${name}`);
  await ctx.close();
}
await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} zone entry failure(s):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nSigned-out Zone entry passed.");

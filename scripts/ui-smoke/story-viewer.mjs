// Author-grouped story viewer acceptance (Z-C9). Synthetic posts only: every Supabase call the
// viewer makes is answered by this script; no real accounts, posts, reads or external transfers.
// Needs the app on :3100 built with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 and
// scripts/ui-smoke/stub.mjs running (see check.mjs).
// Negative control: UI_SMOKE_NEGATIVE=read-on-tap marks a post read when its ring is tapped (the
// old behaviour), so "a failed post is never marked read" must fail.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");

const BASE = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const UID = "00000000-0000-0000-0000-000000000001";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const post = (n, user, author, minutes, extra = {}) => ({
  id: id(n), user_id: user, author_name: author, title: `${author} post ${n}`, body: `Sample body ${n}.`,
  sport: "nfl", kind: "talk", legs: [], stake: null, created_at: new Date(Date.UTC(2026, 9, 14, 1, minutes)).toISOString(),
  reactions: 0, reacted: false, comments: 0, following: false, photo_path: null, email: "leak@example.com", ...extra,
});
// Author A posted most recently, so A comes first; within an author, oldest first.
const posts = [
  post(1, A, "SampleAlpha", 10), post(2, A, "SampleAlpha", 40),
  post(3, B, "SampleBravo", 5, { title: "", body: "", photo_path: "sample/photo-3.png" }), post(4, B, "SampleBravo", 20),
];
const activity = [
  { post_id: id(2), username: "SampleAlpha", avatar: null, sport: "nfl", created_at: posts[1].created_at },
  { post_id: id(4), username: "SampleBravo", avatar: null, sport: "nfl", created_at: posts[3].created_at },
];

const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {});
const failures = [];
async function open(name, { width = 390, detail = (pid) => posts.find((p) => p.id === pid) ?? null, detailStatus = 200, readIds = null } = {}, run) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: "reduce" });
  if (readIds) await ctx.addInitScript(({ uid, ids }) => { if (!sessionStorage.getItem("vq-smoke-read-set")) { localStorage.setItem(`vq-community-read:${uid}`, JSON.stringify(ids)); sessionStorage.setItem("vq-smoke-read-set", "1"); } }, { uid: UID, ids: readIds });
  await ctx.addInitScript((uid) => {
    localStorage.setItem(`vq-app-refresh:${uid}`, "gold-2026-10-22-v2");
    localStorage.setItem(`vq-push-prompt:${uid}`, String(Date.now() + 7 * 86400000));
    sessionStorage.setItem("vq-prompt-shown", "fixture");
    if (!sessionStorage.getItem("vq-smoke-signed-out"))
      localStorage.setItem("sb-127-auth-token", JSON.stringify({
        access_token: "smoke", refresh_token: "smoke", token_type: "bearer", expires_in: 86400,
        expires_at: Math.floor(Date.now() / 1000) + 86400,
        user: { id: uid, aud: "authenticated", role: "authenticated", email: "smoke@example.com", app_metadata: {}, user_metadata: { vq_welcome_version: 1 } },
      }));
  }, UID);
  if (process.env.UI_SMOKE_NEGATIVE === "read-on-tap")
    await ctx.addInitScript((uid) => {
      document.addEventListener("click", (e) => {
        const ring = e.target instanceof Element && e.target.closest(".community-story");
        const pid = ring?.getAttribute("data-smoke-post");
        if (pid) localStorage.setItem(`vq-community-read:${uid}`, JSON.stringify([pid]));
      }, true);
    }, UID);
  await ctx.route("**/rest/v1/rpc/community_activity*", (r) => r.fulfill({ json: activity }));
  await ctx.route("**/rest/v1/rpc/community_feed*", (r) => r.fulfill({ json: posts }));
  await ctx.route("**/rest/v1/rpc/community_post*", (r) => {
    const pid = r.request().postDataJSON()?.p_id;
    return detailStatus === 200 ? r.fulfill({ json: detail(pid) }) : r.fulfill({ status: detailStatus, json: { message: "synthetic failure" } });
  });
  await ctx.route("**/rest/v1/rpc/notification_inbox*", (r) => r.fulfill({ json: { items: [], snapshot_at: new Date().toISOString() } }));
  await ctx.route("**/storage/v1/object/sign/**", (r) => r.fulfill({ json: { signedURL: "/object/sign/community-photos/sample/photo-3.png?token=smoke" } }));
  // The photo itself never loads: a photo-only post must therefore never be marked read.
  await ctx.route("**/storage/v1/object/sign/community-photos/**", (r) =>
    r.request().method() === "GET" ? r.fulfill({ status: 404, body: "" }) : r.fallback());
  const page = await ctx.newPage();
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const before = failures.length;
  const fail = (m) => failures.push(`${name}: ${m}`);
  try {
    await page.goto(BASE + "/community", { waitUntil: "networkidle" });
    await page.evaluate(() => document.querySelectorAll("dialog[open]:not(.story-viewer)").forEach((d) => d.close()));
    // Let the negative control find the tapped ring's post.
    await page.locator(".community-story").evaluateAll((els, ids) => els.forEach((el, i) => el.setAttribute("data-smoke-post", ids[i])), activity.map((a) => a.post_id));
    await run({ page, fail, ctx });
  } catch (e) {
    fail(`threw · ${String(e).split("\n")[0].slice(0, 200)} @ ${(e.stack || "").match(/story-viewer\.mjs:(\d+)/)?.[1] ?? "?"}`);
  }
  if (errors.length) fail(`page error · ${errors[0].slice(0, 160)}`);
  console.log(`${failures.length > before ? "FAIL" : "ok  "} ${name}`);
  await ctx.close();
}
const read = (page) => page.evaluate((uid) => JSON.parse(localStorage.getItem(`vq-community-read:${uid}`) || "[]"), UID);
const viewer = (page) => page.locator("dialog.story-viewer[open]");
const heading = (page) => viewer(page).locator(".story-viewer-meta b").innerText();

for (const width of [360, 390, 1280])
  await open(`@${width}: this member's posts in order, then the next member's, stopping at both ends`, { width }, async ({ page, fail }) => {
    // The ring shows SampleAlpha's latest post; entering plays their posts oldest first.
    await page.getByRole("button", { name: /SampleAlpha's recent community posts/ }).click();
    await viewer(page).getByText("SampleAlpha post 1").waitFor();
    if (!/1 of 2/.test(await viewer(page).innerText())) fail("did not enter at the member's first unread post (expected 1 of 2)");
    if ((await viewer(page).locator(".story-segments li").count()) !== 2) fail("segment progress does not show the author's 2 posts");
    if (/leak@example\.com/.test(await viewer(page).innerText())) fail("extra payload fields are rendered");
    if (!(await viewer(page).getByRole("button", { name: "Previous post" }).isDisabled())) fail("Previous is enabled on the first post overall (would loop)");
    // Ordinary Next plays the whole sequence: Alpha 1 → Alpha 2 → Bravo 3 (photo) → Bravo 4.
    const order = [];
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(150);
      const label = await viewer(page).locator(".story-viewer-meta").innerText();
      const title = await viewer(page).locator(".story-post h2").innerText().catch(() => "(photo)");
      order.push(`${label.split("\n")[0]}:${title}`);
      const nextBtn = viewer(page).getByRole("button", { name: /Next post/ });
      if (await nextBtn.isDisabled()) break;
      if (i === 0) await page.keyboard.press("ArrowRight");
      else await nextBtn.click();
    }
    const want = ["SampleAlpha:SampleAlpha post 1", "SampleAlpha:SampleAlpha post 2", "SampleBravo:(photo)", "SampleBravo:SampleBravo post 4"];
    if (JSON.stringify(order) !== JSON.stringify(want)) fail(`sequence was ${JSON.stringify(order)}`);
    // Tapping the unavailable Gambly note or the post text must not move the viewer.
    await viewer(page).locator(".story-gambly").click();
    await viewer(page).locator(".story-text").click();
    if (!(await viewer(page).getByText("SampleBravo post 4").count())) fail("tapping the Gambly note or text advanced the viewer");
    const seen = await read(page);
    for (const w of [id(1), id(2), id(4)]) if (!seen.includes(w)) fail(`displayed post ${w.slice(-1)} was not marked read`);
    if (seen.includes(id(3))) fail("photo-only post was marked read although its photo never loaded");
    await page.keyboard.press("Escape");
    await viewer(page).waitFor({ state: "detached" }).catch(() => {});
    if (await viewer(page).count()) fail("Escape did not close the viewer");
    if (page.url().includes("#story")) fail("closing left the viewer's history entry behind");
    const focused = await page.evaluate(() => document.activeElement?.closest(".community-stories") !== null);
    if (!focused) fail("focus did not return to the story rail after closing");
  });

await open("partly read: enters at the member's first unread post", { readIds: [] }, async ({ page, fail }) => {
  await page.evaluate((uid) => localStorage.setItem(`vq-community-read:${uid}`, JSON.stringify([`00000000-0000-4000-8000-000000000001`])), UID);
  await page.reload({ waitUntil: "networkidle" });
  await page.evaluate(() => document.querySelectorAll("dialog[open]:not(.story-viewer)").forEach((d) => d.close()));
  await page.getByRole("button", { name: /SampleAlpha's recent community posts/ }).click();
  await viewer(page).getByText("SampleAlpha post 2").waitFor().catch(() => fail("did not skip the already-read first post"));
});

await open("browser Back closes the viewer and keeps the page", {}, async ({ page, fail }) => {
  const before = page.url();
  await page.getByRole("button", { name: /SampleBravo's recent community posts/ }).click();
  await viewer(page).getByText(/SampleBravo post 4|Photo unavailable/).first().waitFor();
  await page.goBack();
  const closed = await page.waitForFunction(() => !document.querySelector("dialog.story-viewer[open]"), null, { timeout: 8000 }).then(() => true, () => false);
  if (!closed) fail("browser Back did not close the viewer");
  if (page.url() !== before) fail(`Back left ${page.url()} instead of returning to ${before}`);
  if (!(await page.locator(".community-stories").count())) fail("Back left the page");
});

await open("View discussion opens the post and Back returns to the page, not the viewer", {}, async ({ page, fail }) => {
  const before = page.url();
  await page.getByRole("button", { name: /SampleAlpha's recent community posts/ }).click();
  await viewer(page).getByText("SampleAlpha post 1").waitFor();
  await viewer(page).getByRole("link", { name: /View discussion/ }).click();
  await page.waitForURL(/post=00000000-0000-4000-8000-000000000001/).catch(() => fail("View discussion did not open the post"));
  await page.goBack();
  await page.waitForTimeout(800);
  if (page.url() !== before) fail(`Back from the discussion went to ${page.url()}, not ${before}`);
  if (await viewer(page).count()) fail("Back from the discussion reopened the viewer");
});

await open("full read history (2,000 IDs) still records a newly displayed post", { readIds: Array.from({ length: 2000 }, (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`) }, async ({ page, fail }) => {
  await page.getByRole("button", { name: /SampleAlpha's recent community posts/ }).click();
  await viewer(page).getByText("SampleAlpha post 1").waitFor();
  await page.waitForTimeout(400);
  const seen = await read(page);
  if (!seen.includes(id(1))) fail("newly displayed post was not recorded once history was full");
  if (seen.length > 2000) fail(`read history grew past its cap (${seen.length})`);
  await page.reload({ waitUntil: "networkidle" });
  if (!(await read(page)).includes(id(1))) fail("recorded read did not persist across reload");
});

await open("a post removed while the viewer is open shows unavailable, is never read, and Next moves past it", { detail: (pid) => pid === id(3) ? null : posts.find((p) => p.id === pid) ?? null }, async ({ page, fail }) => {
  await page.getByRole("button", { name: /SampleAlpha's recent community posts/ }).click();
  await viewer(page).getByText("SampleAlpha post 1").waitFor();
  await viewer(page).getByRole("button", { name: /Next post/ }).click();
  await viewer(page).getByText("SampleAlpha post 2").waitFor();
  // Bravo's first post (3) was removed after the sequence loaded: re-checked on arrival.
  await viewer(page).getByRole("button", { name: /Next post/ }).click();
  await viewer(page).getByText("This post is no longer available.").waitFor().catch(() => fail("removed post was not reported unavailable"));
  if (await viewer(page).locator(".story-post").count()) fail("removed post's content is still shown");
  if ((await read(page)).includes(id(3))) fail("removed post was marked read");
  await viewer(page).getByRole("button", { name: /Next post/ }).click();
  await viewer(page).getByText("SampleBravo post 4").waitFor().catch(() => fail("could not move past the removed post"));
});

await open("deleted post: unavailable, never read", { detail: () => null }, async ({ page, fail }) => {
  await page.getByRole("button", { name: /SampleAlpha's recent community posts/ }).click();
  await viewer(page).getByText("This post is no longer available.").waitFor();
  if ((await read(page)).length) fail("a post that could not be shown was marked read");
  if (await viewer(page).locator(".story-nav").count()) fail("navigation offered around a missing post");
});

await open("failed load: error and retry path, never read", { detailStatus: 500 }, async ({ page, fail }) => {
  await page.getByRole("button", { name: /SampleAlpha's recent community posts/ }).click();
  await viewer(page).getByText(/could not load/).waitFor();
  if ((await read(page)).length) fail("a post that failed to load was marked read");
  await viewer(page).getByRole("button", { name: "Close", exact: true }).click();
  if (await viewer(page).count()) fail("Close did not close the viewer");
});

await open("sign-out in another tab closes the viewer and drops its posts", {}, async ({ page, fail, ctx }) => {
  await page.getByRole("button", { name: /SampleAlpha's recent community posts/ }).click();
  await viewer(page).getByText("SampleAlpha post 1").waitFor();
  const other = await ctx.newPage();
  await other.goto(BASE + "/methodology");
  // Supabase tells other tabs about a sign-out on a BroadcastChannel named after its storage key.
  await other.evaluate(() => {
    sessionStorage.setItem("vq-smoke-signed-out", "1");
    localStorage.removeItem("sb-127-auth-token");
    new BroadcastChannel("sb-127-auth-token").postMessage({ event: "SIGNED_OUT", session: null });
  });
  const gone = await page.waitForFunction(() => !document.querySelector("dialog.story-viewer[open]"), null, { timeout: 10000 }).then(() => true, () => false);
  if (!gone) fail("viewer stayed open with the previous account's posts after sign-out");
  if (await page.locator("dialog.story-viewer").getByText("SampleAlpha post 1").count()) fail("previous account's post text is still on the page");
});

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} story viewer failure(s):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nStory viewer acceptance passed.");

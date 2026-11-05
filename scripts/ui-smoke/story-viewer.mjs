// Author-grouped story viewer acceptance (Z-C9). Synthetic posts only: every Supabase call the
// viewer makes is answered by this script; no real accounts, posts, reads or external transfers.
// Needs the app on :3100 built with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 and
// scripts/ui-smoke/stub.mjs running (see check.mjs).
// Negative control: UI_SMOKE_NEGATIVE=read-on-tap marks a post read when its ring is tapped (the
// old behaviour), so "a failed post is never marked read" must fail.
// Negative control: UI_SMOKE_NEGATIVE=no-taps swallows clicks on the post area (no side-tap
// navigation, the old behaviour), so the tap cases must fail.
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
const evidenceRoot = process.argv[2] || "/tmp/story-lifetime-evidence";
await (await import("node:fs/promises")).mkdir(evidenceRoot, { recursive: true });
async function open(name, { width = 390, detail = null, detailStatus = 200, readIds = null, plan = null, expiry = false, freeze = false, clockFailure = false } = {}, run) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: "reduce" });
  const baseTime = Date.UTC(2026, 9, 14, 2);
  const rows = expiry ? posts.map((p, i) => ({ ...p, created_at: new Date(baseTime - 86400000 + (i + 1) * 5000).toISOString() })) : posts;
  const rail = expiry ? activity.map(a => ({ ...a, created_at: rows.find(p => p.id === a.post_id).created_at })) : activity;
  await ctx.route("**/rest/v1/rpc/community_story_clock*", async r => {
    const elapsed = await r.request().frame().evaluate(() => performance.now()).catch(() => 0);
    return clockFailure ? r.fulfill({ status: 500, json: { message: "Synthetic clock failure" } }) : r.fulfill({ json: { version: 1, server_now: new Date(baseTime + elapsed).toISOString() } });
  });
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
  if (process.env.UI_SMOKE_NEGATIVE === "no-taps")
    await ctx.addInitScript(() => {
      document.addEventListener("click", (e) => {
        const t = e.target instanceof Element ? e.target : null;
        if (t?.closest(".story-viewer-body") && !t.closest("a,button")) e.stopPropagation();
      }, true);
    });
  if (process.env.UI_SMOKE_NEGATIVE === "read-on-tap")
    await ctx.addInitScript((uid) => {
      document.addEventListener("click", (e) => {
        const ring = e.target instanceof Element && e.target.closest(".community-story");
        const pid = ring?.getAttribute("data-smoke-post");
        if (pid) localStorage.setItem(`vq-community-read:${uid}`, JSON.stringify([pid]));
      }, true);
    }, UID);
  await ctx.route("**/rest/v1/rpc/community_activity*", (r) => r.fulfill({ json: rail }));
  await ctx.route("**/rest/v1/rpc/community_feed*", (r) => r.fulfill({ json: rows }));
  const calls = {};
  await ctx.route("**/rest/v1/rpc/community_post*", async (r) => {
    const pid = r.request().postDataJSON()?.p_id;
    calls[pid] = (calls[pid] || 0) + 1;
    // plan(pid, nth call) → [delay ms, body] to deliver a later check slowly or differently.
    const step = plan?.(pid, calls[pid]);
    if (step) {
      await new Promise((res) => setTimeout(res, step[0]));
      return r.fulfill({ json: step[1] }).catch(() => {});
    }
    return detailStatus === 200 ? r.fulfill({ json: (detail ? detail(pid) : rows.find(p => p.id === pid) ?? null) }) : r.fulfill({ status: detailStatus, json: { message: "synthetic failure" } });
  });
  await ctx.route("**/rest/v1/rpc/notification_inbox*", (r) => r.fulfill({ json: { items: [], snapshot_at: new Date().toISOString() } }));
  await ctx.route("**/storage/v1/object/sign/**", (r) => r.fulfill({ json: { signedURL: "/object/sign/community-photos/sample/photo-3.png?token=smoke" } }));
  // The photo itself never loads: a photo-only post must therefore never be marked read.
  await ctx.route("**/storage/v1/object/sign/community-photos/**", (r) =>
    r.request().method() === "GET" ? r.fulfill({ status: 404, body: "" }) : r.fallback());
  const page = await ctx.newPage();
  if (freeze) await page.clock.install({ time: new Date("2026-10-14T02:00:00Z") });
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
/** Record whether a post's content ever renders, even for one frame, from now on. */
const watchFor = (page, title) => page.evaluate((t) => {
  window.__saw = false;
  const seen = () => [...document.querySelectorAll("dialog.story-viewer .story-post h2")].some((h) => h.textContent === t);
  window.__obs?.disconnect();
  window.__obs = new MutationObserver(() => { if (seen()) window.__saw = true; });
  window.__obs.observe(document.body, { childList: true, subtree: true, characterData: true });
}, title);
const sawIt = (page) => page.evaluate(() => window.__saw === true);
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
    // Tapping the unavailable Gambly note (the post's action area) must not move the viewer.
    await viewer(page).locator(".story-gambly").click();
    if (!(await viewer(page).getByText("SampleBravo post 4").count())) fail("tapping the Gambly note advanced the viewer");
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

// A later check of a post already shown: it stays hidden until that check answers.
const p1 = () => posts[0];
for (const [label, body, after] of [["denied", null, "This post is no longer available."], ["allowed", "post", "SampleAlpha post 1"]])
  await open(`re-entering a post waits for its new check (${label})`, { plan: (pid, n) => (pid === id(1) && n === 2 ? [1500, body === "post" ? p1() : null] : null) }, async ({ page, fail }) => {
    await page.getByRole("button", { name: /SampleAlpha's recent community posts/ }).click();
    await viewer(page).getByText("SampleAlpha post 1").waitFor();
    await viewer(page).getByRole("button", { name: /Next post/ }).click();
    await viewer(page).getByText("SampleAlpha post 2").waitFor();
    await watchFor(page, "SampleAlpha post 1");
    await viewer(page).getByRole("button", { name: "Previous post" }).click();
    await page.waitForTimeout(400); // the second check is still pending
    if (await viewer(page).locator(".story-post").count()) fail("re-entered post shown from an earlier check while its new check was pending");
    if (!(await viewer(page).getByText("Checking this post…").count())) fail("no checking state while the new check was pending");
    await viewer(page).getByText(after).waitFor({ timeout: 5000 }).catch(() => fail(`after the check (${label}) expected "${after}"`));
    if (label === "denied" && (await sawIt(page))) fail("re-entered post rendered at some point while its new check was pending (denied)");
  });

await open("regaining focus re-checks the post on screen and hides it until answered", { plan: (pid, n) => (pid === id(1) && n === 2 ? [1500, null] : null) }, async ({ page, fail }) => {
  await page.getByRole("button", { name: /SampleAlpha's recent community posts/ }).click();
  await viewer(page).getByText("SampleAlpha post 1").waitFor();
  await page.evaluate(() => { window.__saw = false; });
  await page.evaluate(() => {
    window.__obs?.disconnect();
    // From the focus event on, any render of the post before the denial counts.
    window.__obs = new MutationObserver(() => {
      if ([...document.querySelectorAll("dialog.story-viewer .story-post h2")].some((h) => h.textContent === "SampleAlpha post 1") && window.__afterFocus) window.__saw = true;
    });
    window.__obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.__afterFocus = true;
    window.dispatchEvent(new Event("focus"));
  });
  await page.waitForTimeout(400);
  if (await viewer(page).locator(".story-post").count()) fail("post stayed visible while its focus re-check was pending");
  await viewer(page).getByText("This post is no longer available.").waitFor({ timeout: 5000 }).catch(() => fail("focus re-check denial not shown"));
  if (await sawIt(page)) fail("post re-rendered after focus while its re-check was pending");
});

await open("original #hash survives open, Back, Forward and reopen; no stale entries", {}, async ({ page, fail }) => {
  await page.goto(BASE + "/community#zone-top", { waitUntil: "networkidle" });
  await page.evaluate(() => document.querySelectorAll("dialog[open]:not(.story-viewer)").forEach((d) => d.close()));
  const original = page.url();
  const startLen = await page.evaluate(() => history.length);
  await page.getByRole("button", { name: /SampleAlpha's recent community posts/ }).click();
  await viewer(page).getByText(/SampleAlpha post/).first().waitFor();
  await page.goBack();
  await page.waitForFunction(() => !document.querySelector("dialog.story-viewer[open]"), null, { timeout: 8000 }).catch(() => fail("Back did not close"));
  if (page.url() !== original) fail(`after Back: ${page.url()} (expected ${original})`);
  await page.goForward();
  await page.waitForTimeout(800);
  if (page.url() !== original) fail(`after Forward: ${page.url()} (expected ${original})`);
  if (await viewer(page).count()) fail("Forward reopened the viewer");
  await page.getByRole("button", { name: /SampleAlpha's recent community posts/ }).click();
  await viewer(page).getByText(/SampleAlpha post/).first().waitFor();
  await page.getByRole("button", { name: "Close recent posts" }).click();
  await page.waitForTimeout(500);
  if (page.url() !== original) fail(`after reopen and close: ${page.url()} (expected ${original})`);
  if ((await page.evaluate(() => history.length)) > startLen + 1) fail("story history entries accumulated");
  if (!(await page.evaluate(() => document.activeElement?.closest(".community-stories") !== null))) fail("focus did not return to the rail");
});

await open("Back, then Forward, then reopen: exact URL and focus each time", {}, async ({ page, fail }) => {
  const base = page.url();
  await page.getByRole("button", { name: /SampleAlpha's recent community posts/ }).click();
  await viewer(page).getByText("SampleAlpha post 1").waitFor();
  await page.goBack();
  await page.waitForFunction(() => !document.querySelector("dialog.story-viewer[open]"), null, { timeout: 8000 }).catch(() => fail("Back did not close the viewer"));
  if (page.url() !== base) fail(`after Back the URL is ${page.url()}, not ${base}`);
  await page.goForward();
  await page.waitForTimeout(800);
  if (await viewer(page).count()) fail("Forward reopened the viewer");
  if (page.url() !== base) fail(`after Forward the URL is ${page.url()}, not ${base} (stale #story left)`);
  await page.getByRole("button", { name: /SampleAlpha's recent community posts/ }).click();
  await viewer(page).getByText(/SampleAlpha post/).first().waitFor().catch(() => fail("reopen after Forward failed"));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  if (await viewer(page).count()) fail("Escape after reopen did not close");
  if (page.url() !== base) fail(`after reopen and close the URL is ${page.url()}, not ${base}`);
  if (!(await page.evaluate(() => document.activeElement?.closest(".community-stories") !== null))) fail("focus did not return to the story rail");
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

// Instagram-style taps: right half forward one post, left half back one; no wrap at either end.
const tapAt = async (page, side) => {
  const box = await viewer(page).locator(".story-viewer-body").boundingBox();
  // Tap on the post's content (its label line), not on a control, as a person would.
  const label = await viewer(page).locator(".story-label").boundingBox();
  await page.mouse.click(box.x + box.width * (side === "right" ? 0.85 : 0.15), label.y + label.height / 2);
  await page.waitForTimeout(200);
};
const showing = async (page) => (await viewer(page).locator(".story-post h2").innerText().catch(() => "(photo)"));
for (const width of [390, 1280])
  await open(`@${width}: tap right for the next post, left for the previous, one step per tap, no wrap`, { width }, async ({ page, fail }) => {
    await page.getByRole("button", { name: /SampleAlpha's recent community posts/ }).click();
    await viewer(page).getByText("SampleAlpha post 1").waitFor();
    await tapAt(page, "left");
    if ((await showing(page)) !== "SampleAlpha post 1") fail("a left tap on the first post moved (wrapped)");
    await tapAt(page, "right");
    if ((await showing(page)) !== "SampleAlpha post 2") fail(`right tap showed "${await showing(page)}", expected the next post`);
    await tapAt(page, "right");
    if ((await showing(page)) !== "(photo)") fail("right tap did not cross to the next member's first post");
    if ((await heading(page)) !== "SampleBravo") fail("next member's name not shown after crossing");
    await tapAt(page, "left");
    if ((await showing(page)) !== "SampleAlpha post 2") fail(`left tap showed "${await showing(page)}", expected the previous member's last post`);
    await tapAt(page, "right");
    await tapAt(page, "right");
    if ((await showing(page)) !== "SampleBravo post 4") fail("did not reach the last post by tapping");
    await tapAt(page, "right");
    if ((await showing(page)) !== "SampleBravo post 4") fail("a right tap on the last post moved (wrapped)");
    if (!(await viewer(page).count())) fail("tapping past the end closed the viewer");
  });

await open("taps never fire from controls, links, selection drags or the nav buttons", {}, async ({ page, fail }) => {
  await page.getByRole("button", { name: /SampleAlpha's recent community posts/ }).click();
  await viewer(page).getByText("SampleAlpha post 1").waitFor();
  // The Next button moves exactly one post (no extra step from the tap area).
  await viewer(page).getByRole("button", { name: /Next post/ }).click();
  await page.waitForTimeout(200);
  if ((await showing(page)) !== "SampleAlpha post 2") fail(`Next button moved to "${await showing(page)}" (double navigation?)`);
  // The action area (discussion link and Gambly note) is not a tap target.
  await viewer(page).locator(".story-gambly").click({ position: { x: 300, y: 5 } });
  if ((await showing(page)) !== "SampleAlpha post 2") fail("tapping the action area navigated");
  // Dragging across the text to select it (or to scroll) is not a tap.
  const text = await viewer(page).locator(".story-text").boundingBox();
  await page.mouse.move(text.x + 5, text.y + text.height / 2);
  await page.mouse.down();
  await page.mouse.move(text.x + text.width - 5, text.y + text.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  if ((await showing(page)) !== "SampleAlpha post 2") fail("a text-selection drag navigated");
  // With text selected, a click inside the post does not navigate either (it clears the selection first).
  await page.evaluate(() => {
    const el = document.querySelector("dialog.story-viewer .story-text");
    const r = document.createRange(); r.selectNodeContents(el);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  });
  await viewer(page).locator(".story-text").dispatchEvent("click", { button: 0, clientX: 300, clientY: 300 });
  await page.waitForTimeout(150);
  if ((await showing(page)) !== "SampleAlpha post 2") fail("a click while text is selected navigated");
  // Close still closes; it is never treated as a tap.
  await viewer(page).getByRole("button", { name: "Close recent posts" }).click();
  await viewer(page).waitFor({ state: "detached" }).catch(() => {});
  if (await viewer(page).count()) fail("Close did not close the viewer");
});

for (const width of [390, 1280]) {
  await open(`original expiry removes open content and rail at ${width}px`, { width, expiry: true, freeze: true }, async ({ page, fail }) => {
    await page.getByRole("button", { name: /SampleAlpha's recent community posts/ }).click();
    await viewer(page).getByText("SampleAlpha post 1").waitFor();
    await page.clock.fastForward(6000);
    await page.waitForTimeout(100);
    // Intended negative: simulate an implementation that left the expired article mounted.
    if (process.env.UI_SMOKE_NEGATIVE === "missing-expiry") await page.evaluate(() => {
      const article = document.createElement("article"); article.className = "story-post";
      const title = document.createElement("h2"); title.textContent = "SampleAlpha post 1";
      article.append(title); document.querySelector(".story-viewer-body")?.append(article);
    });
    if (await viewer(page).getByText("SampleAlpha post 1", { exact: true }).count()) fail("expired story remained visible");
    await viewer(page).getByText("SampleAlpha post 2").waitFor();
    // Device wall time cannot grant or reset the server-created lifetime.
    await page.evaluate(() => { Date.now = () => 0; });
    await page.clock.fastForward(20000);
    if (await viewer(page).locator(".story-post").count()) fail("expired story remained visible after all original expiries");
    if (await page.locator(".community-story").count()) fail("expired rail survived original expiry");
    await page.screenshot({ path: `${evidenceRoot}/story-expiry-${width}.png`, fullPage: true });
  });
}
await open("unknown server time never opens or marks a story read", { clockFailure: true }, async ({ page, fail }) => {
  if (await page.locator(".community-story").count()) fail("untrusted clock exposed a story ring");
  if ((await read(page)).length) fail("unknown clock marked a story read");
});
await open("hidden content stays hidden until resume obtains a new clock", {}, async ({ page, fail, ctx }) => {
  await page.getByRole("button", { name: /SampleAlpha's recent community posts/ }).click();
  await viewer(page).getByText("SampleAlpha post 1").waitFor();
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(100);
  if (await viewer(page).locator(".story-post").count()) fail("hidden window retained story content");
  await ctx.route("**/rest/v1/rpc/community_story_clock*", async r => { await new Promise(resolve => setTimeout(resolve,1000)); return r.fulfill({ status: 500, json: { message: "Synthetic failure" } }); });
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(100);
  if (await viewer(page).locator(".story-post").count()) fail("resume exposed content before clock validation");
});
await open("lease expiry and resume resync before displaying content", { freeze: true }, async ({ page, fail, ctx }) => {
  await page.getByRole("button", { name: /SampleAlpha's recent community posts/ }).click();
  await viewer(page).getByText("SampleAlpha post 1").waitFor();
  // Revoke the clock endpoint: the current lease expires, with no new trusted anchor.
  await ctx.route("**/rest/v1/rpc/community_story_clock*", r => r.fulfill({ status: 500, json: { message: "Synthetic outage" } }));
  await page.clock.fastForward(300000);
  await viewer(page).getByText("Story time could not be verified. Close and reopen to retry.").waitFor();
  if (await viewer(page).locator(".story-post").count()) fail("expired clock lease exposed content");
  await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
  if (await viewer(page).locator(".story-post").count()) fail("resume restored content without a trusted clock");
});

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} story viewer failure(s):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nStory viewer acceptance passed.");

// Story viewer auto-advance (LOBBY-POLISH-02 B): Instagram-style timing with Elo's safeguards.
// Synthetic posts only (same shapes as story-viewer.mjs); time is driven by Playwright's fake clock,
// so "6 seconds" is simulated, not waited.
// Needs the app on :3100 built with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 and
// scripts/ui-smoke/stub.mjs running (see check.mjs).
// Negative control: UI_SMOKE_NEGATIVE=ignore-hold swallows the press on the post area, so
// "press-and-hold pauses" must fail.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");

const BASE = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const NEG = process.env.UI_SMOKE_NEGATIVE || "";
const UID = "00000000-0000-0000-0000-000000000001";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const post = (n, user, author, minutes, extra = {}) => ({
  id: id(n), user_id: user, author_name: author, title: `${author} post ${n}`, body: `Sample body ${n}.`,
  sport: "nfl", kind: "talk", legs: [], stake: null, created_at: new Date(Date.UTC(2026, 9, 14, 1, minutes)).toISOString(),
  reactions: 0, reacted: false, comments: 0, following: false, photo_path: null, ...extra,
});
const LONG = Array.from({ length: 260 }, (_, i) => `word${i}`).join(" ");
const makePosts = ({ long = false } = {}) => [
  post(1, A, "SampleAlpha", 10, long ? { body: LONG, legs: ["Sample leg one", "Sample leg two", "Sample leg three"] } : {}),
  post(2, A, "SampleAlpha", 40),
  // Photo-only: its photo never loads in this fixture, so it must never time out or advance.
  post(3, B, "SampleBravo", 5, { title: "", body: "", photo_path: "sample/photo-3.png" }),
  post(4, B, "SampleBravo", 20),
];

const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {});
const failures = [];
// A real 1x1 PNG, so photos can actually load when a case asks for it.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
// photo(replacement, route): answer an image request; `replacement` is true once the case has
// triggered its re-check (the feed and the viewer's first image both load before that). detail(pid, n): the nth
// community_post answer for a post (e.g. a changed photo path on re-check).
async function open(name, { width = 390, long = false, photo = null, detail = null } = {}, run) {
  // UI_SMOKE_ONLY=<text> runs just the matching cases (local debugging).
  if (process.env.UI_SMOKE_ONLY && !name.includes(process.env.UI_SMOKE_ONLY)) return;
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: "reduce" });
  const rows = makePosts({ long });
  const rail = [
    { post_id: id(2), username: "SampleAlpha", avatar: null, sport: "nfl", created_at: rows[1].created_at },
    { post_id: id(4), username: "SampleBravo", avatar: null, sport: "nfl", created_at: rows[3].created_at },
  ];
  const baseTime = Date.UTC(2026, 9, 14, 2);
  await ctx.route("**/rest/v1/rpc/community_story_clock*", async (r) => {
    const elapsed = await r.request().frame().evaluate(() => performance.now()).catch(() => 0);
    return r.fulfill({ json: { version: 1, server_now: new Date(baseTime + elapsed).toISOString() } });
  });
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
  if (NEG === "ignore-hold")
    await ctx.addInitScript(() => {
      document.addEventListener("pointerdown", (e) => {
        if (e.target instanceof Element && e.target.closest(".story-viewer-body")) e.stopPropagation();
      }, true);
    });
  await ctx.route("**/rest/v1/rpc/community_activity*", (r) => r.fulfill({ json: rail }));
  await ctx.route("**/rest/v1/rpc/community_feed*", (r) => r.fulfill({ json: rows }));
  const detailCalls = {};
  await ctx.route("**/rest/v1/rpc/community_post*", (r) => {
    const pid = r.request().postDataJSON()?.p_id;
    detailCalls[pid] = (detailCalls[pid] || 0) + 1;
    const row = rows.find((p) => p.id === pid) ?? null;
    return r.fulfill({ json: detail && row ? detail(row, detailCalls[pid]) : row });
  });
  await ctx.route("**/rest/v1/rpc/notification_inbox*", (r) => r.fulfill({ json: { items: [], snapshot_at: new Date().toISOString() } }));
  // Each signing gets its own URL, so a remounted image is a new request, never a cache hit.
  let signs = 0;
  const signed = [];
  await ctx.route("**/storage/v1/object/sign/**", (r) => {
    signed.push(r.request().url());
    return r.fulfill({ json: { signedURL: `/object/sign/community-photos/sample/photo-3.png?token=smoke-${++signs}` } });
  });
  const phase = { recheck: false };
  await ctx.route("**/storage/v1/object/sign/community-photos/**", (r) => {
    if (r.request().method() !== "GET") return r.fallback();
    if (!photo) return r.fulfill({ status: 404, body: "" });
    return photo(phase.recheck, r);
  });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date("2026-10-14T02:00:00Z") });
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const before = failures.length;
  const fail = (m) => failures.push(`${name}: ${m}`);
  try {
    await page.goto(BASE + "/community", { waitUntil: "networkidle" });
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
    await page.evaluate(() => document.querySelectorAll("dialog[open]:not(.story-viewer)").forEach((d) => d.close()));
    await run({ page, fail, ctx, signed, phase });
  } catch (e) {
    fail(`threw · ${String(e).split("\n")[0].slice(0, 200)} @ ${(e.stack || "").match(/story-autoplay\.mjs:(\d+)/)?.[1] ?? "?"}`);
  }
  if (errors.length) fail(`page error · ${errors[0].slice(0, 160)}`);
  console.log(`${failures.length > before ? "FAIL" : "ok  "} ${name}`);
  await ctx.close();
}
const viewer = (page) => page.locator("dialog.story-viewer[open]");
const showing = (page) => viewer(page).locator(".story-post h2").innerText().catch(() => null);
const openAlpha = async (page) => {
  await page.getByRole("button", { name: /SampleAlpha's recent community posts/ }).click();
  await viewer(page).getByText("SampleAlpha post 1").waitFor();
};
const run = (page, ms) => page.clock.runFor(ms);
const progress = (page) => viewer(page).locator(".story-segments li.current").evaluate((li) => Number(li.style.getPropertyValue("--story-progress") || 0));

for (const width of [360, 390, 1280])
  await open(`@${width}: plays each post, then the next; waits on a photo that hasn't loaded; closes after the last`, { width }, async ({ page, fail }) => {
    await openAlpha(page);
    await run(page, 3000);
    if (process.env.UI_SMOKE_SHOTS) await page.screenshot({ path: `${process.env.UI_SMOKE_SHOTS}/story-${width}-midplay.png` });
    const mid = await progress(page);
    if (!(mid > 0.25 && mid < 0.75)) fail(`segment not filling (progress ${mid} at 3 s of 6)`);
    await run(page, 3800);
    if ((await showing(page)) !== "SampleAlpha post 2") fail(`after 6.8 s showing "${await showing(page)}", expected post 2`);
    await run(page, 6800);
    // Next member: SampleBravo's photo-only post, whose photo never loads.
    await page.waitForFunction(() => /SampleBravo/.test(document.querySelector("dialog.story-viewer .story-viewer-meta b")?.textContent || ""), null, { timeout: 5000 }).catch(() => fail("did not move on to the next member"));
    await run(page, 20000);
    if (!/SampleBravo/.test(await viewer(page).locator(".story-viewer-meta").innerText()) || (await showing(page)) === "SampleBravo post 4")
      fail("advanced past a photo that never loaded");
    await viewer(page).getByRole("button", { name: /Next post/ }).click();
    await viewer(page).getByText("SampleBravo post 4").waitFor();
    await run(page, 7000);
    const closed = await page.waitForFunction(() => !document.querySelector("dialog.story-viewer[open]"), null, { timeout: 5000 }).then(() => true, () => false);
    if (!closed) fail("did not close after the last post");
  });

await open("press-and-hold pauses; release resumes; a long press doesn't navigate", {}, async ({ page, fail }) => {
  await openAlpha(page);
  const box = await viewer(page).locator(".story-viewer-body").boundingBox();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.4);
  await page.mouse.down();
  await run(page, 12000);
  if ((await showing(page)) !== "SampleAlpha post 1") fail(`press-and-hold did not pause (now "${await showing(page)}")`);
  await page.mouse.up();
  await run(page, 200);
  if ((await showing(page)) !== "SampleAlpha post 1") fail("releasing a long press navigated like a tap");
  await run(page, 6800);
  if ((await showing(page)) !== "SampleAlpha post 2") fail("did not resume after release");
});

await open("Pause control and Space hold the post; Play resumes", {}, async ({ page, fail }) => {
  await openAlpha(page);
  const pause = viewer(page).getByRole("button", { name: /Pause/ });
  await pause.click();
  if ((await viewer(page).getByRole("button", { name: /Play/ }).getAttribute("aria-pressed")) !== "true") fail("Pause not announced as pressed");
  await run(page, 15000);
  if ((await showing(page)) !== "SampleAlpha post 1") fail("Pause did not hold the post");
  await viewer(page).getByRole("button", { name: /Play/ }).click();
  await page.locator("body").press(" ").catch(() => {});
  // Space toggled back to paused.
  await run(page, 10000);
  if ((await showing(page)) !== "SampleAlpha post 1") fail("Space did not pause");
  await page.keyboard.press("Space");
  await run(page, 7000);
  if ((await showing(page)) !== "SampleAlpha post 2") fail("Space did not resume");
});

await open("a hidden tab and focus on the post's actions hold the timer", {}, async ({ page, fail }) => {
  await openAlpha(page);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await run(page, 12000);
  // While hidden the viewer may also withhold content until it re-checks story time on return;
  // what matters is that it never moved on.
  if ((await showing(page)) === "SampleAlpha post 2") fail("advanced while the tab was hidden");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await run(page, 500);
  await viewer(page).getByText("SampleAlpha post 1").waitFor({ timeout: 8000 }).catch(() => fail("post 1 did not return when the tab came back"));
  await viewer(page).getByRole("link", { name: /View discussion/ }).focus();
  await run(page, 12000);
  if ((await showing(page)) !== "SampleAlpha post 1") fail("advanced while View discussion had focus");
  // Focus leaving the actions entirely (not onto a header control, which holds too) resumes.
  await page.evaluate(() => document.activeElement?.blur());
  await run(page, 7000);
  if ((await showing(page)) !== "SampleAlpha post 2") fail("did not resume once focus left the post's actions");
});

await open("a long post waits until it has been read to the end", { long: true }, async ({ page, fail }) => {
  await openAlpha(page);
  await run(page, 90000);
  if ((await showing(page)) !== "SampleAlpha post 1") fail("cut off a long post that hadn't been scrolled to its end");
  // The browser delivers scroll events on its next real rendering frame, not on the fake clock. On
  // a slow runner the fast-forward below could finish before that, so the viewer would still see
  // the post as unread. Dispatch the scroll now and give React real time to apply it first.
  await viewer(page).locator(".story-viewer-body").evaluate((el) => {
    el.scrollTo(0, el.scrollHeight);
    el.dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(250);
  // 260 words + title + legs = 272 words ≈ 83.1 s of reading time once the end has been reached.
  // Check both sides of it: still up just before, moved on just after (but before post 2's own 6 s).
  await run(page, 79000);
  if ((await showing(page)) !== "SampleAlpha post 1") fail(`moved on before the long post's reading time (now "${await showing(page)}")`);
  await run(page, 7000);
  if ((await showing(page)) !== "SampleAlpha post 2") fail("did not move on after the long post was read");
});

await open("signing out mid-play closes the viewer and never shows the old account's next post", {}, async ({ page, fail, ctx }) => {
  await openAlpha(page);
  await run(page, 3000);
  const other = await ctx.newPage();
  await other.goto(BASE + "/methodology");
  await other.evaluate(() => {
    sessionStorage.setItem("vq-smoke-signed-out", "1");
    localStorage.removeItem("sb-127-auth-token");
    new BroadcastChannel("sb-127-auth-token").postMessage({ event: "SIGNED_OUT", session: null });
  });
  await run(page, 500);
  const gone = await page.waitForFunction(() => !document.querySelector("dialog.story-viewer[open]"), null, { timeout: 10000 }).then(() => true, () => false);
  if (!gone) fail("viewer stayed open after sign-out");
  await run(page, 8000);
  if (await page.getByText("SampleAlpha post 2").count()) fail("old account's next post appeared after sign-out");
});

await open("controls: Previous, Next, Pause, Close in the header in that order; no bottom bar; keyboard", {}, async ({ page, fail }) => {
  await openAlpha(page);
  if (await viewer(page).locator(".story-nav").count()) fail("bottom Previous/Next bar still rendered");
  const names = await viewer(page).locator(".story-viewer-head button").evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label")));
  const want = [/^Previous post$/, /^Next post/, /^Pause/, /^Close recent posts$/];
  if (names.length !== 4 || !want.every((re, i) => re.test(names[i] || ""))) fail(`header controls ${JSON.stringify(names)}`);
  const small = await viewer(page).locator(".story-viewer-head button").evaluateAll((bs) => bs.filter((b) => b.getBoundingClientRect().height < 44 || b.getBoundingClientRect().width < 44).length);
  if (small) fail(`${small} header control(s) under 44px`);
  if (!(await viewer(page).getByRole("button", { name: "Previous post" }).isDisabled())) fail("Previous enabled on the first post");
  await page.keyboard.press("ArrowRight");
  await viewer(page).getByText("SampleAlpha post 2").waitFor().catch(() => fail("ArrowRight did not move on"));
  await page.keyboard.press("ArrowLeft");
  await viewer(page).getByText("SampleAlpha post 1").waitFor().catch(() => fail("ArrowLeft did not move back"));
  if (!/1 of 2/.test(await viewer(page).locator(".story-viewer-meta").innerText())) fail("position (1 of 2) not shown");
  await page.keyboard.press("Escape");
  const closed = await page.waitForFunction(() => !document.querySelector("dialog.story-viewer[open]"), null, { timeout: 5000 }).then(() => true, () => false);
  if (!closed) fail("Escape did not close");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  if (overflow) fail("horizontal overflow");
});

const held = (page) => viewer(page).getByRole("button", { name: /^Play/ }).count().then((n) => n > 0);
for (const entry of ["pointer", "keyboard"])
  await open(`${entry} entry: autoplay runs despite the dialog's initial focus; Tab onto a header control holds it`, {}, async ({ page, fail }) => {
    const ring = page.getByRole("button", { name: /SampleAlpha's recent community posts/ });
    if (entry === "keyboard") {
      await ring.focus();
      await page.keyboard.press("Enter");
    } else await ring.click();
    await viewer(page).getByText("SampleAlpha post 1").waitFor();
    // The modal's own initial focus is not a reason to stop.
    await run(page, 6800);
    if ((await showing(page)) !== "SampleAlpha post 2") fail(`${entry} entry: autoplay did not start (still "${await showing(page)}")`);
    // Deliberate keyboard focus on a header control holds the post, without moving or closing.
    // (Initial focus sits on Close, the last header control; Shift+Tab moves back onto Pause.)
    await page.keyboard.press("Shift+Tab");
    const onHeader = await page.evaluate(() => Boolean(document.activeElement?.closest(".story-viewer-head")));
    if (!onHeader) fail("Tab did not land on a header control");
    await run(page, 12000);
    if (!(await viewer(page).count())) fail("viewer closed while a header control had focus");
    if ((await showing(page)) !== "SampleAlpha post 2") fail(`advanced while a header control had focus ("${await showing(page)}")`);
    if (!(await held(page))) fail("Pause/Play did not report the hold (expected Play, pressed)");
    // Explicit Play wins while focus stays on the header; pressing again pauses.
    const play = viewer(page).getByRole("button", { name: /^Play/ });
    await play.focus();
    await page.keyboard.press("Enter");
    if ((await viewer(page).getByRole("button", { name: /^Pause/ }).getAttribute("aria-pressed")) !== "false") fail("Play did not resume");
    await viewer(page).getByRole("button", { name: /^Pause/ }).focus();
    await page.keyboard.press("Enter");
    await run(page, 9000);
    if ((await showing(page)) !== "SampleAlpha post 2") fail("pressing Pause again did not pause");
    await page.keyboard.press("Enter"); // Play
    await run(page, 7000);
    if ((await showing(page)) === "SampleAlpha post 2") fail("explicit Play with focus on the header did not move on");
  });
await open("focus leaving the header controls resumes", {}, async ({ page, fail }) => {
  await openAlpha(page);
  await page.keyboard.press("Shift+Tab");
  await run(page, 9000);
  if ((await showing(page)) !== "SampleAlpha post 1") fail("advanced while a header control had focus");
  await page.evaluate(() => document.activeElement?.blur());
  await run(page, 7000);
  if ((await showing(page)) !== "SampleAlpha post 2") fail("did not resume after focus left the header");
});

// Photo readiness belongs to the image instance on screen. Bravo's first post is photo-only.
const openBravo = async (page) => {
  await page.getByRole("button", { name: /SampleBravo's recent community posts/ }).click();
  for (let i = 0; i < 40 && !(await viewer(page).getByRole("button", { name: "Open full photo" }).count()); i++) await run(page, 100);
  if (!(await viewer(page).getByRole("button", { name: "Open full photo" }).count()))
    console.log("PHOTO", JSON.stringify(await viewer(page).evaluate((d) => [...d.querySelectorAll("img")].map((i) => [i.src.slice(-40), i.complete, i.naturalWidth]).concat([d.innerText.slice(0, 120)]))));
  await viewer(page).getByRole("button", { name: "Open full photo" }).waitFor();
};
const recheck = (page, phase) => {
  phase.recheck = true;
  return page.evaluate(() => window.dispatchEvent(new Event("focus")));
};
const onBravoPhoto = async (page) =>
  /SampleBravo/.test(await viewer(page).locator(".story-viewer-meta").innerText().catch(() => "")) && (await showing(page)) !== "SampleBravo post 4";
function gate() {
  let release;
  const wait = new Promise((r) => (release = r));
  return { wait, release: () => release() };
}
for (const variant of ["same photo", "changed photo"]) {
  const g = gate();
  const changed = { on: false };
  await open(`re-checked photo (${variant}): no advance until the new image loads`, {
    photo: async (replacement, r) => {
      if (replacement) await g.wait;
      return r.fulfill({ status: 200, contentType: "image/png", body: PNG }).catch(() => {});
    },
    detail: (row) => (variant === "changed photo" && row.id === id(3) && changed.on ? { ...row, photo_path: "sample/photo-3b.png" } : row),
  }, async ({ page, fail, signed, phase }) => {
    await openBravo(page);
    await run(page, 3000);
    changed.on = true;
    await recheck(page, phase);
    await run(page, 300);
    // The replacement image is held well past the 3 s left of this post.
    await run(page, 12000);
    if (!(await onBravoPhoto(page))) fail("advanced before the re-checked image loaded");
    if (variant === "changed photo" && !signed.some((u) => /photo-3b/.test(decodeURIComponent(u)))) fail("changed photo path was never requested");
    g.release();
    await viewer(page).getByRole("button", { name: "Open full photo" }).waitFor().catch(() => fail("replacement image never reported loaded"));
    await run(page, 3500);
    if ((await showing(page)) !== "SampleBravo post 4") fail("did not move on once the current image loaded");
  });
}
await open("re-checked photo that now fails: never advances", {
  photo: (replacement, r) => (replacement ? r.fulfill({ status: 404, body: "" }) : r.fulfill({ status: 200, contentType: "image/png", body: PNG })),
}, async ({ page, fail, phase }) => {
  await openBravo(page);
  await run(page, 3000);
  await recheck(page, phase);
  await run(page, 20000);
  if (!(await onBravoPhoto(page))) fail("advanced although the current image failed to load");
});
{
  const g = gate();
  await open("account change while the re-checked image is pending: closes, never shows the old account's next post", {
    photo: async (replacement, r) => {
      if (replacement) await g.wait;
      return r.fulfill({ status: 200, contentType: "image/png", body: PNG }).catch(() => {});
    },
  }, async ({ page, fail, ctx, phase }) => {
    await openBravo(page);
    await run(page, 3000);
    await recheck(page, phase);
    await run(page, 300);
    const other = await ctx.newPage();
    await other.goto(BASE + "/methodology");
    await other.evaluate(() => {
      sessionStorage.setItem("vq-smoke-signed-out", "1");
      localStorage.removeItem("sb-127-auth-token");
      new BroadcastChannel("sb-127-auth-token").postMessage({ event: "SIGNED_OUT", session: null });
    });
    await run(page, 500);
    const gone = await page.waitForFunction(() => !document.querySelector("dialog.story-viewer[open]"), null, { timeout: 10000 }).then(() => true, () => false);
    if (!gone) fail("viewer stayed open after sign-out");
    g.release();
    await run(page, 8000);
    if (await page.getByText("SampleBravo post 4").count()) fail("old account's next post appeared after sign-out");
  });
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nStory autoplay acceptance passed.");

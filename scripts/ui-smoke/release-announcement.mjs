// Synthetic accounts and receipts only. No production data or external delivery.
import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const source = readFileSync("src/lib/release-announcement.ts", "utf8");
const id = source.match(/RELEASE_ANNOUNCEMENT_ID = "([^"]+)"/)[1];
const title = source.match(/RELEASE_ANNOUNCEMENT_TITLE =\s*"([^"]+)"/)[1];
const body = source.match(/RELEASE_ANNOUNCEMENT_BODY = `([\s\S]*?)`/)[1];
const refreshVersion = readFileSync(
  "src/components/app-refresh-notice.tsx",
  "utf8",
).match(/const VERSION = "([^"]+)"/)[1];
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE,
  headless: true,
  args: ["--no-sandbox"],
});
const receipts = new Set();
const writes = [];
const uid = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const session = (user) => ({
  access_token: "smoke",
  refresh_token: "smoke",
  token_type: "bearer",
  expires_at: Math.floor(Date.now() / 1000) + 86400,
  user: {
    id: user,
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: { vq_welcome_version: 1 },
  },
});
async function setup(width, user, theme = "light") {
  let failLoad = false,
    failWrite = false,
    completeProfile = true;
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    reducedMotion: "reduce",
  });
  await ctx.addInitScript(
    ({ user, token, refreshVersion, theme }) => {
      sessionStorage.setItem("vq-prompt-shown", "fixture");
      localStorage.setItem("vq-theme", theme);
      if (user) {
        localStorage.setItem("sb-127-auth-token", JSON.stringify(token));
        localStorage.setItem(`vq-app-refresh:${user}`, refreshVersion);
      }
    },
    { user, token: session(user), refreshVersion, theme },
  );
  await ctx.route("**/rest/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/app_updates"))
      return route.fulfill(
        failLoad
          ? { status: 503, json: { message: "Synthetic read failure" } }
          : { json: [{ id, title, body, created_at: "2026-11-08T00:00:00Z" }] },
      );
    if (url.pathname.endsWith("/app_update_reads")) {
      if (route.request().method() === "POST") {
        const rows = route.request().postDataJSON();
        if (failWrite)
          return route.fulfill({
            status: 503,
            json: { message: "Synthetic write failure" },
          });
        for (const row of rows) {
          assert.equal(row.update_id, id);
          receipts.add(row.user_id);
          writes.push(row.user_id);
        }
        return route.fulfill({ status: 201, json: null });
      }
      const account = url.searchParams.get("user_id")?.replace(/^eq\./, "");
      return route.fulfill({
        json: receipts.has(account) ? [{ update_id: id }] : [],
      });
    }
    if (url.pathname.endsWith("/community_profiles"))
      return route.fulfill({
        json: {
          username: completeProfile ? "FixtureUser" : "Member_12345678",
          avatar: "/brand/vq-icon-192.png",
          visible: true,
        },
      });
    if (url.pathname.endsWith("/age_verification_status"))
      return route.fulfill({ json: { required: false, verified: true } });
    if (url.pathname.endsWith("/membership_status"))
      return route.fulfill({ json: { allowed: true, admin: false } });
    if (url.pathname.endsWith("/notification_counts"))
      return route.fulfill({ json: { unread: 0, unviewed: 0, messages: 0 } });
    if (url.pathname.includes("/rpc/")) return route.fulfill({ json: {} });
    return route.fulfill({ json: [] });
  });
  const page = await ctx.newPage();
  return {
    ctx,
    page,
    loadFailure(value) {
      failLoad = value;
    },
    profileComplete(value) {
      completeProfile = value;
    },
    writeFailure(value) {
      failWrite = value;
    },
  };
}
const selector = `dialog[data-release-announcement="${id}"]`;
mkdirSync("artifacts/release-announcement", { recursive: true });
try {
  for (const width of [390, 1280]) {
    receipts.clear();
    writes.length = 0;
    const { ctx, page } = await setup(
      width,
      uid,
      width === 390 ? "dark" : "light",
    );
    await page.goto(`${base}/about`);
    const dialog = page.locator(selector);
    await dialog.waitFor({ state: "visible", timeout: 20000 });
    assert.match(await dialog.innerText(), /Tap Edit profile/);
    assert.match(await dialog.innerText(), /Instagram and X links/);
    assert.equal(
      await dialog.evaluate(
        (el) => el.getBoundingClientRect().width <= innerWidth,
      ),
      true,
      "modal fits viewport",
    );
    await page.waitForFunction(
      () => document.querySelector("dialog[data-release-announcement]")?.open,
    );
    await page.screenshot({
      path: `artifacts/release-announcement/${width}.png`,
      fullPage: true,
    });
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
    await page.reload();
    await page.waitForTimeout(4500);
    assert.equal(
      await dialog.isVisible(),
      false,
      "reload must not repeat a recorded release",
    );
    assert.equal(
      writes.filter((x) => x === uid).length,
      1,
      "one persisted receipt per account",
    );
    await ctx.close();
    const second = await setup(width, uid);
    await second.page.goto(`${base}/about`);
    await second.page.waitForTimeout(4500);
    assert.equal(
      await second.page.locator(selector).isVisible(),
      false,
      "other device honors account receipt",
    );
    await second.ctx.close();
  }
  receipts.clear();
  writes.length = 0;
  const retry = await setup(390, other);
  retry.loadFailure(true);
  await retry.page.goto(`${base}/about`);
  await retry.page.waitForTimeout(4500);
  assert.equal(
    await retry.page.locator(selector).isVisible(),
    false,
    "read failure must not show unverified update",
  );
  retry.loadFailure(false);
  retry.writeFailure(true);
  await retry.page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await retry.page
    .locator(selector)
    .waitFor({ state: "visible", timeout: 15000 });
  await retry.page.getByRole("button", { name: "Retry saving" }).waitFor();
  retry.writeFailure(false);
  await retry.page.getByRole("button", { name: "Retry saving" }).click();
  await retry.page
    .getByRole("button", { name: "Retry saving" })
    .waitFor({ state: "hidden" });
  await retry.page.keyboard.press("Escape");
  await retry.page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await retry.page.waitForTimeout(4000);
  assert.equal(
    await retry.page.locator(selector).isVisible(),
    false,
    "Escape and refresh do not reopen",
  );
  assert.deepEqual(writes, [other]);
  await retry.ctx.close();
  receipts.clear();
  writes.length = 0;
  const defer = await setup(390, uid);
  await defer.page.goto(`${base}/about`);
  await defer.page.evaluate(() => {
    const d = document.createElement("dialog");
    d.id = "required-fixture";
    document.body.append(d);
    d.showModal();
  });
  await defer.page.waitForTimeout(4500);
  assert.equal(
    await defer.page.locator(selector).isVisible(),
    false,
    "required dialog takes precedence",
  );
  assert.equal(writes.length, 0, "deferred release not marked read");
  await defer.page.evaluate(() =>
    document.getElementById("required-fixture").close(),
  );
  await defer.page
    .locator(selector)
    .waitFor({ state: "visible", timeout: 15000 });
  await defer.ctx.close();
  receipts.clear();
  writes.length = 0;
  const profile = await setup(390, other);
  profile.profileComplete(false);
  await profile.page.goto(`${base}/about`);
  await profile.page.waitForTimeout(4500);
  assert.equal(
    await profile.page.locator(selector).isVisible(),
    false,
    "unfinished profile defers release",
  );
  assert.equal(writes.length, 0, "unfinished profile has no release receipt");
  profile.profileComplete(true);
  await profile.page.evaluate(() =>
    window.dispatchEvent(new Event("vq-community-changed")),
  );
  await profile.page
    .locator(selector)
    .waitFor({ state: "visible", timeout: 15000 });
  await profile.ctx.close();
  const anon = await setup(390, null);
  await anon.page.goto(`${base}/about`);
  await anon.page.waitForTimeout(4500);
  assert.equal(
    await anon.page.locator(selector).isVisible(),
    false,
    "signed-out visitors stay outside account announcements",
  );
  await anon.ctx.close();
  console.log(
    "PASS: release announcement phone/desktop, cross-device receipts, no repeats, read/write retry, Escape, required-dialog deferral and signed-out guard",
  );
} finally {
  await browser.close();
}

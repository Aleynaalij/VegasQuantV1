// Synthetic account UI regression; needs the app/stub setup described in check.mjs.
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
import assert from "node:assert/strict";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
});
await context.addInitScript(() => {
  const exp = Math.floor(Date.now() / 1000) + 86400;
  localStorage.setItem(
    "sb-127-auth-token",
    JSON.stringify({
      access_token: "smoke",
      refresh_token: "smoke",
      token_type: "bearer",
      expires_in: 86400,
      expires_at: exp,
      user: {
        id: "00000000-0000-0000-0000-000000000001",
        aud: "authenticated",
        role: "authenticated",
        email: "smoke@example.com",
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-10-01T00:00:00Z",
      },
    }),
  );
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && m.text().includes("same key"))
    errors.push(m.text());
});
let required = false;
await page.route("**/rest/v1/rpc/age_verification_status", (r) =>
  r.fulfill({
    json: { required, verified: false, state: "pending", version: 1 },
  }),
);
await page.route("**/rest/v1/rpc/membership_status", (r) =>
  r.fulfill({
    json: {
      allowed: !required,
      admin: false,
      member_code: "SAMPLE",
      complimentary_premium: true,
      trial_active: false,
      expires_at: null,
    },
  }),
);
await page.route("**/api/age/status", (r) =>
  r.fulfill({
    json: {
      required,
      verified: false,
      state: "pending",
      version: 1,
      provider_available: false,
    },
  }),
);
await page.route("**/api/billing/**", (r) =>
  r.fulfill({
    json: { enabled: false, quotes: [], subscriptions: [], orders: [] },
  }),
);
for (const next of [false, true, false]) {
  required = next;
  await page.goto(
    process.env.ACCOUNT_CHECK_URL || "http://127.0.0.1:3101/membership",
    { waitUntil: "networkidle" },
  );
  await page
    .getByRole("heading", { name: "Verify your age · 21+", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("heading", { name: "Verify your age · 21+", exact: true })
      .count(),
    1,
  );
  if (!required) {
    assert.equal(
      await page
        .getByRole("heading", {
          name: "Your complimentary Premium access",
          exact: true,
        })
        .count(),
      1,
    );
    assert.equal(
      await page
        .getByRole("heading", {
          name: "14 days of Premium, on us",
          exact: true,
        })
        .count(),
      0,
    );
    assert.equal(
      await page
        .getByRole("heading", { name: "Privacy · Delete account", exact: true })
        .count(),
      1,
    );
  }
}
assert.deepEqual(errors, []);
await browser.close();
console.log(
  "Account UI: one age panel in normal/blocked views, existing Premium state and deletion controls retained.",
);

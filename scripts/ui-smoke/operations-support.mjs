import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const base = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE,
});
const id = "00000000-0000-4000-8000-000000000010";
const time = "2026-11-08T10:00:00Z";
const errors = [];
const appVersion = readFileSync(
  "src/components/app-refresh-notice.tsx",
  "utf8",
).match(/const VERSION = "([^"]+)"/)[1];

async function fixture(width, role) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    serviceWorkers: "block",
  });
  await context.addInitScript(
    ({ access, version }) => {
      sessionStorage.setItem("vq-prompt-shown", "fixture");
      if (!access) return;
      const uid = "00000000-0000-4000-8000-000000000001";
      localStorage.setItem(`vq-app-refresh:${uid}`, version);
      localStorage.setItem(
        `vq-push-prompt:${uid}`,
        String(Date.now() + 86400000),
      );
      localStorage.setItem(
        "sb-127-auth-token",
        JSON.stringify({
          access_token: access,
          refresh_token: "fixture",
          expires_at: Math.floor(Date.now() / 1000) + 86400,
          user: {
            id: uid,
            email: "fixture@example.test",
            user_metadata: { vq_welcome_version: 1 },
            app_metadata: {},
          },
        }),
      );
    },
    { access: role, version: appVersion },
  );
  await context.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const result = path.endsWith("age_verification_status")
      ? { required: true, verified: true }
      : path.endsWith("membership_status")
        ? { allowed: true, admin: role === "admin" }
        : path.endsWith("notification_inbox")
          ? { items: [], snapshot_at: time }
          : path.endsWith("community_profiles")
            ? [{ username: "FixtureMember", avatar: "ruby" }]
            : [];
    await route.fulfill({ json: result });
  });
  const calls = [];
  const ticket = {
    id,
    feature: "research",
    symptom: "slow",
    status: "new",
    created_at: time,
    updated_at: time,
  };
  const events = [{ action: "submitted", status: "new", created_at: time }];
  await context.route("**/api/operations", async (route) => {
    const request = route.request();
    assert.equal(request.headers().authorization, `Bearer ${role}`);
    const input = request.postDataJSON();
    calls.push(input);
    if (input.action === "submit")
      return route.fulfill({ json: { state: "submitted", id } });
    if (role !== "admin")
      return route.fulfill({ status: 403, json: { state: "forbidden" } });
    if (input.action === "list")
      return route.fulfill({ json: { state: "ready", tickets: [ticket] } });
    if (input.action === "triage") {
      assert.equal(input.expected, "new");
      ticket.status = "in_review";
      events.push({ action: "triaged", status: "in_review", created_at: time });
    }
    return route.fulfill({ json: { state: "ready", ticket, events } });
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  return { context, page, calls };
}

async function fits(page) {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "no page overflow",
  );
}

try {
  const anonymous = await fixture(390, null);
  await anonymous.page.goto(base + "/admin/operations");
  await anonymous.page.getByText("Sign in to continue.").waitFor();
  assert.equal(
    await anonymous.page.getByRole("region", { name: "Support queue" }).count(),
    0,
  );
  assert.equal(anonymous.calls.length, 0);
  await anonymous.context.close();

  const member = await fixture(390, "member");
  await member.page.goto(base + "/admin/operations");
  await member.page
    .getByText(/requires a current administrator session/)
    .waitFor();
  assert.equal(
    await member.page.getByRole("region", { name: "Support queue" }).count(),
    0,
  );
  await member.page.goto(base + "/support");
  await member.page.getByRole("link", { name: "Report a malfunction" }).click();
  await member.page.getByLabel("Feature").selectOption("research");
  await member.page.getByLabel("Symptom").selectOption("slow");
  await member.page.getByRole("button", { name: "Submit report" }).click();
  await member.page.getByText(/Report received/).waitFor();
  assert.deepEqual(
    member.calls.map((call) => call.action),
    ["list", "submit"],
  );
  await fits(member.page);
  await member.context.close();

  for (const width of [390, 1280]) {
    const admin = await fixture(width, "admin");
    await admin.page.goto(base + "/admin/operations");
    await admin.page.getByRole("button", { name: /Research.*New/ }).click();
    const heading = admin.page.getByRole("heading", { name: "Report details" });
    await heading.waitFor();
    await admin.page.waitForFunction(
      () => document.activeElement?.textContent === "Report details",
    );
    await admin.page.getByRole("button", { name: "Mark in review" }).click();
    await admin.page.getByText("Marked in review", { exact: false }).waitFor();
    await admin.page
      .getByText("Support email not connected", { exact: false })
      .waitFor();
    await fits(admin.page);
    assert.deepEqual(
      admin.calls.map((call) => call.action),
      ["list", "detail", "triage"],
    );
    await admin.context.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Operations browser smoke passed: anonymous/member denial, report receipt, admin triage, 390px and 1280px.",
  );
} finally {
  await browser.close();
}

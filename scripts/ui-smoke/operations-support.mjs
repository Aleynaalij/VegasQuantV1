import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";

const publicationFixtures = JSON.parse(
  execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "-e",
      'const { previewNbaPublicationMonitor } = require("./src/lib/nba-publication-monitor-fixtures"); console.log(JSON.stringify(previewNbaPublicationMonitor()));',
    ],
    { encoding: "utf8" },
  ),
);

const publicationIntelligence = JSON.parse(
  execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "-e",
      'require("./src/lib/nba-publication-intelligence-preview").readPreviewPublicationIntelligence({}).then(result => console.log(JSON.stringify(result)))',
    ],
    { encoding: "utf8" },
  ),
);

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

async function fixture(width, role, intercept) {
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
    const authorization = request.headers().authorization;
    if (authorization === "Bearer different-account")
      return route.fulfill({ status: 403, json: { state: "forbidden" } });
    assert.equal(authorization, `Bearer ${role}`);
    const input = request.postDataJSON();
    calls.push(input);
    const override = await intercept?.(input);
    if (override) return route.fulfill(override).catch(() => {});
    if (input.action === "submit")
      return route.fulfill({ json: { state: "submitted", id } });
    if (role !== "admin")
      return route.fulfill({ status: 403, json: { state: "forbidden" } });
    if (input.action === "list")
      return route.fulfill({
        json: {
          state: "ready",
          tickets: [ticket],
          next: null,
          publicationMonitor: width === 390 ? publicationFixtures : undefined,
          publicationIntelligence:
            width === 390 ? publicationIntelligence : undefined,
          feedHealth: {
            checkedAt: time,
            feeds: [
              {
                provider: "ESPN",
                status: "stale",
                latestAt: time,
                lastSuccessAt: time,
                stale: true,
              },
              {
                provider: "ESPN injuries",
                status: "unavailable",
                latestAt: null,
                lastSuccessAt: null,
                stale: false,
              },
            ],
          },
          release: {
            environment: width === 390 ? "preview" : "production",
            deploymentId: "dpl_fixture12345",
            commit: "a".repeat(40),
            observedAt: time,
          },
        },
      });
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

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function changeAccount(page, signOut) {
  await page.evaluate((out) => {
    const key = "sb-127-auth-token";
    const channel = new BroadcastChannel(key);
    if (out) {
      localStorage.removeItem(key);
      channel.postMessage({ event: "SIGNED_OUT", session: null });
    } else {
      const session = JSON.parse(localStorage.getItem(key));
      session.user.id = "00000000-0000-4000-8000-000000000002";
      session.access_token = "different-account";
      localStorage.setItem(
        `vq-app-refresh:${session.user.id}`,
        localStorage.getItem(
          "vq-app-refresh:00000000-0000-4000-8000-000000000001",
        ),
      );
      localStorage.setItem(key, JSON.stringify(session));
      channel.postMessage({ event: "SIGNED_IN", session });
    }
  }, signOut);
}

async function report(page) {
  await page.getByLabel("Feature").selectOption("research");
  await page.getByLabel("Symptom").selectOption("slow");
  await page.getByRole("button", { name: "Submit report" }).click();
}

async function lateResponse(action, leave) {
  const arrived = deferred(),
    release = deferred();
  const oldTicket = {
    id,
    feature: "records",
    symptom: "slow",
    status: "in_review",
    created_at: time,
    updated_at: time,
  };
  const f = await fixture(
    390,
    action === "submit" ? "member" : "admin",
    async (input) => {
      if (input.action !== action) return;
      arrived.resolve();
      await release.promise;
      if (action === "list")
        return { json: { state: "ready", tickets: [oldTicket], next: null } };
      if (action === "submit") return { json: { state: "submitted", id } };
      return { json: { state: "ready", ticket: oldTicket, events: [] } };
    },
  );
  const page = f.page;
  await page.goto(
    base + (action === "submit" ? "/support/report" : "/admin/operations"),
  );
  if (action === "submit") await report(page);
  if (action === "detail" || action === "triage")
    await page.getByRole("button", { name: /Research.*New/ }).click();
  if (action === "triage")
    await page.getByRole("button", { name: "Mark in review" }).click();
  await arrived.promise;
  if (leave)
    await page.getByRole("link", { name: "Back to Help & Support" }).click();
  else {
    await changeAccount(page, action !== "detail");
    if (action === "submit") {
      await page.getByLabel("Feature").waitFor();
      await page.waitForFunction(
        () => document.querySelector("select")?.value === "",
      );
    } else {
      await page
        .getByText(
          /Account changed|Sign in to continue|requires a current administrator session/,
        )
        .waitFor();
    }
  }
  const finished = page.waitForEvent("response", (response) =>
    response.url().endsWith("/api/operations"),
  );
  release.resolve();
  const response = await finished;
  await response.finished();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  assert.equal(
    await page.getByText(/Report received|Records · Responds slowly/).count(),
    0,
  );
  assert.equal(
    await page.getByRole("heading", { name: "Report details" }).count(),
    0,
  );
  await f.context.close();
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
  assert.equal(
    await anonymous.page
      .getByRole("heading", { name: "Deployment serving this page" })
      .count(),
    0,
  );
  assert.equal(anonymous.calls.length, 0);
  assert.equal(
    await anonymous.page
      .getByRole("heading", { name: /Publication Monitor/ })
      .count(),
    0,
  );
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
  assert.equal(
    await member.page
      .getByRole("heading", { name: "Deployment serving this page" })
      .count(),
    0,
  );
  assert.equal(
    await member.page
      .getByRole("heading", { name: /Publication Monitor/ })
      .count(),
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
    const monitor = admin.page.getByRole("region", {
      name: /Publication Monitor/,
    });
    if (width === 390) {
      const intelligence = admin.page.getByRole("region", {
        name: "NBA publication intelligence",
        exact: true,
      });
      await intelligence
        .getByRole("heading", {
          name: "Synthetic example · PUBLISHED",
          exact: true,
        })
        .waitFor();
      const discrepancy = intelligence.getByRole("region", {
        name: "fixture EVIDENCE_UNAVAILABLE",
        exact: true,
      });
      await discrepancy.getByText(/scheduler without post/).click();
      await discrepancy
        .getByRole("button", { name: "Mark reviewed in this session" })
        .click();
      await discrepancy
        .getByRole("button", { name: "Reviewed in this session" })
        .waitFor();
      await monitor.getByText("Preview · Synthetic evidence").waitFor();
      const missing = monitor.getByText(
        /Scheduler succeeded, publication evidence missing/,
      );
      await missing.click();
      await monitor
        .getByText("EVIDENCE_UNAVAILABLE", { exact: true })
        .waitFor();
      await monitor
        .getByText(/No verified publication or publisher disposition/)
        .waitFor();
      await monitor
        .locator("details[open]")
        .getByText(/4 eligible games/)
        .waitFor();
      await monitor.getByText(/Unresolved investigation/).waitFor();
      await monitor.getByText(/Verified Dealer post/).click();
      await monitor.getByText("00000000-0000-4000-8000-000000000301").waitFor();
      if (process.env.VQ_MONITOR_SCREENSHOT)
        await monitor.screenshot({ path: process.env.VQ_MONITOR_SCREENSHOT });
    }
    const health = admin.page.getByRole("region", { name: "NFL feed health" });
    await health.getByText(/ESPN · Stale/).waitFor();
    if (width === 1280) assert.equal(await monitor.count(), 0);
    await health.getByText(/ESPN injuries · Unavailable/).waitFor();
    await health
      .getByRole("link", { name: "Open existing Feed Health" })
      .waitFor();
    const release = admin.page.getByRole("region", {
      name: "Deployment serving this page",
    });
    await release
      .getByText(width === 390 ? /Preview · Vercel/ : /Production · Vercel/)
      .waitFor();
    assert.equal(
      await release
        .getByRole("link", { name: /GitHub commit/ })
        .getAttribute("href"),
      "https://github.com/Aleynaalij/VegasQuantV1/commit/" + "a".repeat(40),
    );
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
  for (const action of ["list", "detail", "submit", "triage"])
    await lateResponse(action, false);
  await lateResponse("submit", true);

  const reports = new Set();
  const retry = await fixture(390, "member", (input) => {
    if (input.action !== "submit") return;
    const seen = reports.has(input.id);
    reports.add(input.id);
    return seen || input.symptom === "incorrect"
      ? { json: { state: "submitted", id } }
      : { status: 503, json: { state: "unavailable" } };
  });
  await retry.page.goto(base + "/support/report");
  await report(retry.page);
  await retry.page.getByText(/support queue is unavailable/).waitFor();
  await retry.page.getByRole("button", { name: "Submit report" }).click();
  await retry.page.getByText(/Report received/).waitFor();
  assert.equal(retry.calls[0].id, retry.calls[1].id);
  await report(retry.page);
  await retry.page.getByText(/support queue is unavailable/).waitFor();
  await retry.page.getByLabel("Symptom").selectOption("incorrect");
  await retry.page.getByRole("button", { name: "Submit report" }).click();
  await retry.page.getByText(/Report received/).waitFor();
  assert.notEqual(retry.calls[2].id, retry.calls[3].id);
  assert.equal(reports.size, 3);
  await retry.context.close();

  let outage = true;
  const conflict = await fixture(390, "admin", (input) => {
    if (input.action === "list" && outage) {
      outage = false;
      return { status: 503, json: { state: "unavailable" } };
    }
    if (input.action === "triage")
      return { status: 409, json: { state: "conflict" } };
  });
  await conflict.page.goto(base + "/admin/operations");
  await conflict.page.getByText(/support queue is unavailable/).waitFor();
  await conflict.page
    .getByRole("button", { name: "Check access again" })
    .click();
  await conflict.page.getByRole("button", { name: /Research.*New/ }).click();
  await conflict.page.getByRole("button", { name: "Mark in review" }).click();
  await conflict.page.getByText(/This report changed/).waitFor();
  await conflict.page.getByRole("button", { name: "Refresh queue" }).click();
  await conflict.page.getByRole("button", { name: /Research.*New/ }).waitFor();
  await conflict.context.close();

  assert.deepEqual(errors, []);
  console.log(
    "Operations browser smoke passed: anonymous/member denial, report receipt, admin triage, interrupted requests, retry and conflict recovery, 390px and 1280px.",
  );
} finally {
  await browser.close();
}

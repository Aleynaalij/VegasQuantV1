// Actual Home/admin components with synthetic users and private-RPC fixtures. Never production.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const base = process.env.UI_SMOKE_URL || "http://127.0.0.1:3100";
const version = readFileSync(
  "src/components/app-refresh-notice.tsx",
  "utf8",
).match(/const VERSION = "([^"]+)"/)[1];
try {
  for (const width of [390, 1280]) {
    let entries = [],
      ids = [],
      lostResponse = true;
    async function context(role) {
      const ctx = await browser.newContext({
        viewport: { width, height: 900 },
        reducedMotion: "reduce",
      });
      const uid =
        role === "frank"
          ? "00000000-0000-4000-8000-000000000001"
          : role === "admin"
            ? "00000000-0000-4000-8000-000000000003"
            : "00000000-0000-4000-8000-000000000002";
      await ctx.addInitScript(
        ({ uid, version, role }) => {
          sessionStorage.setItem("vq-prompt-shown", "fixture");
          localStorage.setItem("vq-app-refresh:" + uid, version);
          if (role !== "anon")
            localStorage.setItem(
              "sb-127-auth-token",
              JSON.stringify({
                access_token: "smoke",
                refresh_token: "smoke",
                token_type: "bearer",
                expires_in: 86400,
                expires_at: Math.floor(Date.now() / 1000) + 86400,
                user: {
                  id: uid,
                  aud: "authenticated",
                  role: "authenticated",
                  app_metadata: {},
                  user_metadata: { vq_welcome_version: 1 },
                  created_at: "2026-10-01T00:00:00Z",
                },
              }),
            );
        },
        { uid, version, role },
      );
      await ctx.route("**/rest/v1/community_profiles*", (r) => {
        const p = {
          user_id: uid,
          username: role === "frank" ? "Frank" : "FixtureMember",
          avatar: "ruby",
          region: null,
          visible: true,
        };
        return r.fulfill({
          json: (r.request().headers().accept || "").includes(
            "vnd.pgrst.object",
          )
            ? p
            : [p],
        });
      });
      await ctx.route("**/rest/v1/rpc/frank_anniversary", (r) =>
        r.fulfill({ json: { state: role === "frank" ? "done" : "hidden" } }),
      );
      await ctx.route("**/rest/v1/rpc/is_admin", (r) =>
        r.fulfill({ json: role === "admin" }),
      );
      await ctx.route("**/rest/v1/rpc/frank_nhl_feedback", (r) => {
        if (role !== "frank") return r.fulfill({ json: { state: "hidden" } });
        const p = JSON.parse(r.request().postData() || "{}");
        if (p.p_action === "submit") {
          ids.push(p.p_request_id);
          if (!entries.some((x) => x.id === p.p_request_id))
            entries.unshift({
              id: p.p_request_id,
              answers: p.p_answers,
              submitted_at: new Date().toISOString(),
            });
          // The database saved it, but the first HTTP response was lost: retry must reuse its ID.
          if (lostResponse) {
            lostResponse = false;
            return r.fulfill({
              status: 503,
              json: { message: "Fixture lost response" },
            });
          }
        }
        return r.fulfill({
          json: entries.length
            ? { state: "submitted", ...entries[0] }
            : { state: "offer" },
        });
      });
      let reviewReads = 0;
      await ctx.route("**/rest/v1/rpc/frank_nhl_feedback_review", (r) => {
        reviewReads++;
        return role === "admin"
          ? r.fulfill({ json: entries })
          : r.fulfill({ status: 403, json: { message: "Admin required" } });
      });
      return { ctx, reviewReads: () => reviewReads };
    }
    const { ctx } = await context("frank"),
      p = await ctx.newPage(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(base + "/", { waitUntil: "networkidle" });
    await p
      .getByRole("heading", {
        name: "Frank, help us build the NHL desk.",
        exact: true,
      })
      .waitFor();
    assert.equal(
      await p.locator("dialog.frank-anniversary-dialog[open]").count(),
      0,
    );
    await p
      .getByRole("button", { name: "Share your NHL ideas", exact: true })
      .click();
    const form = p.locator(".frank-nhl-feedback form");
    assert.equal(await form.locator("textarea").count(), 4);
    await p
      .getByText(
        "Your answers are shared privately with the Vegas Quant dev team. Answer any or all questions.",
        { exact: true },
      )
      .waitFor();
    await p
      .getByRole("button", { name: "Send to the VQ dev team", exact: true })
      .click();
    await p
      .getByText("Please answer at least one question.", { exact: true })
      .waitFor();
    assert.equal(ids.length, 0);
    const values = [
      "Ice time and confirmed goalies",
      "Fixture skater and power-play role",
      "Recent form and matchup reporting",
      "Source timestamps <script>throw Error('unsafe')</script>",
    ];
    for (let i = 0; i < 4; i++)
      await form.locator("textarea").nth(i).fill(values[i]);
    await p
      .getByRole("button", { name: "Send to the VQ dev team", exact: true })
      .click();
    await p.getByText(/Your answers could not be saved/).waitFor();
    assert.equal(
      await form.locator("textarea").first().inputValue(),
      values[0],
    );
    await p
      .getByRole("button", { name: "Send to the VQ dev team", exact: true })
      .click();
    await p.getByText(/Your NHL feedback is saved/).waitFor();
    assert.equal(entries.length, 1);
    assert.equal(ids.length, 2);
    assert.equal(ids[0], ids[1]);
    await p.reload({ waitUntil: "networkidle" });
    await p
      .getByRole("button", { name: "Update your NHL input", exact: true })
      .click();
    for (let i = 0; i < 4; i++)
      assert.equal(
        await p.locator(".frank-nhl-feedback textarea").nth(i).inputValue(),
        values[i],
      );
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth - innerWidth <= 1,
      ),
    );
    assert.deepEqual(errors, []);
    await ctx.close();
    for (const role of ["anon", "member"]) {
      const { ctx, reviewReads } = await context(role),
        p = await ctx.newPage();
      await p.goto(base + "/", { waitUntil: "networkidle" });
      assert.equal(await p.locator(".frank-nhl-feedback").count(), 0);
      await p.goto(base + "/admin/nhl-feedback", { waitUntil: "networkidle" });
      await p
        .getByText(
          "An MFA-verified admin account is required to review this feedback.",
          { exact: true },
        )
        .waitFor();
      assert.equal(await p.locator(".frank-feedback-entry").count(), 0);
      assert.equal(reviewReads(), 0);
      await ctx.close();
    }
    const a = await context("admin"),
      ap = await a.ctx.newPage();
    await ap.goto(base + "/admin/nhl-feedback", { waitUntil: "networkidle" });
    await ap.locator(".frank-feedback-entry").waitFor();
    for (const value of values)
      await ap.getByText(value, { exact: true }).waitFor();
    assert.equal(await ap.locator(".frank-feedback-entry script").count(), 0);
    assert.ok(
      await ap.evaluate(
        () => document.documentElement.scrollWidth - innerWidth <= 1,
      ),
    );
    await a.ctx.close();
    console.log(
      `PASS Frank NHL feedback ${width}px: Home recipient, four questions, private consent, loss/retry idempotency, saved reload and admin-only plain-text review`,
    );
  }
} finally {
  await browser.close();
}

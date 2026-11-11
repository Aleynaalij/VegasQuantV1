import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { observeOperationsRelease } from "../src/lib/operations-release";
import { POST } from "../src/app/api/operations/route";
import { parseOperationInput } from "../src/lib/operations-support";

const id = "00000000-0000-4000-8000-000000000001";
const origin = "https://operations-preview.example";
const submit = { action: "submit", id, feature: "research", symptom: "slow" };
const request = (body: unknown, token?: string, source = origin) =>
  new Request(`${origin}/api/operations`, {
    method: "POST",
    headers: {
      origin: source,
      host: "operations-preview.example",
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

test("operations validates exact structured input and rejects arbitrary or private fields", () => {
  const page = {
    action: "list",
    history: false,
    cursor: { id, before: "2026-11-08T10:00:00.000123+00:00" },
  };
  assert.deepEqual(parseOperationInput(page), page);
  assert.equal(
    parseOperationInput({
      ...page,
      cursor: { ...page.cursor, before: "yesterday" },
    }),
    null,
  );
  assert.deepEqual(parseOperationInput(submit), submit);
  for (const value of [
    null,
    [],
    "list",
    { action: "list", role: "admin" },
    { ...submit, message: "raw payload" },
    { ...submit, id: "invalid" },
    { ...submit, symptom: "unknown" },
    { action: "triage", id, expected: "resolved" },
  ]) {
    assert.equal(parseOperationInput(value), null);
  }
});

test("operations route verifies user bearer, enforces origin and keeps internal errors out of responses", async (t) => {
  let calls = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      ++calls;
      const url = new URL(input instanceof Request ? input.url : String(input));
      const token = new Headers(init?.headers).get("authorization");
      if (url.pathname.endsWith("/auth/v1/user")) {
        if (token === "Bearer invalid")
          return Response.json(
            { message: "internal token error" },
            { status: 401 },
          );
        return Response.json({
          id,
          email_confirmed_at: "2026-11-07T00:00:00Z",
        });
      }
      assert.ok(url.pathname.endsWith("/rpc/operations_support"));
      assert.ok(
        [
          "Bearer fixture-admin",
          "Bearer fixture-member",
          "Bearer fixture-db-error",
        ].includes(token ?? ""),
      );
      if (token === "Bearer fixture-db-error")
        return Response.json(
          { message: "private fixture payload" },
          { status: 500 },
        );
      if (token === "Bearer fixture-member")
        return Response.json({
          state: "forbidden",
          details: "private fixture payload",
        });
      return Response.json({ state: "ready", tickets: [] });
    },
  );
  assert.equal(
    (
      await POST(
        request({ action: "list" }, undefined, "https://other.example"),
      )
    ).status,
    403,
  );
  assert.equal(
    (await POST(request({ ...submit, extra: "x".repeat(2100) }))).status,
    400,
  );
  assert.equal((await POST(request({ action: "list" }))).status, 401);
  assert.equal(calls, 0);
  assert.deepEqual(
    await (await POST(request({ action: "list" }, "invalid"))).json(),
    { state: "unauthenticated" },
  );
  const denied = await POST(request({ action: "list" }, "fixture-member"));
  assert.equal(denied.status, 403);
  assert.deepEqual(await denied.json(), { state: "forbidden" });
  const success = await POST(request({ action: "list" }, "fixture-admin"));
  assert.equal(success.status, 200);
  assert.match(success.headers.get("cache-control") ?? "", /no-store/);
  const payload = await success.json();
  const expectedRelease = observeOperationsRelease();
  assert.deepEqual(payload, {
    state: "ready",
    tickets: [],
    release: expectedRelease && {
      ...expectedRelease,
      observedAt: payload.release.observedAt,
    },
  });
  const error = await POST(request({ action: "list" }, "fixture-db-error"));
  assert.equal(error.status, 503);
  assert.deepEqual(await error.json(), { state: "unavailable" });
});

test("operations migration enforces direct RPC and table denial, validation, retries, audit, and erasure", () => {
  const r = spawnSync(process.execPath, ["tests/sql/operations-support.mjs"], {
    encoding: "utf8",
    timeout: 60000,
  });
  assert.equal(r.status, 0, r.error?.message || r.stderr || r.stdout);
});

test("deployment identity is sourced from the serving runtime and never guesses a GitHub commit", () => {
  const now = new Date("2026-11-11T14:00:00Z");
  const env = {
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_DEPLOYMENT_ID: "dpl_Example12345",
    VERCEL_GIT_PROVIDER: "github",
    VERCEL_GIT_REPO_OWNER: "Aleynaalij",
    VERCEL_GIT_REPO_SLUG: "VegasQuantV1",
    VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
    VERCEL_TOKEN: "never-return-this",
  };
  assert.deepEqual(observeOperationsRelease(env, now), {
    environment: "preview",
    deploymentId: env.VERCEL_DEPLOYMENT_ID,
    commit: env.VERCEL_GIT_COMMIT_SHA,
    observedAt: now.toISOString(),
  });
  assert.equal(
    observeOperationsRelease({ ...env, VERCEL_GIT_REPO_SLUG: "other" }, now)
      ?.commit,
    null,
  );
  assert.equal(
    observeOperationsRelease({ ...env, VERCEL_ENV: "development" }, now),
    null,
  );
  assert.equal(
    observeOperationsRelease({ ...env, VERCEL_DEPLOYMENT_ID: "<bad>" }, now),
    null,
  );
  assert.equal(observeOperationsRelease({}, now), null);
});

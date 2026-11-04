import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createLineupLoader } from "../src/lib/nba-lineups-server";
const NOW = Date.parse("2026-11-04T20:00:00Z");
const side = (home: boolean) =>
  `<a class="lineup__team ${home ? "is-home" : "is-visit"}"><div class="lineup__abbr">${home ? "BOS" : "MIL"}</div></a><ul class="lineup__list ${home ? "is-home" : "is-visit"}"><li class="lineup__status is-expected">Expected Lineup</li></ul>`;
const html = `<main data-gamedate="2026-11-04"><div class="lineup is-nba"><div class="lineup__time">7:30 PM ET</div>${side(false)}${side(true)}</div></main>`;
const response = (body = html, status = 200, date = NOW) =>
  new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html",
      Date: new Date(date).toUTCString(),
    },
  });
test("single flight and minute cache share a fetch; cached receipt time is never moved forward", async () => {
  let calls = 0,
    now = NOW;
  const loader = createLineupLoader(
    (async (url, options) => {
      calls++;
      assert.equal(url, "https://www.rotowire.com/basketball/nba-lineups.php");
      assert.equal(options?.redirect, "error");
      await Promise.resolve();
      return response();
    }) as typeof fetch,
    () => now,
  );
  const all = await Promise.all([loader(), loader(), loader()]);
  assert.equal(calls, 1);
  assert.strictEqual(all[0], all[1]);
  now += 59999;
  assert.equal((await loader()).checked_at, new Date(NOW).toISOString());
  assert.equal(calls, 1);
  now++;
  await loader();
  assert.equal(calls, 2);
});
test("provider failures are not successes and do not resurrect cached report after timeout", async () => {
  let fail = false,
    calls = 0,
    now = NOW;
  const loader = createLineupLoader(
    (async () => {
      calls++;
      return fail ? response("Unavailable", 503) : response();
    }) as typeof fetch,
    () => now,
  );
  await loader();
  fail = true;
  now += 60000;
  await assert.rejects(loader(), /unavailable/);
  await assert.rejects(loader(), /unavailable/);
  assert.equal(calls, 3);
});
test("rejects stale upstream dates, wrong content type, overlarge streams and ET rollover during a request", async () => {
  const stale = createLineupLoader(
    (async () => response(html, 200, NOW - 180001)) as typeof fetch,
    () => NOW,
  );
  await assert.rejects(stale(), /stale/);
  const wrong = createLineupLoader(
    (async () =>
      new Response("{}", {
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch,
    () => NOW,
  );
  await assert.rejects(wrong(), /unavailable/);
  const huge = createLineupLoader(
    (async () => response("x".repeat(1_000_001))) as typeof fetch,
    () => NOW,
  );
  await assert.rejects(huge(), /large/);
  let calls = 0;
  const before = Date.parse("2026-11-05T04:59:59Z");
  const rollover = createLineupLoader(
    (async () => response(html, 200, before)) as typeof fetch,
    () => (calls++ ? before + 2000 : before),
  );
  await assert.rejects(rollover(), /date/);
});
function route(auth: unknown, loader = async () => ({ version: 1 })) {
  const source = fs.readFileSync("src/app/api/nba/lineups/route.ts", "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = {
    exports: {} as { GET: (req: Request) => Promise<Response> },
  };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    Response,
    Date,
    require: (name: string) =>
      name.includes("billing-server")
        ? { requestUser: async () => auth }
        : { loadNbaLineups: loader },
  });
  return module.exports.GET(
    new Request("https://example.test/api/nba/lineups"),
  );
}
test("route checks confirmed session, membership and age before any provider call; failures stay private and no-store", async () => {
  let calls = 0;
  const loader = async () => {
    calls++;
    return { version: 1 };
  };
  assert.equal((await route(null, loader)).status, 401);
  for (const [allowed, required, verified, status] of [
    [false, false, false, 403],
    [true, true, false, 403],
    [true, true, true, 200],
    [true, false, false, 200],
  ] as const) {
    const auth = {
      user: { id: "sample" },
      db: {
        rpc: async (name: string) => ({
          error: null,
          data:
            name === "membership_status" ? { allowed } : { required, verified },
        }),
      },
    };
    const r = await route(auth, loader);
    assert.equal(r.status, status);
    assert.equal(r.headers.get("cache-control"), "private, no-store");
  }
  assert.equal(calls, 2);
  const error = {
    user: { id: "sample" },
    db: { rpc: async () => ({ error: { message: "sample" }, data: null }) },
  };
  assert.equal((await route(error, loader)).status, 503);
  assert.equal(calls, 2);
});

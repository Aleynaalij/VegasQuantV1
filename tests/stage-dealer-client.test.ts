import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";
import { createValidFileMatcher } from "next/dist/server/lib/find-page-file";
import { createStageDealerReader } from "../src/lib/stage-dealer-client";
import type { HomeDealerResult } from "../src/lib/home-dealer";
const post = {
  id: "00000000-0000-4000-8000-000000000001",
  sport: "nba",
  title: "Synthetic",
  body: "Fixture",
  created_at: "2026-11-17T12:00:00Z",
};
test("success then denial clears old data before fetch; transport carries no script-readable credentials", async () => {
  let shown: HomeDealerResult | null = null;
  let allowed = true;
  let clearCount = 0;
  const reader = createStageDealerReader(
    (value) => {
      shown = value;
    },
    () => {
      shown = null;
      clearCount++;
    },
    async (url, init) => {
      assert.equal(shown, null);
      assert.equal(url, "/staging/discovery/read/dealer?sport=nba");
      assert.equal(init?.credentials, "same-origin");
      assert.equal(init?.headers, undefined);
      assert.equal(init?.redirect, "error");
      assert.equal(init?.cache, "no-store");
      return allowed
        ? Response.json({ state: "ready", posts: [post] })
        : new Response(null, { status: 403 });
    },
  );
  await reader.read("nba");
  assert.equal((shown as unknown as HomeDealerResult).posts.length, 1);
  allowed = false;
  await reader.read("nba");
  assert.deepEqual(shown, { state: "error", posts: [] });
  assert.equal(clearCount, 2);
  reader.dispose();
  assert.equal(shown, null);
});
test("old late success cannot replace newer denial or publish after disposal, even if abort ignored", async () => {
  const published: HomeDealerResult[] = [];
  const waiting: ((r: Response) => void)[] = [];
  const signals: AbortSignal[] = [];
  const reader = createStageDealerReader(
    (r) => published.push(r),
    () => {},
    async (_url, init) => {
      signals.push(init!.signal!);
      return new Promise((resolve) => waiting.push(resolve));
    },
  );
  const old = reader.read("nba");
  reader.invalidate();
  assert(signals[0].aborted);
  const next = reader.read("nfl");
  waiting[1](new Response(null, { status: 403 }));
  await next;
  waiting[0](Response.json({ state: "ready", posts: [post] }));
  await old;
  assert.deepEqual(published, [{ state: "error", posts: [] }]);
  const late = reader.read("nba");
  reader.dispose();
  waiting[2](Response.json({ state: "ready", posts: [post] }));
  await late;
  assert.equal(published.length, 1);
  await reader.read("nba");
  assert.equal(waiting.length, 3);
});
test("malformed HTML, wrong sport, oversized and transport failure do not fabricate empty success", async () => {
  const responses = [
    Response.json({ state: "ready", posts: [{}] }),
    Response.json({ state: "ready", posts: Array(4).fill(post) }),
    Response.json({ state: "ready", posts: [{ ...post, sport: "nfl" }] }),
    new Response("<html>login</html>"),
    Response.json(null),
    Response.json({ posts: [post] }),
    Response.json({
      state: "ready",
      posts: [{ ...post, title: "x".repeat(161) }],
    }),
    Response.json({
      state: "ready",
      posts: [{ ...post, body: "x".repeat(2001) }],
    }),
  ];
  for (const value of responses) {
    let result: HomeDealerResult | undefined;
    const reader = createStageDealerReader(
      (r) => {
        result = r;
      },
      () => {},
      async () => value,
    );
    await reader.read("nba");
    assert.deepEqual(result, { state: "error", posts: [] });
    reader.dispose();
  }
  let result: HomeDealerResult | undefined;
  const reader = createStageDealerReader(
    (r) => {
      result = r;
    },
    () => {},
    async () => {
      throw Error("offline");
    },
  );
  await reader.read("nba");
  assert.deepEqual(result, { state: "error", posts: [] });
  reader.dispose();
});
test("only explicit combined extensions recognize adapter in pinned Next matcher", () => {
  const route = "src/app/staging/discovery/read/dealer/route.combined.ts";
  const standard = ["tsx", "ts", "jsx", "js"],
    gate = ["stage.ts", "stage.tsx"];
  for (const extensions of [standard, gate])
    assert.equal(
      createValidFileMatcher(extensions, undefined).isAppRouterRoute(route),
      false,
    );
  assert.equal(
    createValidFileMatcher(
      ["combined.ts", ...gate, ...standard],
      undefined,
    ).isAppRouterRoute(route),
    true,
  );
});

test("actual base selector reserves combined extension exclusively to combined profile", () => {
  const source = readFileSync("next.config.ts", "utf8");
  assert.equal((source.match(/"combined\.ts"/g) || []).length, 1);
  assert.match(
    source,
    /profile === "combined"[\s\S]*pageExtensions: \["combined\.ts", \.\.\.stagingExtensions, "tsx", "ts", "jsx", "js"\]/,
  );
  assert.match(
    source,
    /profile === "gate" && \{ pageExtensions: stagingExtensions \}/,
  );
  assert.match(
    source,
    /const stagingExtensions = \["stage\.ts", "stage\.tsx"\]/,
  );
  assert(existsSync("src/app/staging/discovery/read/dealer/route.combined.ts"));
  assert(!existsSync("src/app/staging/discovery/read/dealer/route.stage.ts"));
});

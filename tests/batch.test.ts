import test from "node:test";
import assert from "node:assert/strict";
import { batchLoader } from "../src/lib/batch";

const tick = () => new Promise((r) => setTimeout(r, 5));

test("keys asked for in the same tick share one fetch, and answers are cached", async () => {
  const calls: string[][] = [];
  const l = batchLoader<number>(async (keys) => {
    calls.push(keys);
    return new Map(keys.map((k) => [k, k.length]));
  });
  const [a, b, c] = await Promise.all([l.load("a"), l.load("bb"), l.load("a")]);
  assert.deepEqual([a, b, c], [1, 2, 1]);
  assert.deepEqual(calls, [["a", "bb"]]);
  assert.equal(await l.load("bb"), 2);
  assert.equal(calls.length, 1);
  assert.equal((await l.loadMany(["a", "ccc"])).get("ccc"), 3);
  assert.deepEqual(calls[1], ["ccc"]);
});

test("a load after invalidation never joins a request that started before it", async () => {
  let value = 1;
  const releases: (() => void)[] = [];
  const l = batchLoader<number>(async (keys) => {
    const v = value;
    await new Promise<void>((r) => releases.push(r));
    return new Map(keys.map((k) => [k, v]));
  });
  const old = l.load("k");
  await tick();
  value = 2; // a write happens while the first request is in flight
  l.invalidate(["k"]);
  const fresh = l.load("k");
  await tick();
  releases.forEach((r) => r());
  await tick();
  releases.forEach((r) => r());
  assert.equal(await old, 1);
  assert.equal(await fresh, 2);
  assert.equal(await l.load("k"), 2, "the stale answer was not cached");
});

test("invalidating one key leaves other in-flight keys working", async () => {
  const releases: (() => void)[] = [];
  let n = 0;
  const l = batchLoader<number>(async (keys) => {
    const v = ++n;
    await new Promise<void>((r) => releases.push(r));
    return new Map(keys.map((k) => [k, v]));
  });
  const other = l.load("other");
  await tick();
  l.invalidate(["unrelated"]);
  releases.forEach((r) => r());
  assert.equal(await other, 1);
  assert.equal(await l.load("other"), 1, "still cached");
  assert.equal(n, 1);
});

test("missing rows resolve undefined and failures reject without poisoning the cache", async () => {
  let fail = true;
  const l = batchLoader<number>(async (keys) => {
    if (fail) throw new Error("down");
    return new Map(keys.filter((k) => k !== "none").map((k) => [k, 7]));
  });
  await assert.rejects(l.load("x"));
  fail = false;
  assert.equal(await l.load("x"), 7);
  assert.equal(await l.load("none"), undefined);
});

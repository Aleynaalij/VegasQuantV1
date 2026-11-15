import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { watchDiscoveryAccess } from "../src/lib/discovery/revalidate";

test("same-user auth refresh clears synchronously, defers reads and coalesces events", () => {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const scheduled = new Map<number, () => void>();
  let next = 0,
    invalidations = 0,
    reloads = 0,
    unsubscribed = false;
  let auth = () => {},
    poll = () => {};
  const env = {
    window: win,
    document: doc,
    schedule: (fn: () => void) => {
      scheduled.set(++next, fn);
      return next;
    },
    cancel: (id: number) => {
      scheduled.delete(id);
    },
    repeat: (fn: () => void) => {
      poll = fn;
      return 1;
    },
    stop: () => {
      poll = () => {};
    },
  } as unknown as Parameters<typeof watchDiscoveryAccess>[3];
  const flush = () => {
    const queue = [...scheduled.values()];
    scheduled.clear();
    queue.forEach((fn) => fn());
  };
  const stop = watchDiscoveryAccess(
    () => invalidations++,
    () => reloads++,
    (changed) => {
      auth = changed;
      return () => {
        unsubscribed = true;
      };
    },
    env,
  );
  auth();
  auth(); // includes repeated SIGNED_IN/TOKEN_REFRESHED for same identity
  assert.equal(invalidations, 2);
  assert.equal(reloads, 0);
  assert.equal(scheduled.size, 1);
  flush();
  assert.equal(reloads, 1);
  doc.visibilityState = "hidden";
  doc.dispatchEvent(new Event("visibilitychange"));
  flush();
  assert.equal(invalidations, 3);
  assert.equal(reloads, 1);
  doc.visibilityState = "visible";
  doc.dispatchEvent(new Event("visibilitychange"));
  flush();
  assert.equal(reloads, 2);
  win.dispatchEvent(new Event("focus"));
  flush();
  assert.equal(reloads, 3);
  poll();
  flush();
  assert.equal(reloads, 4);
  auth();
  stop();
  flush();
  assert.equal(reloads, 4);
  assert.equal(unsubscribed, true);
  win.dispatchEvent(new Event("focus"));
  assert.equal(scheduled.size, 0);
});

test("both Discovery readers invalidate generations and rendered data on access events", () => {
  const source = readFileSync("src/components/discovery/discovery.tsx", "utf8");
  assert.equal(source.includes("onUserChange"), false);
  assert.equal(source.match(/watchDiscoveryAccess\(/g)?.length, 2);
  assert.match(source, /\+\+generation;\s+setPosts\(\[\]\)/);
  assert.match(source, /\+\+generation;\s+setData\(EMPTY\)/);
  assert.match(source, /own === generation/);
  assert.match(source, /own !== generation/);
});

test("connected discovery defaults to deterministic link-only publications", () => {
  const source = readFileSync("src/components/discovery/discovery.tsx", "utf8");
  assert.match(source, /linkedPublications = false/);
  assert.match(source, /fixtures \|\| linkedPublications \? \(/);
  const fallback = source.split(
    "Linked game publications are not available in this release.",
  )[1];
  assert.ok(fallback);
  assert.match(fallback, /eventResearchHref\(event\)/);
  assert.match(fallback, /fullMatchupHref\(event\)/);
  assert.match(fallback, /community\?sport=\$\{event.sport\}/);
  assert.match(fallback, /sport-filtered, not game-filtered/);
  const route = readFileSync("src/app/staging/discovery/page.tsx", "utf8");
  assert.match(
    route,
    /process.env.STAGING_DISCOVERY_LINKED_PUBLICATIONS === "true"/,
  );
});

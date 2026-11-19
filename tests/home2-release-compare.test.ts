import assert from "node:assert/strict";
import test from "node:test";
import {
  compareSnapshots,
  jsonShape,
  pageStructure,
} from "../scripts/operations/home2-release-compare.mjs";

const page = (body: string) =>
  `<html><head><title>Vegas Quant · 3 games</title><script>var x=1</script></head><body>${body}</body></html>`;

test("structure ignores live numbers and scripts, keeps nav, headings and section ids", () => {
  const a = pageStructure(
    page(
      '<nav><a href="/nba">NBA</a><a href="/nhl">NHL</a></nav><main id="home"><h1>Tonight: 7 games</h1><section id="props"><h2>Props</h2></section></main>',
    ),
  );
  const b = pageStructure(
    page(
      '<nav><a href="/nhl">NHL</a><a href="/nba">NBA</a></nav><main id="home"><h1>Tonight: 12 games</h1><section id="props"><h2>Props</h2></section></main>',
    ),
  );
  assert.deepEqual(a, b);
  assert.deepEqual(a.nav, ["/nba", "/nhl"]);
  assert.deepEqual(a.ids, ["main#home", "section#props"]);
  assert.equal(a.title, "Vegas Quant · # games");
});

test("structure detects a new Home: different headings, nav or sections", () => {
  const classic = pageStructure(
    page('<nav><a href="/nba">NBA</a></nav><h1>Lobby</h1>'),
  );
  const next = pageStructure(
    page(
      '<nav><a href="/nba">NBA</a><a href="/zone">Zone</a></nav><h1>Home</h1>',
    ),
  );
  assert.notDeepEqual(classic, next);
});

test("json shape compares keys, not values", () => {
  assert.deepEqual(
    jsonShape({ sport: "nba", games: [{ id: 1, score: 99 }], disabled: null }),
    jsonShape({ sport: "nba", games: [{ id: 7, score: 3 }], disabled: null }),
  );
  assert.notDeepEqual(
    jsonShape({ games: [] }),
    jsonShape({ games: [], extra: 1 }),
  );
});

test("compare reports status, redirect and structure changes, and nothing when identical", () => {
  const s = (status: number, location: string | null, h1: string) => ({
    pages: {
      "/": {
        status,
        location,
        kind: "html",
        structure: pageStructure(page(`<h1>${h1}</h1>`)),
      },
    },
  });
  assert.deepEqual(
    compareSnapshots(s(200, null, "Lobby"), s(200, null, "Lobby")),
    [],
  );
  const diffs = compareSnapshots(
    s(200, null, "Lobby"),
    s(307, "/home", "Home"),
  );
  assert.ok(diffs.some((d) => d.includes("status 200 → 307")));
  assert.ok(diffs.some((d) => d.includes("location null → /home")));
  assert.ok(diffs.some((d) => d.includes("headings changed")));
  assert.deepEqual(
    compareSnapshots(
      { pages: { "/a": s(200, null, "x").pages["/"] } },
      { pages: {} },
    ),
    ["/a: missing after"],
  );
});

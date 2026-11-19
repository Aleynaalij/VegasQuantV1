#!/usr/bin/env node
/**
 * Home/Zone 2.0 release step 1 ("dark merge"): prove the merge changed nothing members can see.
 *
 *   node scripts/operations/home2-release-compare.mjs snapshot --url https://vegasquant.app --out before.json
 *   ...merge + deploy with 2.0 still locked off...
 *   node scripts/operations/home2-release-compare.mjs snapshot --url https://vegasquant.app --out after.json
 *   node scripts/operations/home2-release-compare.mjs compare before.json after.json
 *
 * Read-only: signed-out GETs only, no cookies, no sign-in, no POST. Live content (scores, picks,
 * prices) changes between runs, so pages are compared by STRUCTURE: status, redirect target,
 * <title>, navigation links, headings and landmark/section ids; JSON APIs by key shape. Exit code 1
 * on any structural difference. Behind a proxy run with NODE_USE_ENV_PROXY=1.
 */

export const PAGES = [
  "/",
  "/nba",
  "/nba/props",
  "/nhl",
  "/ncaab",
  "/nfl",
  "/community",
  "/feed",
  "/games",
  "/membership",
  "/?game=1",
];
export const APIS = ["/api/live?sport=nba"];

const decode = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'");
const text = (s) =>
  decode(s.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
/** Digits vary with live data (scores, counts, times); structure doesn't. */
const shape = (s) => s.replace(/\d+/g, "#");

/** Structural fingerprint of a page's HTML. */
export function pageStructure(html) {
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  const title = text(
    (body.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "",
  );
  const nav = [];
  for (const block of body.match(/<nav[\s\S]*?<\/nav>/gi) || [])
    for (const m of block.matchAll(/<a\b[^>]*href="([^"]*)"/gi))
      nav.push(decode(m[1]));
  const headings = [
    ...body.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi),
  ].map((m) => `h${m[1]} ${shape(text(m[2]))}`);
  const ids = [
    ...body.matchAll(
      /<(main|section|header|footer|aside)\b[^>]*\bid="([^"]+)"/gi,
    ),
  ].map((m) => `${m[1]}#${m[2]}`);
  return {
    title: shape(title),
    nav: [...new Set(nav)].sort(),
    headings: [...new Set(headings)],
    ids: [...new Set(ids)].sort(),
  };
}

/** Key shape of a JSON value: object keys recursively, arrays by their first element. */
export function jsonShape(v) {
  if (Array.isArray(v)) return v.length ? [jsonShape(v[0])] : [];
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, jsonShape(v[k])]),
    );
  return v === null ? "null" : typeof v;
}

/** Differences between two snapshots, one line each. Empty means identical structure. */
export function compareSnapshots(before, after) {
  const out = [];
  const paths = [
    ...new Set([...Object.keys(before.pages), ...Object.keys(after.pages)]),
  ].sort();
  for (const p of paths) {
    const a = before.pages[p],
      b = after.pages[p];
    if (!a || !b) {
      out.push(`${p}: ${a ? "missing after" : "new after"}`);
      continue;
    }
    for (const k of ["status", "location", "kind"])
      if (a[k] !== b[k]) out.push(`${p}: ${k} ${a[k]} → ${b[k]}`);
    const sa = JSON.stringify(a.structure),
      sb = JSON.stringify(b.structure);
    if (sa !== sb) {
      for (const k of Object.keys({ ...a.structure, ...b.structure })) {
        const x = JSON.stringify(a.structure?.[k]),
          y = JSON.stringify(b.structure?.[k]);
        if (x !== y)
          out.push(`${p}: ${k} changed\n    before ${x}\n    after  ${y}`);
      }
    }
  }
  return out;
}

async function snapshot(base) {
  const pages = {};
  for (const path of [...PAGES, ...APIS]) {
    const res = await fetch(base + path, {
      redirect: "manual",
      headers: {
        accept: path.startsWith("/api/") ? "application/json" : "text/html",
      },
    });
    const body = await res.text();
    const location = res.headers.get("location")
      ? new URL(res.headers.get("location"), base).pathname +
        new URL(res.headers.get("location"), base).search
      : null;
    let kind = "other",
      structure = null;
    if ((res.headers.get("content-type") || "").includes("json")) {
      kind = "json";
      try {
        structure = jsonShape(JSON.parse(body));
      } catch {
        structure = "unparseable";
      }
    } else if ((res.headers.get("content-type") || "").includes("html")) {
      kind = "html";
      structure = pageStructure(body);
    }
    pages[path] = { status: res.status, location, kind, structure };
  }
  return { base, at: new Date().toISOString(), pages };
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const fs = await import("node:fs");
  if (cmd === "snapshot") {
    const arg = (k) => rest[rest.indexOf(k) + 1];
    const url = arg("--url"),
      outFile = arg("--out");
    if (!url || !outFile || !/^https:\/\/[^/]+$/.test(url))
      throw new Error("usage: snapshot --url https://host --out file.json");
    const snap = await snapshot(url);
    fs.writeFileSync(outFile, JSON.stringify(snap, null, 2));
    for (const [p, r] of Object.entries(snap.pages))
      console.log(
        `${String(r.status).padEnd(4)} ${r.kind.padEnd(5)} ${p}${r.location ? ` → ${r.location}` : ""}`,
      );
  } else if (cmd === "compare") {
    const [b, a] = rest.map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
    const diffs = compareSnapshots(b, a);
    console.log(
      diffs.length
        ? diffs.join("\n")
        : `IDENTICAL structure across ${Object.keys(a.pages).length} paths`,
    );
    process.exitCode = diffs.length ? 1 : 0;
  } else {
    throw new Error(
      "usage: snapshot --url https://host --out file.json | compare before.json after.json",
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`)
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 2;
  });

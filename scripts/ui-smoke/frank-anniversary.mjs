// Isolated real React components, synthetic account/RPC fixture only. No production writes.
// Does not require or alter Claude's in-progress Corner/NHL routes or the shared stub.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { build } from "esbuild";
import { resolve } from "node:path";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const token = "00000000-0000-4000-8000-000000000001";
let enabled = true,
  receipts = new Map(),
  failReveal = false,
  revealCount = 0,
  celebrateCount = 0;
const stub = `
let user=new URL(location.href).searchParams.get('user')||sessionStorage.getItem('fixture-user')||'frank';
sessionStorage.setItem('fixture-user',user);
const listeners=new Set();
window.switchFixtureUser=(next)=>{user=next;sessionStorage.setItem('fixture-user',next);for(const cb of listeners)cb(next)};
export const onUserChange=(cb)=>{listeners.add(cb);return()=>listeners.delete(cb)};
export const supabase={auth:{getSession:async()=>({data:{session:user==='anon'?null:{user:{id:user}}}})},rpc:async(name,p)=>{
const response=await fetch('/_rpc',{method:'POST',body:JSON.stringify({user,p})});
return response.json();}};`;
const bundled = await build({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';
import {FrankAnniversaryCorner,FrankAnniversaryFireworks} from './src/components/frank-anniversary';
const nhl=location.pathname==='/nhl';createRoot(document.getElementById('root')).render(<React.StrictMode><main><h1>{nhl?'NHL':'FranksCorner'}</h1><button>Regular page action</button>{nhl?<FrankAnniversaryFireworks/>:<FrankAnniversaryCorner/>}</main></React.StrictMode>);`,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  outdir: "/fixture",
  jsx: "automatic",
  format: "iife",
  plugins: [
    {
      name: "synthetic-account",
      setup(b) {
        b.onResolve({ filter: /^@\/lib\/(supabase|auth-user)$/ }, () => ({
          path: "fixture-client",
          namespace: "fixture",
        }));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents: stub,
          loader: "js",
        }));
        b.onResolve({ filter: /^@\// }, (args) => ({
          path: resolve("src", args.path.slice(2) + ".ts"),
        }));
      },
    },
  ],
});
const js = bundled.outputFiles.find((x) => x.path.endsWith(".js")).text;
const css = bundled.outputFiles.find((x) => x.path.endsWith(".css")).text;
const server = createServer(async (req, res) => {
  if (req.url === "/_rpc") {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const { user, p } = JSON.parse(Buffer.concat(chunks).toString());
    let data = { state: "hidden" },
      error = null;
    if (enabled && user === "frank") {
      const receipt = receipts.get(user);
      if (p.p_action === "reveal" && failReveal) {
        failReveal = false;
        error = { message: "Fixture network error" };
      } else if (p.p_action === "arrive") {
        if (receipt && !receipt.done && p.p_token === token) {
          receipt.done = true;
          celebrateCount++;
          data = { state: "celebrate" };
        } else data = { state: "done" };
      } else {
        if (p.p_action === "reveal" && !receipt) {
          revealCount++;
          receipts.set(user, { done: false });
        }
        const next = receipts.get(user);
        data = !next
          ? { state: "offer" }
          : next.done
            ? { state: "done" }
            : { state: "revealed", token };
      }
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ data, error }));
    return;
  }
  if (req.url === "/bundle.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(js);
    return;
  }
  if (req.url === "/bundle.css") {
    res.setHeader("Content-Type", "text/css");
    res.end(css);
    return;
  }
  res.setHeader("Content-Type", "text/html");
  res.end(
    '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/bundle.css"><style>body{background:#0c1116;color:white;font-family:Arial;padding:16px}button{font:inherit}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>',
  );
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    ...(process.env.PLAYWRIGHT_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
      : {}),
  });
  for (const width of [390, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    enabled = false;
    receipts.clear();
    revealCount = 0;
    celebrateCount = 0;
    await page.goto(base + "/?user=frank");
    await page.getByRole("heading", { name: "FranksCorner" }).waitFor();
    await page.waitForTimeout(150);
    assert.equal(await page.getByRole("dialog").count(), 0);
    enabled = true;
    for (const user of ["other", "anon"]) {
      await page.goto(base + "/?user=" + user);
      await page.waitForTimeout(150);
      assert.equal(await page.getByRole("dialog").count(), 0);
      await page.goto(base + "/nhl?user=" + user + "&vq-anniversary=" + token);
      await page.waitForTimeout(150);
      assert.equal(
        await page.getByTestId("frank-anniversary-fireworks").count(),
        0,
      );
    }
    await page.goto(base + "/?user=frank");
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    assert.equal(
      await dialog.getByRole("button", { name: "Yes", exact: true }).count(),
      2,
    );
    assert.ok(
      (
        await page
          .locator("dialog")
          .evaluate((el) => getComputedStyle(el, "::backdrop").backdropFilter)
      ).includes("blur"),
    );
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(
        () => document.activeElement.closest("dialog") !== null,
      ),
      true,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.keyboard.press("Escape");
    assert.equal(await dialog.count(), 0);
    assert.equal(revealCount, 0);
    await page.reload();
    await page.getByRole("dialog").waitFor();
    failReveal = true;
    await page
      .getByRole("button", { name: "Yes", exact: true })
      .nth(width === 390 ? 0 : 1)
      .click();
    await page.getByRole("alert").waitFor();
    assert.equal(revealCount, 0);
    await page
      .getByRole("button", { name: "Yes", exact: true })
      .nth(width === 390 ? 0 : 1)
      .click();
    await page.waitForURL((url) => url.pathname === "/nhl");
    await page.getByTestId("frank-anniversary-fireworks").waitFor();
    assert.equal(revealCount, 1);
    assert.equal(celebrateCount, 1);
    await page.waitForURL(base + "/nhl"); // Only the anniversary parameter is stripped.
    await page
      .getByRole("button", { name: "Dismiss anniversary celebration" })
      .click();
    assert.equal(
      await page.getByTestId("frank-anniversary-fireworks").count(),
      0,
    );
    await page.reload();
    await page.waitForTimeout(100);
    assert.equal(
      await page.getByTestId("frank-anniversary-fireworks").count(),
      0,
    );
    // Fresh browser storage still shares the server account receipt.
    const second = await browser.newContext({
        viewport: { width, height: 844 },
      }),
      otherTab = await second.newPage();
    await otherTab.goto(base + "/?user=frank");
    await otherTab.waitForTimeout(150);
    assert.equal(await otherTab.getByRole("dialog").count(), 0);
    await otherTab.goto(base + "/nhl?user=frank&vq-anniversary=" + token);
    await otherTab.waitForTimeout(150);
    assert.equal(
      await otherTab.getByTestId("frank-anniversary-fireworks").count(),
      0,
    );
    assert.equal(celebrateCount, 1);
    await second.close();
    // Account changes clear an already-open invitation before stale replies can apply.
    receipts.clear();
    await page.goto(base + "/?user=frank");
    await page.getByRole("dialog").waitFor();
    await page.evaluate(() => window.switchFixtureUser("other"));
    await page.waitForTimeout(100);
    assert.equal(await page.getByRole("dialog").count(), 0);
    // Interrupted navigation resumes the same handoff; reduced motion uses static stars.
    receipts.set("frank", { done: false });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(base + "/?user=frank");
    await page.waitForURL((url) => url.pathname === "/nhl");
    await page.getByTestId("frank-anniversary-fireworks").waitFor();
    assert.equal(
      await page
        .locator(".frank-anniversary-burst i")
        .first()
        .evaluate((el) => getComputedStyle(el).animationName),
      "none",
    );
    await page
      .getByTestId("frank-anniversary-fireworks")
      .waitFor({ state: "detached", timeout: 7000 });
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      `PASS anniversary UI ${width}px: Frank-only, release gate, blur, Yes/Yes, retry, NHL arrival, once across storage, account change, reduced motion and expiry`,
    );
  }
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}

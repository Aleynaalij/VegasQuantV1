import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

test("research, signup and health pushes use neutral messages and correct destinations", async () => {
  const handlers: Record<string, (event: any) => void> = {};
  const displayed: any[] = [];
  const opened: string[] = [];
  const self = {
    addEventListener: (type: string, handler: any) => {
      handlers[type] = handler;
    },
    registration: {
      showNotification: async (title: string, options: any) => {
        displayed.push({ title, ...options });
      },
    },
    location: { origin: "https://vegasquant.app" },
    clients: {
      matchAll: async () => [],
      openWindow: async (url: string) => {
        opened.push(url);
      },
    },
  };
  runInNewContext(readFileSync("public/sw.js", "utf8"), { self, URL });
  for (const [type, destination] of [
    ["research", "/feed"],
    ["signup", "/admin/accounts"],
    ["health", "/admin/feeds"],
  ]) {
    let pending: Promise<unknown> = Promise.resolve();
    handlers.push({
      data: { json: () => ({ type }) },
      waitUntil: (p: Promise<unknown>) => {
        pending = p;
      },
    });
    await pending;
    const alert = displayed.at(-1);
    assert.equal(alert.data.url, destination);
    assert.equal(alert.body.includes("official decision"), false);
    handlers.notificationclick({
      notification: { ...alert, close() {} },
      waitUntil: (p: Promise<unknown>) => {
        pending = p;
      },
    });
    await pending;
    assert.equal(opened.at(-1), destination);
  }
});

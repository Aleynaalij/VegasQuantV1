import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import {
  notificationLink,
  notificationText,
  notificationPushPayload,
  type NotificationRow,
} from "../src/lib/notifications";
import {
  deliverSocialNotification,
  type SocialDeliveryJob,
} from "../src/lib/social-notification-delivery";
const sample = {
  id: "notification",
  recipient_id: "owner",
  actor_id: "actor",
  actor_name: "Sarah",
  actor_avatar: null,
  type: "like",
  content_id: null,
  message: "liked your post.",
  priority: "medium",
  deep_link: "/community?post=00000000-0000-4000-8000-000000000004",
  event_count: 1,
  actor_names: ["Sarah"],
  created_at: "2026-10-17T00:00:00Z",
  updated_at: "2026-10-17T00:00:00Z",
  read_at: null,
  viewed_at: null,
} as NotificationRow;
test("notification text groups likes without exposing private previews in external payloads", () => {
  assert.equal(notificationText(sample), "Sarah liked your post.");
  assert.equal(
    notificationText({
      ...sample,
      event_count: 29,
      actor_names: ["John", "Sarah"],
    }),
    "John, Sarah and 27 others liked your post.",
  );
  assert.equal(
    notificationText({
      ...sample,
      actor_id: null,
      message: "Password changed.",
    }),
    "Password changed.",
  );
  const payload = notificationPushPayload({
    notification_id: "n",
    priority: "high",
    deep_link: sample.deep_link,
    type: "comment",
  });
  assert.equal(payload.url, sample.deep_link);
  assert.equal(payload.announcement.includes("Sarah"), false);
  const post = notificationPushPayload({
    notification_id: "n",
    priority: "medium",
    deep_link: "/community?sport=nfl&post=p#post-p",
    type: "post",
  });
  assert.equal(
    post.announcement,
    "New post in The Zone. Open Vegas Quant to read it.",
  );
  assert.equal(post.url, "/community?sport=nfl&post=p#post-p");
  for (const href of [
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/api/notifications/dispatch",
    "javascript:alert(1)",
  ])
    assert.equal(notificationLink(href), "/notifications");
  assert.equal(notificationLink("/community/MikeQ"), "/community/MikeQ");
});
test("transactional notification integration and RLS isolation", () => {
  execFileSync(process.execPath, ["tests/sql/social-notifications.mjs"], {
    stdio: "pipe",
  });
});
test("email remains blocked without provider configuration; transient failures are retried with idempotency", async () => {
  const original = global.fetch,
    key = process.env.RESEND_API_KEY,
    from = process.env.NOTIFICATION_EMAIL_FROM;
  const job = {
    id: "job",
    lease: "lease",
    channel: "email",
    notification_id: "n",
    recipient_id: "u",
    type: "security",
    priority: "critical",
    deep_link: "/membership",
    endpoint: null,
    keys: { p256dh: "", auth: "" },
    email: "fixture@example.com",
  } as SocialDeliveryJob;
  try {
    delete process.env.RESEND_API_KEY;
    delete process.env.NOTIFICATION_EMAIL_FROM;
    assert.equal(
      (
        await deliverSocialNotification(job, {
          public_key: "",
          private_key: "",
        })
      ).status,
      "blocked",
    );
    process.env.RESEND_API_KEY = "test";
    process.env.NOTIFICATION_EMAIL_FROM = "fixture@vegasquant.app";
    global.fetch = async (_, init) => {
      assert.equal(
        new Headers(init?.headers).get("Idempotency-Key"),
        "vq-notification-job",
      );
      assert.equal(
        String(init?.body).includes("https://vegasquant.app/membership"),
        true,
      );
      return new Response("", { status: 429 });
    };
    assert.equal(
      (
        await deliverSocialNotification(job, {
          public_key: "",
          private_key: "",
        })
      ).status,
      "retry",
    );
    global.fetch = async () => Response.json({ id: "accepted" });
    assert.equal(
      (
        await deliverSocialNotification(job, {
          public_key: "",
          private_key: "",
        })
      ).status,
      "sent",
    );
  } finally {
    global.fetch = original;
    if (key === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = key;
    if (from === undefined) delete process.env.NOTIFICATION_EMAIL_FROM;
    else process.env.NOTIFICATION_EMAIL_FROM = from;
  }
});
test("service worker opens exact social comment links and refuses external destinations", async () => {
  const handlers: Record<string, (e: any) => void> = {};
  const shown: any[] = [];
  const opened: string[] = [];
  const self = {
    addEventListener: (type: string, fn: any) => (handlers[type] = fn),
    location: { origin: "https://vegasquant.app" },
    registration: {
      showNotification: async (_: string, o: any) => {
        shown.push(o);
      },
    },
    clients: {
      matchAll: async () => [],
      openWindow: async (u: string) => {
        opened.push(u);
      },
    },
  };
  runInNewContext(readFileSync("public/sw.js", "utf8"), { self, URL });
  const target =
    "/community?sport=nfl&post=00000000-0000-4000-8000-000000000004&comment=00000000-0000-4000-8000-000000000005#comment-00000000-0000-4000-8000-000000000005";
  let pending: Promise<unknown> = Promise.resolve();
  handlers.push({
    data: {
      json: () => ({
        type: "social",
        url: target,
        notification_id: "00000000-0000-4000-8000-000000000001",
        announcement: "New community activity.",
      }),
    },
    waitUntil: (p: Promise<unknown>) => (pending = p),
  });
  await pending;
  assert.equal(shown[0].data.url, target);
  assert.equal(shown[0].tag, "vq-social-00000000-0000-4000-8000-000000000001");
  handlers.notificationclick({
    notification: { data: { url: target }, close() {} },
    waitUntil: (p: Promise<unknown>) => (pending = p),
  });
  await pending;
  assert.equal(opened[0], target);
  handlers.notificationclick({
    notification: { data: { url: "//evil.test" }, close() {} },
    waitUntil: (p: Promise<unknown>) => (pending = p),
  });
  await pending;
  assert.equal(opened[1], "/");
});

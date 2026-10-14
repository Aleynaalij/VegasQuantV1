// Only the neutral offline page is cached. Never store picks, sessions or API responses.
const CACHE = "vq-offline-v4";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.add("/offline.html")),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith("vq-offline-") && key !== CACHE)
              .map((key) => caches.delete(key)),
          ),
        ),
      self.clients.claim(),
    ]),
  );
});
self.addEventListener("message", (event) => {
  if (event.data === "ACTIVATE_UPDATE") self.skipWaiting();
  if (event.data === "PUSH_CAPABILITIES")
    event.ports?.[0]?.postMessage({ health: true });
});
self.addEventListener("fetch", (event) => {
  if (
    event.request.mode === "navigate" &&
    new URL(event.request.url).origin === self.location.origin
  )
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/offline.html")),
    );
});
self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};
  const release =
    data.type === "price" && /^[0-9a-f-]{36}$/.test(data.release || "")
      ? data.release
      : null;
  const url =
    data.type === "health"
      ? "/admin/feeds"
      : data.type === "signup"
        ? "/admin/accounts"
        : data.type === "research"
          ? "/feed"
          : release
            ? `/feed?view=legs#release-${release}`
            : data.type === "price"
              ? "/feed?view=legs"
              : "/";
  event.waitUntil(
    self.registration.showNotification("Vegas Quant", {
      body:
        data.announcement || (data.type === "health"
          ? "Research data needs attention. Open Feed Health to review."
          : data.type === "test"
            ? "Test alert: your Vegas Quant notifications are connected."
            : data.type === "signup"
              ? "A new member joined Vegas Quant. Open Accounts to review."
              : data.type === "research"
                ? "New research is published. Open the Feed to see what changed."
                : data.type === "price"
                  ? "A price moved on a leg you tailed or saved. Open the updated case before you decide."
                  : "A new official decision is published. Open your challenge to review it."),
      icon: "/icons/vq-prestige-192.png",
      badge: "/icons/vq-prestige-192.png",
      tag:
        data.type === "health"
          ? "vq-health"
          : data.type === "test"
            ? "vq-test"
            : data.type === "signup"
              ? "vq-signup"
              : data.type === "research"
                ? "vq-research"
                : data.type === "price"
                  ? "vq-price-" + (release || "update")
                  : "vq-official-" + (data.pick_id || "decision"),
      data: { url },
    }),
  );
});
// Only known in-app destinations; a price alert may open one release in The Zone.
const safeTarget = (url) =>
  ["/admin/feeds", "/admin/accounts", "/feed", "/feed?view=legs"].includes(url) ||
  /^\/feed\?view=legs#release-[0-9a-f-]{36}$/.test(url || "")
    ? url
    : "/";
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = safeTarget(event.notification.data?.url);
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clients) => {
        const existing = clients.find(
          (c) => new URL(c.url).origin === self.location.origin,
        );
        if (existing) {
          await existing.navigate(target);
          return existing.focus();
        }
        return self.clients.openWindow(target);
      }),
  );
});

// Only the neutral offline page is cached. Never store picks, sessions or API responses.
const CACHE = "vq-offline-v1";
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
  event.waitUntil(
    self.registration.showNotification("Vegas Quant", {
      body:
        data.type === "test"
          ? "Test alert: your Vegas Quant notifications are connected."
          : "A new official decision is published. Open your challenge to review it.",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag:
        data.type === "test"
          ? "vq-test"
          : "vq-official-" + (data.pick_id || "decision"),
      data: { url: "/" },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clients) => {
        const existing = clients.find(
          (c) => new URL(c.url).origin === self.location.origin,
        );
        if (existing) {
          await existing.navigate("/");
          return existing.focus();
        }
        return self.clients.openWindow("/");
      }),
  );
});

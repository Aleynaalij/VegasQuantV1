import { supabase } from "./supabase";
const pending = new Map<string, Promise<PushSubscription | null>>();
export const supportsPush = () =>
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;
const preferenceKey = (uid: string) => `vq-alerts-v1:${uid}`;
export function alertsWanted(uid: string) {
  return localStorage.getItem(preferenceKey(uid)) !== "off";
}
export function setAlertsWanted(uid: string, on: boolean) {
  localStorage.setItem(preferenceKey(uid), on ? "on" : "off");
}
export function registerDevice(uid: string): Promise<PushSubscription | null> {
  const existing = pending.get(uid);
  if (existing) return existing;
  const task = (async () => {
    if (
      !supportsPush() ||
      !alertsWanted(uid) ||
      Notification.permission !== "granted"
    )
      return null;
    const registration = await navigator.serviceWorker.register("/sw.js");
    if (!registration.active)
      throw Error("The app is updating. Reload once, then retry.");
    const key = await supabase.rpc("push_public_key");
    if (key.error || !key.data)
      throw Error("Notifications are temporarily unavailable.");
    const bytes = Uint8Array.from(
      atob(String(key.data).replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0),
    );
    const old = await registration.pushManager.getSubscription();
    const sub =
      old ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: bytes,
      }));
    const session = await supabase.auth.getSession();
    if (session.data.session?.user.id !== uid || !alertsWanted(uid)) {
      if (!old) await sub.unsubscribe();
      return null;
    }
    const json = sub.toJSON();
    const saved = await supabase.rpc("register_push", {
      p_endpoint: sub.endpoint,
      p_p256dh: json.keys?.p256dh,
      p_auth: json.keys?.auth,
    });
    if (saved.error) {
      if (!old) await sub.unsubscribe();
      throw Error(
        "Could not register this device. Sign in again or remove a previous device.",
      );
    }
    window.dispatchEvent(new Event("vq-alerts-changed"));
    return sub;
  })().finally(() => pending.delete(uid));
  pending.set(uid, task);
  return task;
}
export async function disableDevice(uid: string) {
  setAlertsWanted(uid, false);
  await pending.get(uid)?.catch(() => {});
  const registration = await navigator.serviceWorker.getRegistration();
  const sub = await registration?.pushManager.getSubscription();
  if (sub) {
    const result = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", sub.endpoint)
      .eq("user_id", uid);
    if (result.error)
      throw Error("Could not disable delivery. Retry turning alerts off.");
    await sub.unsubscribe();
  }
  window.dispatchEvent(new Event("vq-alerts-changed"));
}
export async function testDevice() {
  const session = await supabase.auth.getSession();
  if (!session.data.session) throw Error("Sign in first.");
  const registration = await navigator.serviceWorker.getRegistration();
  await registration?.update();
  const installing = registration?.installing;
  if (
    installing &&
    installing.state !== "installed" &&
    installing.state !== "activated"
  ) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        installing.removeEventListener("statechange", changed);
        reject(Error("App update pending. Reload, then send the test again."));
      }, 8000);
      function changed() {
        if (
          installing!.state === "installed" ||
          installing!.state === "activated"
        ) {
          clearTimeout(timer);
          installing!.removeEventListener("statechange", changed);
          resolve();
        } else if (installing!.state === "redundant") {
          clearTimeout(timer);
          installing!.removeEventListener("statechange", changed);
          reject(Error("Reload the app, then send the test again."));
        }
      }
      installing.addEventListener("statechange", changed);
      changed();
    });
  }
  // The waiting worker understands test payloads; activate it before testing.
  if (registration?.waiting) {
    const activated = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        navigator.serviceWorker.removeEventListener("controllerchange", done);
        reject(Error("App update pending. Reload and send the test again."));
      }, 8000);
      function done() {
        clearTimeout(timeout);
        resolve();
      }
      navigator.serviceWorker.addEventListener("controllerchange", done, {
        once: true,
      });
    });
    registration.waiting.postMessage("ACTIVATE_UPDATE");
    await activated;
  }
  const sub = await registration?.pushManager.getSubscription();
  if (!sub) throw Error("Allow notifications on this device first.");
  const r = await fetch("/api/notifications/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.data.session.access_token}`,
    },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });
  const body = await r.json();
  if (!r.ok) throw Error(body.error || "Test could not be sent.");
  return body.sent
    ? "Test sent to your phone’s push service. Check your notifications."
    : "No test sent. Allow notifications first, or wait one minute between tests.";
}

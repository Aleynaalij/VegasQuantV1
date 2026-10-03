"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
export default function PickAlerts() {
  const [supported, setSupported] = useState(false),
    [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let live = true;
    const ok =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(ok);
    if (ok)
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => reg?.pushManager.getSubscription())
        .then((sub) => {
          if (live) setEnabled(!!sub);
        })
        .catch(() => {
          if (live)
            setNotice("Reload the app to initialize notification support.");
        });
    return () => {
      live = false;
    };
  }, []);
  async function toggle() {
    setBusy(true);
    setNotice("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw Error("Sign in first.");
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration?.active)
        throw Error(
          "Reload the app to initialize notification support, then retry.",
        );
      if (enabled) {
        const sub = await registration.pushManager.getSubscription();
        if (sub) {
          const deleted = await supabase
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", sub.endpoint);
          if (deleted.error) throw Error("Could not disable alerts. Retry.");
          await sub.unsubscribe();
        }
        setEnabled(false);
        setNotice("Alerts disabled on this device.");
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted")
          throw Error(
            "Notifications were not enabled. You can change this in browser settings.",
          );
        const key = await supabase.rpc("push_public_key");
        if (key.error || !key.data)
          throw Error("Alerts are temporarily unavailable.");
        const decoded = atob(
          String(key.data).replace(/-/g, "+").replace(/_/g, "/"),
        );
        const bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
        const existing = await registration.pushManager.getSubscription();
        const sub =
          existing ||
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: bytes,
          }));
        const json = sub.toJSON();
        const saved = await supabase.rpc("register_push", {
          p_endpoint: sub.endpoint,
          p_p256dh: json.keys?.p256dh,
          p_auth: json.keys?.auth,
        });
        if (saved.error) {
          if (!existing) await sub.unsubscribe();
          throw Error(
            "Could not save this device. Sign in again or disable a previous device.",
          );
        }
        setEnabled(true);
        setNotice(
          "Official decision alerts enabled on this device. No research or financial details appear on the lock screen.",
        );
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not update alerts.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="notebook">
      <h3>Official decision alerts</h3>
      <p>
        Opt in on each device. A new official publication sends a
        private-content-free notification; delivery depends on your browser and
        device settings.
      </p>
      {supported ? (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void toggle()}
        >
          {busy
            ? "Updating…"
            : enabled
              ? "Disable alerts on this device"
              : "Enable official decision alerts"}
        </button>
      ) : (
        <p className="muted">
          Install Vegas Quant on your Home Screen first. On iPhone,
          notifications require an installed app and a supported iOS version.
        </p>
      )}
      <p role="status">{notice}</p>
    </div>
  );
}

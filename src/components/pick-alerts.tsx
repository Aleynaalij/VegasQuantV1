"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  alertsWanted,
  disableDevice,
  registerDevice,
  setAlertsWanted,
  supportsPush,
  testDevice,
} from "@/lib/push-client";
export default function PickAlerts() {
  const [supported, setSupported] = useState(false),
    [wanted, setWanted] = useState(true),
    [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [permission, setPermission] = useState<NotificationPermission>("default");
  useEffect(() => {
    let live = true;
    async function refresh() {
      const ok = supportsPush();
      if (!live) return;
      setSupported(ok);
      if (!ok) return;
      const { data } = await supabase.auth.getSession();
      if (!live || !data.session) return;
      const uid = data.session.user.id,
        reg = await navigator.serviceWorker.getRegistration(),
        sub = await reg?.pushManager.getSubscription();
      if (!live) return;
      setWanted(alertsWanted(uid));
      setPermission(Notification.permission);
      if (!sub) {
        setEnabled(false);
        return;
      }
      const saved = await supabase
        .from("push_subscriptions")
        .select("id")
        .eq("endpoint", sub.endpoint)
        .eq("user_id", uid)
        .maybeSingle();
      if (live)
        setEnabled(
          !saved.error && !!saved.data && Notification.permission === "granted",
        );
    }
    void refresh();
    window.addEventListener("vq-alerts-changed", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      live = false;
      window.removeEventListener("vq-alerts-changed", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  async function change(on: boolean) {
    setBusy(true);
    setNotice("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw Error("Sign in first.");
      const uid = data.session.user.id;
      if (!on) {
        await disableDevice(uid);
        setWanted(false);
        setEnabled(false);
        setNotice("Alerts are off on this device.");
      } else {
        setAlertsWanted(uid, true);
        setWanted(true);
        const sub = await registerDevice(uid);
        setEnabled(!!sub);
        setNotice(
          sub ? "Alerts are on." : "Allow notifications below to finish setup.",
        );
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not update alerts.");
    } finally {
      setBusy(false);
    }
  }
  async function allow() {
    setBusy(true);
    setNotice("");
    try {
      // Called immediately from a tap, before any asynchronous session work.
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted")
        throw Error(
          "Your browser has not allowed notifications. Enable them in this site’s browser settings.",
        );
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw Error("Sign in first.");
      setAlertsWanted(data.session.user.id, true);
      setWanted(true);
      const sub = await registerDevice(data.session.user.id);
      if (!sub) throw Error("Could not register this device.");
      setEnabled(true);
      setNotice(await testDevice());
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not enable alerts.");
    } finally {
      setBusy(false);
    }
  }
  async function test() {
    setBusy(true);
    try {
      setNotice(await testDevice());
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Test unavailable.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="notebook">
      <h3>Official decision alerts</h3>
      <p>
        Alerts default to on. Allow notifications once on each device; we’ll
        connect it automatically on future visits. You can turn them off here
        anytime.
      </p>
      {supported ? (
        <>
          <label className="alert-preference">
            <span>
              Alerts on this device
              <strong>
                {!wanted
                  ? "Off"
                  : enabled
                    ? "On · connected"
                    : permission === "denied"
                      ? "On · blocked by browser"
                      : "On · permission/setup needed"}
              </strong>
            </span>
            <input
              type="checkbox"
              role="switch"
              aria-label="Alerts on this device"
              checked={wanted}
              disabled={busy}
              onChange={(e) => void change(e.target.checked)}
            />
          </label>
          {wanted && !enabled && (
            <button
              className="primary"
              disabled={busy || permission === "denied"}
              onClick={() => void allow()}
            >
              {busy ? "Connecting…" : "Allow & send test"}
            </button>
          )}
          {wanted && permission === "denied" && (
            <p>
              Notifications are blocked. Open your browser’s site settings for
              vegasquant.app and allow notifications, then return here.
            </p>
          )}
          {enabled && wanted && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void test()}
            >
              {busy ? "Sending…" : "Send test alert"}
            </button>
          )}
        </>
      ) : (
        <p>
          Install Vegas Quant on your Home Screen and open it there.
          Notification support depends on your browser and phone.
        </p>
      )}
      <p className="muted">
        Notifications contain no private research or bankroll details.
      </p>
      <p role="status">{notice}</p>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  alertsWanted,
  registerDevice,
  setAlertsWanted,
  supportsPush,
} from "@/lib/push-client";

// Inline ask shown after a member follows something: only on devices that can take alerts,
// haven't connected yet, and weren't switched off or blocked by the member.
export default function AlertsNudge({ subject }: { subject: string }) {
  const [uid, setUid] = useState<string | null>(null),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let live = true;
    async function check() {
      if (!supportsPush() || Notification.permission === "denied") return setShow(false);
      const s = await supabase.auth.getSession();
      const id = s.data.session?.user.id || null;
      if (!live) return;
      setUid(id);
      if (!id || !alertsWanted(id)) return setShow(false);
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      // A browser subscription only counts if the server has it for this member
      // (it may be stale or belong to an account signed in earlier).
      const saved =
        sub && Notification.permission === "granted"
          ? await supabase
              .from("push_subscriptions")
              .select("id")
              .eq("endpoint", sub.endpoint)
              .eq("user_id", id)
              .maybeSingle()
          : null;
      if (live) setShow(!saved || !!saved.error || !saved.data);
    }
    void check();
    window.addEventListener("vq-alerts-changed", check);
    return () => {
      live = false;
      window.removeEventListener("vq-alerts-changed", check);
    };
  }, []);
  if (!show || !uid) return notice ? <p role="status">{notice}</p> : null;
  async function enable() {
    setBusy(true);
    setNotice("");
    try {
      // Ask straight from the tap; browsers ignore permission requests after other awaits.
      const result = await Notification.requestPermission();
      if (result !== "granted")
        throw Error("Notifications weren’t allowed. You can turn them on later in Account.");
      setAlertsWanted(uid!, true);
      const sub = await registerDevice(uid!);
      if (!sub) throw Error("Could not connect this device. Try again from Account.");
      setShow(false);
      setNotice("Alerts are on for this device.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not turn on alerts.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="alerts-nudge">
      <p>Get a phone alert when a published pick involves {subject}.</p>
      <button type="button" className="primary" disabled={busy} onClick={enable}>
        {busy ? "Turning on…" : "Turn on alerts"}
      </button>
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}

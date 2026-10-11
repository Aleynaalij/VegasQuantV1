"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { alertsWanted, registerDevice, supportsPush } from "@/lib/push-client";
import PickAlerts from "./pick-alerts";
export default function NotificationBootstrap() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  function dismiss() {
    if (uid) localStorage.setItem(`vq-push-prompt:${uid}`, String(Date.now() + 7 * 86400000));
    setOpen(false);
  }
  useEffect(() => {
    const el = dialog.current;
    const show = () => { if (open && el && !el.open && !document.querySelector('dialog[open], [data-profile-required="true"]')) el.showModal(); };
    show();
    const timer = open ? setInterval(show, 300) : undefined;
    if (!open && el?.open) el.close();
    return () => clearInterval(timer);
  }, [open]);
  useEffect(() => {

    let live = true;
    const sync = async () => {
      const { data } = await supabase.auth.getSession();
      if (!live) return;
      const id = data.session?.user.id;
      setUid(id || null);
      if (!id) { setOpen(false); return; }
      if (!alertsWanted(id)) return;
      const sub = supportsPush() ? await registerDevice(id).catch(() => null) : null;
      if (!live) return;
      if (sub) return;
      const deferred = Number(localStorage.getItem(`vq-push-prompt:${id}`) || 0) > Date.now();
      if (!deferred) setOpen(true);
    };
    void sync();
    const listener = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => {
        if (live) void sync();
      }, 0);
    });
    window.addEventListener("focus", sync);
    return () => {
      live = false;
      listener.data.subscription.unsubscribe();
      window.removeEventListener("focus", sync);
    };
  }, []);
  return <dialog ref={dialog} className="phone-contact-dialog" aria-labelledby="push-prompt-title" onCancel={dismiss}>
    <span className="eyebrow">DON’T MISS AN UPDATE</span>
    <h2 id="push-prompt-title">Enable app notifications</h2>
    <p>Get research publications and app updates on this device. You can change your preference in Account anytime.</p>
    {open && <PickAlerts />}
    <button type="button" className="text-link" onClick={dismiss}>Maybe later</button>
  </dialog>;
}

"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { alertsWanted, registerDevice, supportsPush } from "@/lib/push-client";
import PickAlerts from "./pick-alerts";
import {
  dropPrompt,
  markPromptShown,
  mayShowPrompt,
  wantPrompt,
} from "@/lib/prompt-queue";
export default function NotificationBootstrap() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  function dismiss() {
    try {
      if (uid)
        localStorage.setItem(
          `vq-push-prompt:${uid}`,
          String(Date.now() + 7 * 86400000),
        );
    } catch {
      /* Session dismissal still works. */
    }
    setOpen(false);
  }
  useEffect(() => {
    const el = dialog.current;
    if (open) wantPrompt("push");
    else dropPrompt("push");
    const show = () => {
      if (
        open &&
        el &&
        !el.open &&
        !document.querySelector('dialog[open], [data-profile-required="true"]') &&
        mayShowPrompt("push")
      ) {
        el.showModal();
        markPromptShown("push");
      }
    };
    show();
    const timer = open ? setInterval(show, 300) : undefined;
    if (!open && el?.open) el.close();
    return () => clearInterval(timer);
  }, [open]);
  useEffect(() => {
    let live = true,
      epoch = 0;
    const sync = async () => {
      const request = ++epoch;
      const { data } = await supabase.auth.getSession();
      if (!live || request !== epoch) return;
      const id = data.session?.user.id;
      setUid(id || null);
      if (!id) {
        setOpen(false);
        return;
      }
      if (!alertsWanted(id)) {
        setOpen(false);
        return;
      }
      const sub = supportsPush()
        ? await registerDevice(id).catch(() => null)
        : null;
      if (!live || request !== epoch) return;
      if (sub) {
        setOpen(false);
        return;
      }
      let deferred = false;
      try {
        deferred =
          Number(localStorage.getItem(`vq-push-prompt:${id}`) || 0) >
          Date.now();
      } catch {
        /* Storage may be disabled. */
      }
      if (!deferred) setOpen(true);
    };
    void sync();
    const listener = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => {
        if (live) void sync();
      }, 0);
    });
    const changed = () => setOpen(false);
    window.addEventListener("vq-alerts-changed", changed);
    window.addEventListener("focus", sync);
    return () => {
      live = false;
      listener.data.subscription.unsubscribe();
      window.removeEventListener("vq-alerts-changed", changed);
      window.removeEventListener("focus", sync);
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="phone-contact-dialog"
      aria-labelledby="push-prompt-title"
      onCancel={dismiss}
    >
      <span className="eyebrow">DON’T MISS AN UPDATE</span>
      <h2 id="push-prompt-title">Enable app notifications</h2>
      <p>
        Get research publications and app updates on this device. You can change
        your preference in Account anytime.
      </p>
      {open && <PickAlerts />}
      <button type="button" className="text-link" onClick={dismiss}>
        Maybe later
      </button>
    </dialog>
  );
}

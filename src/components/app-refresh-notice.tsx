"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { dropPrompt, markPromptShown, wantPrompt } from "@/lib/prompt-queue";
import BrandMark from "./brand-mark";

const VERSION = "gold-2026-10-22-v2";
/** A per-account/device acknowledgement. Browsers cannot uninstall an app or verify a reinstall. */
export default function AppRefreshNotice() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [needed, setNeeded] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    setIos(/iPad|iPhone|iPod/.test(navigator.userAgent));
    let live = true;
    const sync = (id: string | null) => {
      if (!live) return;
      setUid(id);
      setConfirmed(false);
      let acknowledged = false;
      try { acknowledged = !!id && localStorage.getItem(`vq-app-refresh:${id}`) === VERSION; } catch {}
      setNeeded(!!id && !acknowledged);
    };
    let seenAuth = false;
    void supabase.auth.getSession().then(r => { if (!seenAuth) sync(r.data.session?.user.id ?? null); }).catch(() => {});
    let current: string | null | undefined;
    const auth = supabase.auth.onAuthStateChange((_event, session) => {
      seenAuth = true;
      const id = session?.user.id ?? null;
      if (id === current) return;
      current = id;
      sync(id);
    });
    return () => { live = false; auth.data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    const el = dialog.current;
    if (!needed) { if (el?.open) el.close(); return; }
    wantPrompt("profile");
    const show = () => {
      if (el && !el.open && !document.querySelector('dialog[open], [data-profile-required="true"]')) {
        el.showModal();
        markPromptShown("profile");
      }
    };
    // Let the launch identity and any required onboarding finish first.
    const start = window.setTimeout(show, 1900);
    const poll = window.setInterval(show, 2400);
    return () => { clearTimeout(start); clearInterval(poll); dropPrompt("profile"); el?.close(); };
  }, [needed]);
  function acknowledge() {
    if (!uid || !confirmed) return;
    try { localStorage.setItem(`vq-app-refresh:${uid}`, VERSION); } catch {}
    setNeeded(false);
  }
  return (
    <dialog ref={dialog} className="app-refresh-dialog" aria-labelledby="app-refresh-title" onCancel={e => e.preventDefault()}>
      <BrandMark />
      <span className="eyebrow">APP UPDATE REQUIRED</span>
      <h2 id="app-refresh-title">Get the new gold Vegas Quant app</h2>
      <p>The blue launch icon belongs to an older installation. Update this device to get the matching gold icon and opening screen.</p>
      <ol>
        <li>Close Vegas Quant and remove or uninstall the old app from your home screen.</li>
        <li>Open <strong>vegasquant.app</strong> in {ios ? "Safari" : "your browser"}.</li>
        <li>{ios ? "Tap Share → Add to Home Screen." : "Open the browser menu → Install app or Add to Home Screen."}</li>
      </ol>
      <p>Your account and published picks stay on Vegas Quant. Sign in again if asked. Browser-only users can refresh the website; no installation is required.</p>
      <label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I’ve reinstalled the app on this device, or I’m using the updated website.</label>
      <button type="button" className="primary" disabled={!confirmed} onClick={acknowledge}>Continue to Vegas Quant</button>
    </dialog>
  );
}

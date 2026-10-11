"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function PhoneContactPrompt() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let alive = true;
    let generation = 0;
    async function load(manual = false) {
      const current = ++generation;
      const { data } = await supabase.auth.getSession();
      const id = data.session?.user.id;
      if (!alive || current !== generation) return;
      setUid(id || null);
      if (!id) { setOpen(false); return; }
      const r = await supabase.from("member_phone_contacts").select("phone,sms_opt_in").eq("user_id", id).maybeSingle();
      if (!alive || current !== generation || r.error) return;
      setPhone(r.data?.phone || ""); setOptIn(r.data?.sms_opt_in || false); setNotice("");
      const deferred = Number(localStorage.getItem(`vq-phone-later:${id}`) || 0) > Date.now();
      if (manual || (!r.data && !deferred)) setOpen(true);
    }
    void load();
    const auth = supabase.auth.onAuthStateChange(() => { setTimeout(() => void load(), 0); });
    const edit = () => void load(true);
    window.addEventListener("vq:phone-settings", edit);
    return () => { alive = false; auth.data.subscription.unsubscribe(); window.removeEventListener("vq:phone-settings", edit); };
  }, []);
  useEffect(() => {
    const el = dialog.current;
    const show = () => { if (open && el && !el.open && !document.querySelector('dialog[open], [data-profile-required="true"]')) el.showModal(); };
    show();
    const timer = open ? setInterval(show, 300) : undefined;
    if (!open && el?.open) el.close();
    return () => clearInterval(timer);
  }, [open]);
  function later() {
    if (uid) localStorage.setItem(`vq-phone-later:${uid}`, String(Date.now() + 7 * 86400000));
    setOpen(false);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!uid) return;
    const value = phone.replace(/[\s().-]/g, "");
    if (!/^\+[1-9]\d{7,14}$/.test(value)) { setNotice("Include the country code, for example +1 202 555 0123."); return; }
    setBusy(true); setNotice("");
    const r = await supabase.from("member_phone_contacts").upsert({ user_id: uid, phone: value, sms_opt_in: optIn, consent_at: optIn ? new Date().toISOString() : null, consent_version: "sms-interest-v1", updated_at: new Date().toISOString() });
    setBusy(false);
    if (r.error) { setNotice("Could not save your number. Please try again."); return; }
    setNotice("Number saved privately. Text alerts are not active yet.");
    setOpen(false);
  }
  async function remove() {
    if (!uid) return;
    setBusy(true);
    const r = await supabase.from("member_phone_contacts").delete().eq("user_id", uid);
    setBusy(false);
    if (r.error) { setNotice("Could not remove your number. Please try again."); return; }
    setPhone(""); setOptIn(false); later();
  }
  return <dialog ref={dialog} className="phone-contact-dialog" aria-labelledby="phone-contact-title" onCancel={later}>
    <span className="eyebrow">STAY CONNECTED</span>
    <h2 id="phone-contact-title">Add your mobile number</h2>
    <p>Your number stays private. We’re preparing optional app-update texts; SMS delivery and phone verification are not active yet.</p>
    <form onSubmit={save}>
      <label htmlFor="contact-phone">Mobile number with country code</label>
      <input id="contact-phone" type="tel" autoComplete="tel" placeholder="+1 202 555 0123" required value={phone} onChange={e=>setPhone(e.target.value)} />
      <label className="phone-contact-consent"><input type="checkbox" checked={optIn} onChange={e=>setOptIn(e.target.checked)} /><span>I’d like optional Vegas Quant app-update texts when available. Frequency varies. Message and data rates may apply. I can withdraw this preference in Account. This is not required to use the app.</span></label>
      {notice && <p role="status">{notice}</p>}
      <button className="primary" disabled={busy}>{busy ? "Saving…" : "Save number"}</button>
      <button type="button" className="text-link" onClick={later}>{notice.startsWith("Number saved") ? "Done" : "Maybe later"}</button>
      {phone && <button type="button" className="text-link" disabled={busy} onClick={remove}>Remove my saved number</button>}
    </form>
  </dialog>;
}

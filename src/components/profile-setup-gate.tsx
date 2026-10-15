"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import CommunitySettings from "./community-settings";
import { dropPrompt, markPromptShown, wantPrompt } from "@/lib/prompt-queue";

export default function ProfileSetupGate() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [required, setRequired] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true, generation = 0;
    async function check() {
      const current = ++generation;
      const { data } = await supabase.auth.getSession();
      if (!live || current !== generation) return;
      const id = data.session?.user.id;
      setUid(id || null);
      if (!id) { setRequired(false); dropPrompt("profile"); return; }
      // Hold the visit until we know whether setup is required, so optional pop-ups can't go first.
      wantPrompt("profile");
      const r = await supabase.from("community_profiles").select("username,avatar").eq("user_id", id).maybeSingle();
      if (!live || current !== generation) return;
      setError(!!r.error);
      const p = r.data;
      const needed = !!r.error || !p || !/^[A-Za-z0-9_]{3,24}$/.test(p.username || "") || /^Member_[a-f0-9]{8}$/i.test(p.username || "") || !p.avatar;
      setRequired(needed);
      if (!needed) dropPrompt("profile");
    }
    void check();
    const listener = supabase.auth.onAuthStateChange(() => { setTimeout(() => void check(), 0); });
    window.addEventListener("vq-community-changed", check);
    return () => { live = false; listener.data.subscription.unsubscribe(); window.removeEventListener("vq-community-changed", check); };
  }, []);
  useEffect(() => {
    const el = dialog.current;
    const show = () => { if (required && el && !el.open && !document.querySelector("dialog[open]")) { el.showModal(); markPromptShown("profile"); } };
    show();
    const timer = required ? setInterval(show, 300) : undefined;
    if (!required && el?.open) el.close();
    return () => clearInterval(timer);
  }, [required]);
  return <dialog ref={dialog} className="phone-contact-dialog profile-setup-dialog" data-profile-required={required} aria-labelledby="community-profile-title" onCancel={e => e.preventDefault()}>
    <span className="eyebrow">FINISH YOUR PROFILE</span>
    {uid && required && <CommunitySettings key={uid} uid={uid} required />}
    {error && <p role="status">We couldn’t check your profile. Use Retry above to load it again.</p>}
    <button type="button" className="text-link" onClick={() => void supabase.auth.signOut()}>Sign out</button>
  </dialog>;
}

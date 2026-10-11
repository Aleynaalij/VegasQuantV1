"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
const key = "vq-theme-v1";
function apply(theme: string) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0b1220" : "#ffffff");
  try { localStorage.setItem(key, theme); } catch {}
  window.dispatchEvent(new Event("vq-theme"));
}
export function ThemeSettings() {
  const [theme, setTheme] = useState("light");
  useEffect(() => {
    const update = () => setTheme(document.documentElement.dataset.theme || "light");
    update(); window.addEventListener("vq-theme", update);
    return () => window.removeEventListener("vq-theme", update);
  }, []);
  return <div className="theme-options" role="group" aria-label="Appearance">
    {["light", "dark"].map(t => <button key={t} type="button" aria-pressed={theme === t} className={theme === t ? "selected" : ""} onClick={() => apply(t)}>{t === "light" ? "☀ Light" : "☾ Dark"}</button>)}
  </div>;
}
export default function ThemePrompt() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const check = (id?: string) => {
      if (!live) return;
      let chosen = false;
      try { chosen = !!localStorage.getItem(`vq-theme-choice-v1:${id}`); } catch {}
      setUid(id && !chosen ? id : null);
    };
    void supabase.auth.getSession().then(({data}) => check(data.session?.user.id));
    const {data} = supabase.auth.onAuthStateChange((_e,s) => check(s?.user.id));
    return () => { live = false; data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (uid) dialog.current?.showModal(); else dialog.current?.close();
  }, [uid]);
  function done() {
    if (uid) try { localStorage.setItem(`vq-theme-choice-v1:${uid}`, "1"); } catch {}
    setUid(null);
  }
  return <dialog ref={dialog} className="theme-dialog" aria-labelledby="theme-heading" onCancel={done}>
    <span className="eyebrow">YOUR VIEW. YOUR ZONE.</span>
    <h2 id="theme-heading">Choose your look</h2>
    <p>Bright and clear, or dark and focused. You can change this anytime in Account → Appearance.</p>
    <ThemeSettings />
    <button className="primary" onClick={done}>Continue</button>
  </dialog>;
}

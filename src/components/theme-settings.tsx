"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
/** v2 resets everyone to dark once (Oct 2026); only an explicit Light choice is stored. */
const key = "vq-theme-v2";
function apply(theme: string) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#070b14" : "#ffffff");
  try { localStorage.setItem(key, theme); } catch {}
  window.dispatchEvent(new Event("vq-theme"));
}
export function ThemeSettings() {
  const [theme, setTheme] = useState("dark");
  useEffect(() => {
    const update = () => setTheme(document.documentElement.dataset.theme || "dark");
    update(); window.addEventListener("vq-theme", update);
    return () => window.removeEventListener("vq-theme", update);
  }, []);
  return <div className="theme-options" role="group" aria-label="Appearance">
    {["light", "dark"].map(t => <button key={t} type="button" aria-pressed={theme === t} className={theme === t ? "selected" : ""} onClick={() => apply(t)}>{t === "light" ? "☀ Light" : "☾ Dark"}</button>)}
  </div>;
}
/** Keeps the browser theme-color in sync with the active theme. Dark is the default; Light lives in Account → Appearance. */
export default function ThemePrompt() {
  const pathname = usePathname();
  useEffect(() => {
    const theme = document.documentElement.dataset.theme || "dark";
    document.querySelectorAll('meta[name="theme-color"]').forEach(meta => meta.setAttribute("content", theme === "dark" ? "#070b14" : "#ffffff"));
  }, [pathname]);
  return null;
}

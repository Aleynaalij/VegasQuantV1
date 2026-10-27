"use client";
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SCRUB_START_PX, scrubIndex } from "@/lib/tab-scrub";

/** One light tick: vibration on Android; on iPhone (iOS 18+) the system switch haptic. */
function tick() {
  if (typeof navigator.vibrate === "function") {
    navigator.vibrate(8);
    return;
  }
  const label = document.createElement("label");
  label.ariaHidden = "true";
  label.style.display = "none";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  label.append(input);
  document.head.append(label);
  label.click();
  label.remove();
}

/**
 * Slide a finger along the tab bar: the tab under it lights gold with a tick as you cross each
 * icon, and lifting the finger opens that tab. Taps keep working exactly as before.
 */
export default function TabScrub() {
  const anchor = useRef<HTMLSpanElement>(null);
  const router = useRouter(),
    pathname = usePathname();
  // A new page arrived: its own active tab takes the gold back.
  useEffect(() => {
    const nav = anchor.current?.parentElement;
    nav?.classList.remove("scrub-pending");
    nav?.querySelectorAll(".scrub-target").forEach((a) => a.classList.remove("scrub-target"));
  }, [pathname]);
  useEffect(() => {
    const nav = anchor.current?.parentElement;
    if (!nav) return;
    let drag: { id: number; x: number; on: boolean; index: number; links: HTMLAnchorElement[] } | null = null;
    let suppressUntil = 0;
    const links = () => Array.from(nav.querySelectorAll<HTMLAnchorElement>("a[href]"));
    const mark = (list: HTMLAnchorElement[], index: number) =>
      list.forEach((a, i) => a.classList.toggle("scrub-target", i === index));
    const reset = (keep = -1) => {
      nav.classList.remove("scrubbing");
      if (drag) mark(drag.links, keep);
      drag = null;
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || !e.isPrimary) return;
      drag = { id: e.pointerId, x: e.clientX, on: false, index: -1, links: links() };
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.on) {
        if (Math.abs(e.clientX - drag.x) < SCRUB_START_PX) return;
        drag.on = true;
        nav.classList.add("scrubbing");
        try { nav.setPointerCapture(e.pointerId); } catch {}
      }
      const index = scrubIndex(e.clientX, drag.links.map((a) => a.getBoundingClientRect()));
      if (index !== drag.index) {
        if (drag.index >= 0) tick();
        drag.index = index;
        mark(drag.links, index);
      }
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const { on, index, links: list } = drag;
      const target = on && index >= 0 ? list[index] : null;
      const going = !!target && target.getAttribute("aria-current") !== "page";
      // Keep the gold on the chosen tab until its page arrives.
      reset(going ? index : -1);
      if (!target) return;
      // The finger lifted after a slide: open the tab under it instead of whatever it started on.
      suppressUntil = performance.now() + 600;
      if (going) {
        nav.classList.add("scrub-pending");
        // Slow or failed navigation: hand the gold back to the tab you're actually on.
        window.setTimeout(() => {
          nav.classList.remove("scrub-pending");
          target.classList.remove("scrub-target");
        }, 4000);
        router.push(target.getAttribute("href") || "/");
      }
    };
    const cancel = (e: PointerEvent) => { if (drag && e.pointerId === drag.id) reset(); };
    const click = (e: MouseEvent) => {
      if (performance.now() < suppressUntil) { e.preventDefault(); e.stopPropagation(); }
    };
    nav.addEventListener("pointerdown", down);
    nav.addEventListener("pointermove", move);
    nav.addEventListener("pointerup", up);
    nav.addEventListener("pointercancel", cancel);
    nav.addEventListener("click", click, true);
    return () => {
      nav.removeEventListener("pointerdown", down);
      nav.removeEventListener("pointermove", move);
      nav.removeEventListener("pointerup", up);
      nav.removeEventListener("pointercancel", cancel);
      nav.removeEventListener("click", click, true);
    };
  }, [router]);
  return <span ref={anchor} hidden />;
}

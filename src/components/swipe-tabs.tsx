"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { swipeStep } from "@/lib/tab-swipe";

/** Touch navigation supplements the existing accessible links; never captures scroll. */
export default function SwipeTabs() {
  const pathname = usePathname();
  useEffect(() => {
    let start: { x: number; y: number; at: number; id: number; links: HTMLAnchorElement[]; index: number } | null = null;
    const begin = (event: TouchEvent) => {
      start = null;
      if (event.touches.length !== 1 || window.visualViewport && window.visualViewport.scale > 1) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || document.querySelector('dialog[open], [aria-modal="true"]')) return;
      if (target.closest('input, textarea, select, button, [contenteditable="true"], [role="slider"], [data-no-tab-swipe]')) return;
      const shell = target.closest(".shell");
      if (!shell) return;
      const nav = target.closest('nav[data-swipe-tabs]');
      if (!nav && (!target.closest("#main-content") || target.closest("a, .vq-footer"))) return;
      // Let card carousels, tables and horizontal lists keep their own gestures.
      if (!nav) {
        for (let el = target; el && el.id !== "main-content"; el = el.parentElement!) {
          if (el.scrollWidth > el.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(el).overflowX)) return;
        }
      }
      const bar = nav || shell.querySelector('nav.mobile-nav');
      const anchors = Array.from(bar?.querySelectorAll<HTMLAnchorElement>("a[href]") || []);
      const index = anchors.findIndex(a => a.getAttribute("aria-current") === "page");
      if (index < 0) return;
      // Detail/legal/admin pages keep their own gestures; only tab landing pages swipe.
      if (!nav && new URL(anchors[index].href).pathname !== pathname) return;
      const touch = event.touches[0];
      // Preserve native browser back/forward gestures at the edges.
      if (touch.clientX < 28 || touch.clientX > window.innerWidth - 28) return;
      start = { x: touch.clientX, y: touch.clientY, at: performance.now(), id: touch.identifier,
        links: anchors, index };
    };
    const move = (event: TouchEvent) => {
      if (!start) return;
      if (event.touches.length !== 1) { start = null; return; }
      const t = event.touches[0];
      if (Math.abs(t.clientY - start.y) > 24 && Math.abs(t.clientY - start.y) > Math.abs(t.clientX - start.x)) start = null;
    };
    const end = (event: TouchEvent) => {
      const gesture = start;
      start = null;
      if (!gesture || event.touches.length) return;
      const touch = Array.from(event.changedTouches).find(t => t.identifier === gesture.id);
      if (!touch || window.getSelection()?.toString()) return;
      const step = swipeStep(touch.clientX - gesture.x, touch.clientY - gesture.y, performance.now() - gesture.at);
      const next = gesture.index + step;
      // Use the same navigation as tapping (including Zone's query-string filters).
      if (step && next >= 0 && next < gesture.links.length) gesture.links[next].click();
    };
    const cancel = () => { start = null; };
    document.addEventListener("touchstart", begin, { passive: true });
    document.addEventListener("touchmove", move, { passive: true });
    document.addEventListener("touchend", end, { passive: true });
    document.addEventListener("touchcancel", cancel, { passive: true });
    return () => {
      document.removeEventListener("touchstart", begin);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", cancel);
    };
  }, [pathname]);
  return null;
}

"use client";
import dynamic from "next/dynamic";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import type { Home2Props } from "@/components/home2/home2";
import { supabase } from "@/lib/supabase";
import { createOwnerPreviewSelection } from "@/lib/production-owner-client";
const loadHome = () => import("./home3-experience");
const loadZone = () => import("@/components/zone2/zone2-experience");
const Home = dynamic(loadHome);
const Zone = dynamic(loadZone);

/**
 * A device hint, not a permission: set after the server approved this device's signed-in account,
 * cleared on any answer of no. When present, the classic page is held behind a short placeholder
 * until the server answers again, so an approved owner never sees classic flash first. The server's
 * answer alone still decides what renders; without the hint (everyone else) nothing changes.
 */
const HINT = "vq-owner-preview-hint";
const PENDING = "ownerPreview";
const HOLD_MS = 7000;
const holdScript = `try{if(localStorage.getItem("${HINT}")==="1"){document.documentElement.dataset.${PENDING}="pending";setTimeout(function(){delete document.documentElement.dataset.${PENDING}},${HOLD_MS})}}catch(e){}`;
const holdCss = `.vq-owner-wait{display:none;padding:48px 16px;color:var(--muted,#9aa3ad);text-align:center}.vq-owner-held{display:block}html[data-owner-preview="pending"] .vq-owner-classic{display:none!important}html[data-owner-preview="pending"] .vq-owner-wait{display:block}`;
const clearPending = () => {
  delete document.documentElement.dataset[PENDING];
};
const readHint = () => {
  try {
    return localStorage.getItem(HINT) === "1";
  } catch {
    return false;
  }
};
const noSubscribe = () => () => {};
const remember = (on: boolean) => {
  try {
    if (on) localStorage.setItem(HINT, "1");
    else localStorage.removeItem(HINT);
  } catch {}
};

/** Mounted only by server configuration; renders classic until server approval. */
export default function ProductionOwnerExperience({
  surface,
  home,
  children,
}: {
  surface: "home" | "zone";
  home?: Omit<Home2Props, "gameHref">;
  children: ReactNode;
}) {
  const [enabled, setEnabled] = useState(false);
  // Client-rendered path (e.g. behind the age gate): hold classic in state. Server-rendered path:
  // the inline script below hides it before paint. Either way, released on the server's answer.
  const hinted = useSyncExternalStore(noSubscribe, readHint, () => false);
  const [resolved, setResolved] = useState(false);
  const held = hinted && !resolved;
  const selected = useRef(false);
  useEffect(() => {
    let active = true,
      observed = false,
      current: Session | null = null;
    const release = () => {
      clearPending();
      if (active) setResolved(true);
    };
    if (readHint()) void (surface === "home" ? loadHome() : loadZone());
    const holdTimer = setTimeout(release, HOLD_MS);
    const selection = createOwnerPreviewSelection((next, settled) => {
      selected.current = next;
      setEnabled(next);
      if (settled) {
        remember(next);
        release();
      }
    });
    const update = (session: Session | null) => {
      observed = true;
      current = session;
      // Signed out: nothing to wait for, show classic now (the hint stays for the next sign-in).
      if (!session) release();
      // Supabase auth callbacks must not await another SDK operation.
      void selection.check(null);
      queueMicrotask(() => {
        if (active && current === session)
          void selection.check(session?.access_token ?? null);
      });
    };
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      update(session),
    );
    void supabase.auth
      .getSession()
      .then((r) => {
        if (active && !observed) update(r.data.session);
      })
      .catch(() => {
        if (active) update(null);
      });
    const refresh = () => {
      if (document.visibilityState !== "hidden")
        void selection.check(current?.access_token ?? null, false);
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = setInterval(() => {
      if (selected.current) refresh();
    }, 60000);
    return () => {
      clearPending();
      active = false;
      clearTimeout(holdTimer);
      selection.dispose();
      data.subscription.unsubscribe();
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
    // The surface never changes for a mounted instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!enabled)
    return (
      <>
        <script dangerouslySetInnerHTML={{ __html: holdScript }} />
        <style dangerouslySetInnerHTML={{ __html: holdCss }} />
        <p
          className={`vq-owner-wait${held ? " vq-owner-held" : ""}`}
          role="status"
        >
          Opening your {surface === "home" ? "Home" : "Zone"}…
        </p>
        <div
          className="vq-owner-classic"
          style={{ display: held ? "none" : "contents" }}
        >
          {children}
        </div>
      </>
    );
  return surface === "home" && home ? (
    <Home {...home} />
  ) : (
    <Zone basePath="/community" />
  );
}

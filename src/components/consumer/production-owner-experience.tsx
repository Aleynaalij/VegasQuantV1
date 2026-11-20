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
/** Opt-in choice, this device only (Mike). Eligibility is still the server's answer every time. */
const OPTIN = "vq-new-home-optin";
const readOptin = () => {
  try {
    return localStorage.getItem(OPTIN) === "1";
  } catch {
    return false;
  }
};
const optinCss = `.vq-optin{display:flex;align-items:center;justify-content:space-between;gap:12px;max-width:1120px;margin:8px auto 12px;padding:10px 14px;border:1px solid #ffffff17;border-radius:12px;background:#11161f;color:var(--muted,#b9c0ca);font-size:13.5px}.vq-optin b{color:var(--text,#f4f5ec)}.vq-optin button{flex:none;min-height:36px;padding:0 14px;border:1px solid #f4dc99;border-radius:999px;background:transparent;color:#f4dc99;font:inherit;font-weight:800;cursor:pointer}.vq-optin.is-on button{border-color:#ffffff33;color:var(--muted,#b9c0ca)}`;
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
  const [eligible, setEligible] = useState(false);
  const [optedIn, setOptedIn] = useState(false);
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
    setOptedIn(readOptin());
    const selection = createOwnerPreviewSelection((next, settled, may) => {
      // selected: something new is on screen and worth re-checking (owner, or an opted-in member).
      selected.current = next || (may && readOptin());
      setEnabled(next);
      setEligible(may);
      if (settled) {
        remember(next || (may && readOptin()));
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
  const choose = (on: boolean) => {
    try {
      if (on) localStorage.setItem(OPTIN, "1");
      else localStorage.removeItem(OPTIN);
    } catch {}
    remember(on);
    setOptedIn(on);
    selected.current = on;
  };
  // Owners always see the new experience; eligible members choose it (and can go back).
  const member = eligible && !enabled;
  const show = enabled || (member && optedIn);
  const label = surface === "home" ? "Home" : "Zone";
  const bar = member ? (
    <>
      <style dangerouslySetInnerHTML={{ __html: optinCss }} />
      <div
        className={`vq-optin${show ? " is-on" : ""}`}
        role="region"
        aria-label="New experience"
      >
        {show ? (
          <span>
            You&rsquo;re trying the new <b>{label}</b>.
          </span>
        ) : (
          <span>
            Members: the new <b>{label}</b> is ready to try.
          </span>
        )}
        <button type="button" onClick={() => choose(!show)}>
          {show ? "Back to classic" : `Try the new ${label}`}
        </button>
      </div>
    </>
  ) : null;
  if (!show)
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
          {held ? null : bar}
          {children}
        </div>
      </>
    );
  return (
    <>
      {bar}
      {surface === "home" && home ? (
        <Home {...home} />
      ) : (
        <Zone basePath="/community" />
      )}
    </>
  );
}

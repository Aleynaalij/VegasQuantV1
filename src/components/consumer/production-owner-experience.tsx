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
/**
 * The member's own choice on this device (Mike: remembered per device): "new" or "classic". Unset
 * means: follow the server (new by default in default-on mode, classic in opt-in). Eligibility is
 * still the server's answer every time. The earlier opt-in key counts as "new".
 */
const CHOICE = "vq-new-home-choice";
const OPTIN = "vq-new-home-optin";
const readChoice = (): "new" | "classic" | null => {
  try {
    const c = localStorage.getItem(CHOICE);
    if (c === "new" || c === "classic") return c;
    return localStorage.getItem(OPTIN) === "1" ? "new" : null;
  } catch {
    return null;
  }
};
const wantsNew = (preferred: boolean) => {
  const c = readChoice();
  return c === "new" || (c !== "classic" && preferred);
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
  const [preferred, setPreferred] = useState(false);
  const [choice, setChoice] = useState<"new" | "classic" | null>(null);
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
    setChoice(readChoice());
    const selection = createOwnerPreviewSelection(
      (next, settled, may, prefer) => {
        // selected: something new is on screen and worth re-checking.
        const on = next || (may && wantsNew(prefer));
        selected.current = on;
        setEnabled(next);
        setEligible(may);
        setPreferred(prefer);
        if (settled) {
          remember(on);
          release();
        }
      },
    );
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
      localStorage.setItem(CHOICE, on ? "new" : "classic");
      localStorage.removeItem(OPTIN);
    } catch {}
    remember(on);
    setChoice(on ? "new" : "classic");
    selected.current = on;
  };
  // Owners always see the new experience; other eligible accounts start where the server says
  // (new in default-on, classic in opt-in) and can switch either way.
  const member = eligible && !enabled;
  const show =
    enabled ||
    (member && (choice === "new" || (choice !== "classic" && preferred)));
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
            {preferred ? "Welcome to" : "You\u2019re trying"} the new{" "}
            <b>{label}</b>.
          </span>
        ) : (
          <span>
            {preferred ? "You\u2019re on the classic" : "Members: the new"}{" "}
            <b>{label}</b>
            {preferred ? "." : " is ready to try."}
          </span>
        )}
        <button type="button" onClick={() => choose(!show)}>
          {show
            ? "Back to classic"
            : preferred
              ? `Switch to the new ${label}`
              : `Try the new ${label}`}
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

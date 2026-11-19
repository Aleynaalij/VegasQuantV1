"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Home2Props } from "@/components/home2/home2";
import { supabase } from "@/lib/supabase";
import { createOwnerPreviewSelection } from "@/lib/production-owner-client";
const Home = dynamic(() => import("./home-experience"));
const Zone = dynamic(() => import("@/components/zone2/zone2-experience"));

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
  const selected = useRef(false);
  useEffect(() => {
    let active = true,
      observed = false,
      current: Session | null = null;
    const selection = createOwnerPreviewSelection((next) => {
      selected.current = next;
      setEnabled(next);
    });
    const update = (session: Session | null) => {
      observed = true;
      current = session;
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
      active = false;
      selection.dispose();
      data.subscription.unsubscribe();
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  if (!enabled) return children;
  return surface === "home" && home ? (
    <Home {...home} ordinaryLinks />
  ) : (
    <Zone basePath="/community" />
  );
}

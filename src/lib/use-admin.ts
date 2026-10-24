"use client";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

// Records (the published record, performance and tailed-pick history) are admin-only. is_admin
// needs an MFA-verified (aal2) session, so one check is shared per account *and* assurance level:
// completing MFA in the same account re-checks.
let cached: { key: string; admin: Promise<boolean> } | null = null;

function assurance(token: string) {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return String(JSON.parse(atob(part)).aal ?? "");
  } catch {
    return "";
  }
}
export const sessionKey = (s: Session | null) =>
  s ? `${s.user.id}:${assurance(s.access_token)}` : null;

async function adminFor(key: string | null) {
  if (!key) return false;
  if (cached?.key !== key)
    cached = {
      key,
      admin: Promise.resolve(supabase.rpc("is_admin")).then(
        (r) => !r.error && r.data === true,
        () => false,
      ),
    };
  return cached.admin;
}

export async function checkAdmin(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return adminFor(sessionKey(data.session));
}

/** true or false once known; null while checking. */
export function useIsAdmin() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    let current: string | null | undefined;
    const sync = (session: Session | null) => {
      const key = sessionKey(session);
      if (key === current) return;
      current = key;
      setAdmin(null);
      void adminFor(key).then((a) => {
        if (live && current === key) setAdmin(a);
      });
    };
    void supabase.auth.getSession().then((r) => sync(r.data.session));
    // Sign-in, sign-out, a different account or a completed MFA step all change the key.
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      sync(session),
    );
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return admin;
}

"use client";
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { onUserChange } from "./auth-user";

// Records (the published record, performance and tailed-pick history) are admin-only. One
// is_admin check per signed-in account is shared by every component that asks.
let cached: { uid: string | null; admin: Promise<boolean> } | null = null;

export async function checkAdmin(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id ?? null;
  if (!uid) return false;
  if (cached?.uid !== uid)
    cached = {
      uid,
      admin: Promise.resolve(supabase.rpc("is_admin")).then(
        (r) => !r.error && r.data === true,
        () => false,
      ),
    };
  return cached.admin;
}

/** true or false once known; null while checking. */
export function useIsAdmin() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      void checkAdmin().then((a) => {
        if (live) setAdmin(a);
      });
    load();
    const stop = onUserChange(() => {
      cached = null;
      setAdmin(null);
      load();
    });
    return () => {
      live = false;
      stop();
    };
  }, []);
  return admin;
}

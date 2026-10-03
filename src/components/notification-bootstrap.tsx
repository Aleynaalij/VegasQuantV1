"use client";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { registerDevice, supportsPush } from "@/lib/push-client";
export default function NotificationBootstrap() {
  useEffect(() => {
    if (!supportsPush()) return;
    let live = true;
    const sync = async () => {
      const { data } = await supabase.auth.getSession();
      if (live && data.session)
        await registerDevice(data.session.user.id).catch(() => {});
    };
    void sync();
    const listener = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => {
        if (live) void sync();
      }, 0);
    });
    window.addEventListener("focus", sync);
    return () => {
      live = false;
      listener.data.subscription.unsubscribe();
      window.removeEventListener("focus", sync);
    };
  }, []);
  return null;
}

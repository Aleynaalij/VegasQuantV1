"use client";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { onUserChange } from "@/lib/auth-user";
import { anniversaryState } from "@/lib/frank-anniversary";
import { nhlHeld, setNhlHeld, subscribeNhlHold } from "@/lib/frank-hold";
import { FrankAnniversaryCorner } from "./frank-anniversary";

/** Longest the NHL chip waits on the status read before showing anyway. */
const HOLD_LIMIT_MS = 8000;

/**
 * Owner (Oct 31): Frank's surprise greets him as soon as he signs in, before he can see NHL in the
 * sport chips. Mounted on every page; the server answers "hidden" for everyone but Frank. The NHL
 * desk is the surprise's destination (it plays the fireworks), so the invitation never mounts there.
 */
export default function FrankAnniversaryGate() {
  const path = usePathname() || "";
  const onNhl = path === "/nhl" || path.startsWith("/nhl/");
  useEffect(() => {
    // Status reads never consume the surprise; only the invitation's Yes does.
    let live = true,
      epoch = 0;
    async function check() {
      const n = ++epoch;
      setNhlHeld(true);
      const limit = setTimeout(() => setNhlHeld(false), HOLD_LIMIT_MS);
      try {
        const session = await supabase.auth.getSession();
        if (!live || n !== epoch) return;
        if (!session.data.session) return setNhlHeld(false);
        const r = await supabase.rpc("frank_anniversary", {
          p_action: "status",
        });
        if (!live || n !== epoch) return;
        // Keep NHL out of sight while the invitation is on offer or mid-reveal.
        const state = r.error ? "hidden" : anniversaryState(r.data).state;
        setNhlHeld(state === "offer" || state === "revealed");
      } catch {
        if (live && n === epoch) setNhlHeld(false);
      } finally {
        clearTimeout(limit);
      }
    }
    void check();
    const stop = onUserChange(() => void check());
    return () => {
      live = false;
      stop();
    };
  }, []);
  return onNhl ? null : <FrankAnniversaryCorner />;
}

/** The NHL chip, kept out of sight while Frank's surprise status is pending or on offer. */
export function NhlChipHold({ children }: { children: ReactNode }) {
  const held = useSyncExternalStore(subscribeNhlHold, nhlHeld, () => true);
  return held ? null : <>{children}</>;
}

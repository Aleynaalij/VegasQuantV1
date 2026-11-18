"use client";
import { useEffect, useSyncExternalStore } from "react";
import type { AuthChangeEvent } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { createViewerSessionClient } from "./viewer-session-client";
import {
  emptyViewer,
  projectViewerUser,
  type ViewerIdentity,
  type ViewerSession,
} from "./viewer-contract";
export type {
  ViewerIdentity,
  ViewerSession,
  ViewerUser,
} from "./viewer-contract";
export const combinedViewer = process.env.VQ_COMBINED_STAGE_BUILD === "1";
const client = createViewerSessionClient();
let consumers = 0;
let stop: (() => void) | undefined;
function watch() {
  if (typeof window === "undefined") return () => {};
  if (++consumers === 1) {
    const refresh = () => {
      if (document.visibilityState !== "hidden") void client.read(true);
    };
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("vq-viewer-invalidation")
        : null;
    const external = () => {
      client.invalidate();
      void client.read(true);
    };
    channel?.addEventListener("message", external);
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", refresh);
    const interval = setInterval(refresh, 60000);
    void client.read();
    stop = () => {
      clearInterval(interval);
      channel?.close();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", refresh);
      client.invalidate();
    };
  }
  return () => {
    if (--consumers === 0) {
      stop?.();
      stop = undefined;
    }
  };
}
const appSession = (
  s: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"],
): ViewerSession | null => {
  const user = s && projectViewerUser(s.user);
  return s && user
    ? { user, transport: "supabase", expires_at: s.expires_at }
    : null;
};
export const viewerAuth = {
  async getSession() {
    if (!combinedViewer) {
      const r = await supabase.auth.getSession();
      return { data: { session: appSession(r.data.session) }, error: r.error };
    }
    const current = await client.read();
    return {
      data: { session: current.session },
      error:
        current.state === "error"
          ? new Error("Account verification unavailable")
          : null,
    };
  },
  async getUser() {
    if (!combinedViewer) {
      const r = await supabase.auth.getUser();
      return { data: { user: projectViewerUser(r.data.user) }, error: r.error };
    }
    const r = await viewerAuth.getSession();
    return { data: { user: r.data.session?.user ?? null }, error: r.error };
  },
  onAuthStateChange(
    callback: (event: AuthChangeEvent, session: ViewerSession | null) => void,
  ) {
    if (!combinedViewer)
      return supabase.auth.onAuthStateChange((event, session) =>
        callback(event, appSession(session)),
      );
    let active = true;
    const unsubscribe = client.subscribe(() => {
      const s = client.getSnapshot();
      callback(s.state === "ready" ? "SIGNED_IN" : "SIGNED_OUT", s.session);
    });
    const unwatch = watch();
    queueMicrotask(() => {
      if (active) callback("INITIAL_SESSION", client.getSnapshot().session);
    });
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            active = false;
            unsubscribe();
            unwatch();
          },
        },
      },
    };
  },
  async signOut() {
    if (!combinedViewer) return supabase.auth.signOut();
    const result = await client.signOut();
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel("vq-viewer-invalidation");
      channel.postMessage("invalidate");
      channel.close();
    }
    return result;
  },
};
export function useViewerIdentity(): ViewerIdentity {
  const value = useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    () => emptyViewer,
  );
  useEffect(() => (combinedViewer ? watch() : undefined), []);
  return value;
}

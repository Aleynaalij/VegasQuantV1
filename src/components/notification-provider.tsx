"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  notificationText,
  notificationLink,
  type NotificationRow,
  type NotificationPreferences,
} from "@/lib/notifications";
type Counts = { unread: number; unviewed: number; messages: number };
const empty: Counts = { unread: 0, unviewed: 0, messages: 0 };
const Context = createContext({
  uid: null as string | null,
  counts: empty,
  revision: 0,
  connected: false,
  failed: false,
  refresh: () => {},
  preferences: null as NotificationPreferences | null,
});
export const useNotifications = () => useContext(Context);
export function NotificationBell() {
  const { counts, failed } = useNotifications();
  return (
    <Link
      className="update-bell"
      href="/notifications"
      aria-label={
        failed
          ? "Notifications · reconnecting"
          : `Notifications · ${counts.unread} unread`
      }
    >
      <Bell size={21} />
      {counts.unread > 0 && (
        <span className="notification-badge" aria-hidden="true">
          {counts.unread > 99 ? "99+" : counts.unread}
        </span>
      )}
    </Link>
  );
}
export default function NotificationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [uid, setUid] = useState<string | null>(null),
    [counts, setCounts] = useState(empty),
    [revision, setRevision] = useState(0),
    [connected, setConnected] = useState(false),
    [failed, setFailed] = useState(false),
    [preferences, setPreferences] = useState<NotificationPreferences | null>(
      null,
    ),
    [toast, setToast] = useState<NotificationRow | null>(null);
  const countOwner = useRef<string | null>(null);
  const refreshRef = useRef<() => void>(() => {}),
    prefsRef = useRef(preferences),
    lastToast = useRef(0);
  useEffect(() => {
    prefsRef.current = preferences;
  }, [preferences]);
  useEffect(() => {
    let live = true;
    const apply = (id: string | null) => {
      if (live) setUid(id);
    };
    void supabase.auth
      .getSession()
      .then((r) => apply(r.data.session?.user.id || null));
    const auth = supabase.auth.onAuthStateChange((_, s) =>
      apply(s?.user.id || null),
    );
    return () => {
      live = false;
      auth.data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    let live = true,
      timer: ReturnType<typeof setTimeout> | undefined;
    const seen = new Map<string, string>();
    const device = crypto.randomUUID();
    setCounts(empty);
    setToast(null);
    setPreferences(null);
    prefsRef.current = null;
    setConnected(false);
    setFailed(false);
    if (!uid) {
      refreshRef.current = () => {};
      return;
    }
    let countRequest = 0;
    async function refresh() {
      const request = ++countRequest;
      const r = await supabase.rpc("notification_counts");
      if (!live || request !== countRequest) return;
      setFailed(!!r.error);
      if (!r.error) {
        countOwner.current = uid;
        setCounts(r.data || empty);
        setRevision((v) => v + 1);
      }
    }
    async function pulse() {
      if (live)
        await supabase.rpc("notification_pulse", {
          p_device: device,
          p_visible: document.visibilityState === "visible",
        });
    }
    async function prefs() {
      const r = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", uid)
        .maybeSingle();
      if (live && !r.error) setPreferences(r.data);
    }
    const focus = () => {
      if (document.visibilityState === "visible") {
        void refresh();
        void prefs();
        void supabase.rpc("notification_sync_updates").then(() => {
          if (live) void refresh();
        });
      }
      void pulse();
    };
    refreshRef.current = () => void refresh();
    void supabase.rpc("notification_sync_updates").then(() => {
      if (live) {
        void refresh();
        void prefs();
      }
    });
    void pulse();
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const coalescedRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        if (live) void refresh();
      }, 150);
    };
    const channel = supabase
      .channel(`personal-notifications:${uid}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${uid}`,
        },
        (payload) => {
          if (!live) return;
          coalescedRefresh();
          const row = payload.new as NotificationRow;
          if (!row?.id || row.read_at || seen.get(row.id) === row.updated_at)
            return;
          seen.set(row.id, row.updated_at);
          if (seen.size > 200) seen.delete(seen.keys().next().value!);
          if (row.priority === "low") return;
          if (
            document.visibilityState !== "visible" ||
            location.pathname === "/notifications"
          )
            return;
          // Medium-priority bursts update counts immediately but toast at most once per 15 seconds.
          if (
            row.priority === "medium" &&
            Date.now() - lastToast.current < 15000
          )
            return;
          lastToast.current = Date.now();
          setToast(row);
          clearTimeout(timer);
          timer = setTimeout(() => setToast(null), 7000);
          if (
            prefsRef.current?.haptics_enabled &&
            typeof navigator.vibrate === "function"
          )
            navigator.vibrate(20);
          if (prefsRef.current?.sound_enabled) {
            try {
              const audio = new AudioContext();
              if (audio.state !== "running") {
                void audio.close();
                return;
              }
              const tone = audio.createOscillator(),
                gain = audio.createGain();
              gain.gain.value = 0.035;
              tone.frequency.value = 660;
              tone.connect(gain);
              gain.connect(audio.destination);
              tone.start();
              tone.stop(audio.currentTime + 0.1);
              tone.onended = () => void audio.close();
            } catch {
              /* Audio permission may require another user gesture. */
            }
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "app_updates" },
        () => {
          void supabase.rpc("notification_sync_updates").then(() => {
            if (live) void refresh();
          });
        },
      )
      .subscribe((status) => {
        if (live) {
          setConnected(status === "SUBSCRIBED");
          if (status === "SUBSCRIBED") void refresh();
        }
      });
    const polling = setInterval(() => {
        if (document.visibilityState === "visible") void refresh();
      }, 30000),
      heartbeat = setInterval(() => {
        if (document.visibilityState === "visible") void pulse();
      }, 45000);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    window.addEventListener("vq-notification-preferences", prefs);
    return () => {
      live = false;
      clearTimeout(timer);
      clearTimeout(refreshTimer);
      clearInterval(polling);
      clearInterval(heartbeat);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
      window.removeEventListener("vq-notification-preferences", prefs);
      void supabase.removeChannel(channel);
    };
  }, [uid]);
  return (
    <Context.Provider
      value={{
        uid,
        counts: countOwner.current === uid ? counts : empty,
        revision,
        connected,
        failed,
        preferences: preferences?.user_id === uid ? preferences : null,
        refresh: () => refreshRef.current(),
      }}
    >
      {children}
      {toast && toast.recipient_id === uid && (
        <aside className="notification-toast" role="status">
          <Link
            href={notificationLink(toast.deep_link)}
            onClick={() => {
              const opened = toast;
              setToast(null);
              if (uid === opened.recipient_id)
                void supabase
                  .rpc("notification_action", {
                    p_action: "read",
                    p_id: opened.id,
                    p_before: opened.updated_at,
                  })
                  .then(() => refreshRef.current());
            }}
          >
            <strong>
              {toast.priority === "critical"
                ? "Important update"
                : "New activity"}
            </strong>
            <span>{notificationText(toast)}</span>
          </Link>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            ×
          </button>
        </aside>
      )}
    </Context.Provider>
  );
}

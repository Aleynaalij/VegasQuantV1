"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Shell } from "./ui";
import UpdateInbox from "./update-inbox";
import { useNotifications } from "./notification-provider";
import { supabase } from "@/lib/supabase";
import {
  notificationText,
  notificationLink,
  defaultNotificationPreferences,
  type NotificationRow,
  type NotificationPreferences,
} from "@/lib/notifications";
import {
  registerDevice,
  setAlertsWanted,
  supportsPush,
} from "@/lib/push-client";
const types = [
  ["", "All"],
  ["like", "Likes"],
  ["comment", "Comments"],
  ["reply", "Replies"],
  ["mention", "Mentions"],
  ["follow", "Followers"],
  ["share", "Shares"],
  ["comment_reaction", "Comment reactions"],
  ["messages", "Messages"],
  ["system", "Account & updates"],
];
const switches = [
  ["like", "Likes"],
  ["comment", "Comments"],
  ["reply", "Replies"],
  ["mention", "Mentions"],
  ["follow", "Followers"],
  ["share", "Shares"],
  ["comment_reaction", "Comment reactions"],
  ["message", "Direct messages"],
  ["group_message", "Group messages"],
  ["message_request", "Message requests"],
  ["message_reminder", "Message reminders"],
  ["feature", "Feature announcements"],
  ["profile_reminder", "Profile reminders"],
];
export default function NotificationCenter() {
  const { uid, counts, revision, connected, failed, refresh, preferences } =
    useNotifications();
  const [rows, setRows] = useState<NotificationRow[]>([]),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [type, setType] = useState(""),
    [unread, setUnread] = useState(false),
    [loading, setLoading] = useState(false),
    [notice, setNotice] = useState(""),
    [more, setMore] = useState(false),
    [pref, setPref] = useState<NotificationPreferences | null>(null),
    [saving, setSaving] = useState(false),
    [emailReady, setEmailReady] = useState(false),
    [busy, setBusy] = useState(false);
  const [prefNotice, setPrefNotice] = useState("");
  const epoch = useRef(0),
    snapshot = useRef("");
  useEffect(() => {
    const t = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    setPref(preferences || (uid ? defaultNotificationPreferences(uid) : null));
  }, [preferences, uid]);
  useEffect(() => {
    let live = true;
    void fetch("/api/notifications/channels")
      .then((r) => r.json())
      .then((d) => {
        if (live) setEmailReady(d.email === true);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  async function load(append = false) {
    if (!uid) return;
    const generation = ++epoch.current;
    setLoading(true);
    setNotice("");
    const last = append ? rows.at(-1) : null;
    const r = await supabase.rpc("notification_inbox", {
      p_type: type || null,
      p_search: query,
      p_unread: unread,
      p_before: last?.updated_at || null,
      p_id: last?.id || null,
    });
    if (generation !== epoch.current) return;
    setLoading(false);
    if (r.error) {
      setNotice("Notifications could not load. Please retry.");
      return;
    }
    const items = r.data?.items || [];
    snapshot.current = r.data.snapshot_at;
    setRows((current) =>
      append
        ? [...new Map([...current, ...items].map((n) => [n.id, n])).values()]
        : items,
    );
    setMore(items.length === 40);
  }
  useEffect(() => {
    setRows([]);
    void load();
    return () => {
      epoch.current++;
    };
  }, [uid, type, query, unread]);
  useEffect(() => {
    if (uid) void load();
  }, [revision]);
  useEffect(() => {
    if (!uid || !rows.length || !("IntersectionObserver" in window)) return;
    const cutoff = snapshot.current;
    const pending = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting && document.visibilityState === "visible") {
            pending.add(entry.target.getAttribute("data-notification-id")!);
            observer.unobserve(entry.target);
          }
        if (!pending.size || timer) return;
        timer = setTimeout(() => {
          const ids = [...pending].slice(0, 40);
          pending.clear();
          timer = undefined;
          void supabase
            .rpc("notification_view", { p_ids: ids, p_before: cutoff })
            .then((r) => {
              if (r.error)
                setNotice(
                  "Viewed status could not sync. Read status is unchanged.",
                );
            });
        }, 250);
      },
      { threshold: 0.5 },
    );
    rows
      .filter((n) => !n.viewed_at)
      .forEach((n) => {
        const el = document.getElementById(`notification-${n.id}`);
        if (el) observer.observe(el);
      });
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [rows, uid]);
  async function action(kind: string, row?: NotificationRow) {
    if (busy) return;
    if (!row && !snapshot.current) {
      setNotice("Wait for notifications to finish loading.");
      return;
    }
    setBusy(true);
    const r = await supabase.rpc("notification_action", {
      p_action: kind,
      p_id: row?.id || null,
      p_before: row?.updated_at || snapshot.current,
    });
    setBusy(false);
    if (r.error) {
      setNotice("Could not save that change. Please retry.");
      return;
    }
    await load();
    refresh();
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!uid || !pref || saving) return;
    setSaving(true);
    setPrefNotice("");
    try {
      if (pref.push_enabled) {
        if (!supportsPush())
          throw Error(
            "Browser push is not supported here. On iPhone, install Vegas Quant to your Home Screen first.",
          );
        setAlertsWanted(uid, true);
        if ((await Notification.requestPermission()) !== "granted")
          throw Error(
            "Allow notifications in your browser settings before enabling push.",
          );
        if (!(await registerDevice(uid)))
          throw Error("This device could not register for push.");
        const registration = await navigator.serviceWorker.getRegistration();
        const socialCapable = await new Promise<boolean>((resolve) => {
          if (!registration?.active) {
            resolve(false);
            return;
          }
          const channel = new MessageChannel();
          const timer = setTimeout(() => {
            channel.port1.close();
            resolve(false);
          }, 2000);
          channel.port1.onmessage = (event) => {
            clearTimeout(timer);
            channel.port1.close();
            resolve(event.data?.social === true);
          };
          registration.active.postMessage("PUSH_CAPABILITIES", [channel.port2]);
        });
        if (!socialCapable) {
          await registration?.update();
          registration?.waiting?.postMessage("ACTIVATE_UPDATE");
          throw Error(
            "App notifications are updating. Refresh once, then enable push again.",
          );
        }
      }
      const r = await supabase
        .from("notification_preferences")
        .upsert({ ...pref, user_id: uid }, { onConflict: "user_id" });
      if (r.error) throw Error("Preferences could not save.");
      setPrefNotice("Notification preferences saved.");
      window.dispatchEvent(new Event("vq-notification-preferences"));
    } catch (e) {
      setPrefNotice(
        e instanceof Error ? e.message : "Could not save preferences.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <Shell active="account">
      <section className="notification-center">
        <header>
          <span className="eyebrow">YOUR ACTIVITY</span>
          <h1>Notifications</h1>
          <p>
            {counts.unread} unread · {counts.messages} unread message
            notifications
          </p>
          <small>
            {connected
              ? "Live updates connected"
              : failed
                ? "Reconnecting · your notification history is saved"
                : "Live connection pending · refresh fallback enabled"}
          </small>
        </header>
        {!uid ? (
          <p>
            <Link href="/membership">Sign in</Link> to see your notifications.
          </p>
        ) : (
          <>
            <div className="notification-controls">
              <label>
                Search notifications
                <input
                  value={search}
                  maxLength={100}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search people or activity"
                  type="search"
                />
              </label>
              <label>
                Type
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  {types.map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="notification-check">
                <input
                  type="checkbox"
                  checked={unread}
                  onChange={(e) => setUnread(e.target.checked)}
                />
                Unread only
              </label>
              <button
                className="secondary"
                disabled={busy || loading || !counts.unread}
                onClick={() => void action("read_all")}
              >
                Mark all read
              </button>
              <button className="secondary" onClick={() => void load()}>
                Refresh
              </button>
            </div>
            {notice && <p role="status">{notice}</p>}
            {loading && !rows.length && (
              <p role="status">Loading notifications…</p>
            )}
            {!loading && !rows.length && !notice && (
              <p className="notification-empty">
                You’re all caught up. New activity will appear here.
              </p>
            )}
            <div aria-label="Notification history">
              {rows
                .filter((n) => n.recipient_id === uid)
                .map((n) => (
                  <article
                    className={`notification-item ${n.read_at ? "" : "notification-unread"}`}
                    key={n.id}
                    id={`notification-${n.id}`}
                    data-notification-id={n.id}
                  >
                    <Link
                      className="notification-main"
                      href={notificationLink(n.deep_link)}
                      onClick={() => {
                        if (!n.read_at) void action("read", n);
                      }}
                    >
                      {n.actor_avatar ? (
                        <img
                          src={n.actor_avatar}
                          alt=""
                          width={42}
                          height={42}
                        />
                      ) : (
                        <span
                          className="notification-avatar"
                          aria-hidden="true"
                        >
                          {n.actor_id
                            ? n.actor_name.slice(0, 2).toUpperCase()
                            : "VQ"}
                        </span>
                      )}
                      <span>
                        <span className="notification-meta">
                          {n.type.replaceAll("_", " ")} · {n.priority}
                          {!n.read_at ? " · Unread" : ""}
                        </span>
                        <strong>{notificationText(n)}</strong>
                        <time dateTime={n.updated_at}>
                          {new Date(n.updated_at).toLocaleString()}
                        </time>
                      </span>
                    </Link>
                    <div className="notification-actions">
                      <button
                        className="text-link"
                        disabled={busy}
                        onClick={() =>
                          void action(n.read_at ? "unread" : "read", n)
                        }
                      >
                        {n.read_at ? "Mark unread" : "Mark read"}
                      </button>
                      <button
                        className="text-link"
                        disabled={busy}
                        onClick={() => void action("delete", n)}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
            </div>
            {more && (
              <button
                className="secondary"
                disabled={loading}
                onClick={() => void load(true)}
              >
                Load older notifications
              </button>
            )}
            {pref && pref.user_id === uid && (
              <details className="notification-settings">
                <summary>Notification preferences</summary>
                <form onSubmit={save}>
                  <h2>Choose what reaches you</h2>
                  <p>
                    Security and account alerts stay in your inbox. External
                    channels require your permission. Product reminders stay
                    in-app.
                  </p>
                  <div className="notification-switches">
                    {switches.map(([value, label]) => (
                      <label className="notification-check" key={value}>
                        <input
                          type="checkbox"
                          checked={!pref.disabled_types.includes(value)}
                          onChange={(e) =>
                            setPref({
                              ...pref,
                              disabled_types: e.target.checked
                                ? pref.disabled_types.filter((t) => t !== value)
                                : [...pref.disabled_types, value],
                            })
                          }
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <label className="notification-check">
                    <input
                      type="checkbox"
                      checked={pref.push_enabled}
                      onChange={(e) =>
                        setPref({ ...pref, push_enabled: e.target.checked })
                      }
                    />
                    Browser / mobile web push
                  </label>
                  <label className="notification-check">
                    <input
                      type="checkbox"
                      disabled={!emailReady}
                      checked={pref.email_enabled}
                      onChange={(e) =>
                        setPref({ ...pref, email_enabled: e.target.checked })
                      }
                    />
                    Email for critical notifications
                    {emailReady ? "" : " · provider not configured"}
                  </label>
                  <p className="muted">
                    SMS is not enabled. Direct-message alerts will activate when
                    messaging is available.
                  </p>
                  <label className="notification-check">
                    <input
                      type="checkbox"
                      checked={pref.sound_enabled}
                      onChange={(e) =>
                        setPref({ ...pref, sound_enabled: e.target.checked })
                      }
                    />
                    Sound while the app is open (browser permitting)
                  </label>
                  <label className="notification-check">
                    <input
                      type="checkbox"
                      checked={pref.haptics_enabled}
                      onChange={(e) =>
                        setPref({ ...pref, haptics_enabled: e.target.checked })
                      }
                    />
                    Haptic feedback (supported devices)
                  </label>
                  <label>
                    Group likes and followers for
                    <select
                      value={pref.batch_minutes}
                      onChange={(e) =>
                        setPref({ ...pref, batch_minutes: +e.target.value })
                      }
                    >
                      {[1, 5, 10, 15, 30].map((v) => (
                        <option key={v} value={v}>
                          {v} minutes
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="notification-check">
                    <input
                      type="checkbox"
                      checked={pref.quiet_enabled}
                      onChange={(e) =>
                        setPref({ ...pref, quiet_enabled: e.target.checked })
                      }
                    />
                    Quiet hours for social pushes
                  </label>
                  <label>
                    Timezone
                    <input
                      maxLength={80}
                      value={pref.timezone}
                      onChange={(e) =>
                        setPref({ ...pref, timezone: e.target.value })
                      }
                    />
                  </label>
                  <div className="notification-hours">
                    <label>
                      From
                      <select
                        value={pref.quiet_start}
                        onChange={(e) =>
                          setPref({ ...pref, quiet_start: +e.target.value })
                        }
                      >
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={i}>
                            {String(i).padStart(2, "0")}:00
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Until
                      <select
                        value={pref.quiet_end}
                        onChange={(e) =>
                          setPref({ ...pref, quiet_end: +e.target.value })
                        }
                      >
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={i}>
                            {String(i).padStart(2, "0")}:00
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {prefNotice && <p role="status">{prefNotice}</p>}
                  <button className="primary" disabled={saving}>
                    {saving ? "Saving…" : "Save preferences"}
                  </button>
                </form>
              </details>
            )}
            <details className="notification-settings">
              <summary>Older platform announcements</summary>
              <UpdateInbox />
            </details>
          </>
        )}
      </section>
    </Shell>
  );
}

"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { UpdateReadState } from "@/lib/update-read-state";
import { time } from "@/lib/domain";

type Update = { id: string; title: string; body: string; created_at: string };

export default function UpdateInbox() {
  const [rows, setRows] = useState<Update[]>([]);
  const [read, setRead] = useState<string[]>([]);
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [open, setOpen] = useState(false);
  const [retry, setRetry] = useState(0);
  const receipts = useRef(new UpdateReadState());
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();

  const markVisibleRead = useCallback(async (updates: Update[]) => {
    const batch = receipts.current.begin(updates.map((row) => row.id));
    if (!batch) return;
    setRead(receipts.current.ids());
    setSaveError(false);
    let success = false;
    try {
      const result = await supabase.from("app_update_reads").upsert(
        batch.ids.map((update_id) => ({ user_id: batch.account, update_id })),
        { onConflict: "user_id,update_id", ignoreDuplicates: true },
      );
      success = !result.error;
    } catch {
      success = false;
    } finally {
      if (receipts.current.finish(batch, success)) {
        setRead(receipts.current.ids());
        setSaveError(!success);
      }
    }
  }, []);

  useEffect(() => {
    let live = true;
    let epoch = 0;
    function account(id: string | null) {
      if (receipts.current.account !== id) {
        receipts.current.reset(id);
        setRows([]);
        setRead([]);
        setSaveError(false);
      }
      setUid(id);
    }
    async function load() {
      const request = ++epoch;
      try {
        const session = await supabase.auth.getSession();
        if (!live || request !== epoch) return;
        if (session.error) throw session.error;
        const id = session.data.session?.user.id || null;
        account(id);
        if (!id) {
          setLoading(false);
          setLoadError(false);
          return;
        }
        const [updates, reads] = await Promise.all([
          supabase
            .from("app_updates")
            .select("id,title,body,created_at")
            .order("created_at", { ascending: false })
            .limit(50),
          supabase
            .from("app_update_reads")
            .select("update_id")
            .eq("user_id", id),
        ]);
        if (!live || request !== epoch) return;
        if (updates.error || reads.error) throw updates.error || reads.error;
        setRows(updates.data || []);
        setRead(
          receipts.current.merge(
            (reads.data || []).map((row) => row.update_id),
          ),
        );
        setLoadError(false);
      } catch {
        if (live && request === epoch) setLoadError(true);
      } finally {
        if (live && request === epoch) setLoading(false);
      }
    }
    void load();
    const focus = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = setInterval(focus, 60000);
    const auth = supabase.auth.onAuthStateChange((_event, session) => {
      ++epoch;
      account(session?.user.id || null);
      setTimeout(() => {
        if (live) void load();
      }, 0);
    });
    window.addEventListener("focus", focus);
    return () => {
      live = false;
      ++epoch;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      auth.data.subscription.unsubscribe();
    };
  }, [retry]);

  useEffect(() => {
    if (open) void markVisibleRead(rows);
  }, [open, rows, markVisibleRead]);

  const unread = rows.filter((row) => !read.includes(row.id)).length;
  return (
    <>
      <button
        type="button"
        className="update-bell"
        aria-haspopup="dialog"
        aria-label={`App updates${unread ? `, ${unread} unread` : ""}`}
        onClick={() => {
          dialog.current?.showModal();
          setOpen(true);
        }}
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="unread-dot" aria-hidden="true">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      <dialog
        className="phone-contact-dialog update-inbox"
        ref={dialog}
        aria-labelledby={title}
        onClose={() => setOpen(false)}
      >
        <h2 id={title}>What’s new in Vegas Quant</h2>
        <p>App improvements and new features, all in one place.</p>
        {loading ? (
          <p role="status">Loading updates…</p>
        ) : !uid ? (
          <p>
            <Link href="/membership">Sign in</Link> to see app updates.
          </p>
        ) : !rows.length && !loadError ? (
          <p>You’re up to date. No app updates posted yet.</p>
        ) : null}
        {loadError && (
          <p role="alert">
            App updates could not refresh.{" "}
            <button
              type="button"
              className="text-link"
              onClick={() => setRetry((value) => value + 1)}
            >
              Retry loading
            </button>
          </p>
        )}
        {saveError && (
          <p role="alert">
            Your read status couldn’t be saved.{" "}
            <button
              type="button"
              className="text-link"
              onClick={() => void markVisibleRead(rows)}
            >
              Retry saving
            </button>
          </p>
        )}
        {rows.map((row) => (
          <article key={row.id} className="app-update">
            <h3>{row.title}</h3>
            <p>{row.body}</p>
            <time dateTime={row.created_at}>{time(row.created_at)}</time>
          </article>
        ))}
        <button
          type="button"
          className="primary"
          onClick={() => dialog.current?.close()}
        >
          Done
        </button>
      </dialog>
    </>
  );
}

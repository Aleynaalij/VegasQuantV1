"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bookmark, Flame } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function LegActions({
  legKey,
  expired = false,
}: {
  legKey: string;
  expired?: boolean;
}) {
  const [uid, setUid] = useState<string | null>(null);
  const [saved, setSaved] = useState(false),
    [tail, setTail] = useState(false);
  const [count, setCount] = useState(0),
    [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false),
    [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const current = useRef({
    uid: null as string | null,
    version: 0,
    busy: false,
  });
  useEffect(() => {
    let live = true;
    let epoch = 0;
    async function load() {
      const request = ++epoch;
      try {
        const session = await supabase.auth.getSession();
        if (!live || request !== epoch) return;
        if (session.error) throw session.error;
        const id = session.data.session?.user.id || null;
        if (id !== current.current.uid) {
          current.current = {
            uid: id,
            version: current.current.version + 1,
            busy: false,
          };
          setSaved(false);
          setTail(false);
          setCount(0);
          setBusy(false);
        }
        setUid(id);
        if (!id) {
          setReady(true);
          setNotice("");
          return;
        }
        const stateVersion = current.current.version;
        const [a, b, c] = await Promise.all([
          supabase
            .from("saved_legs")
            .select("leg_key")
            .eq("user_id", id)
            .eq("leg_key", legKey)
            .maybeSingle(),
          supabase
            .from("leg_tails")
            .select("leg_key")
            .eq("user_id", id)
            .eq("leg_key", legKey)
            .maybeSingle(),
          supabase.rpc("leg_tail_count", { p_leg: legKey }),
        ]);
        if (
          !live ||
          request !== epoch ||
          stateVersion !== current.current.version ||
          current.current.busy
        )
          return;
        if (a.error || b.error || c.error) throw a.error || b.error || c.error;
        setSaved(!!a.data);
        setTail(!!b.data);
        setCount(Number(c.data || 0));
        setReady(true);
        setNotice("");
      } catch {
        if (live && request === epoch) {
          setReady(false);
          setNotice("Your saved and tailed status could not load.");
        }
      }
    }
    void load();
    const auth = supabase.auth.onAuthStateChange((_event, session) => {
      if ((session?.user.id || null) !== current.current.uid) {
        current.current = {
          uid: session?.user.id || null,
          version: current.current.version + 1,
          busy: false,
        };
        setUid(current.current.uid);
        setSaved(false);
        setTail(false);
        setCount(0);
        setBusy(false);
        setReady(false);
      }
      setTimeout(() => {
        if (live) void load();
      }, 0);
    });
    return () => {
      live = false;
      ++epoch;
      current.current.version++;
      auth.data.subscription.unsubscribe();
    };
  }, [legKey, retry]);

  async function toggle(kind: "saved_legs" | "leg_tails") {
    if (!uid) {
      setNotice("Sign in to save or tail a leg.");
      return;
    }
    if (!ready || current.current.busy) return;
    const version = ++current.current.version;
    const on = kind === "saved_legs" ? saved : tail;
    current.current.busy = true;
    setBusy(true);
    setNotice("");
    try {
      const result = on
        ? await supabase
            .from(kind)
            .delete()
            .eq("user_id", uid)
            .eq("leg_key", legKey)
            .select("leg_key")
        : await supabase
            .from(kind)
            .upsert(
              { user_id: uid, leg_key: legKey },
              { onConflict: "user_id,leg_key", ignoreDuplicates: true },
            );
      if (version !== current.current.version) return;
      if (result.error) throw result.error;
      if (on && !result.data?.length)
        throw new Error("Tail is retained after kickoff");
      if (kind === "saved_legs") setSaved(!on);
      else {
        setTail(!on);
        const total = await supabase.rpc("leg_tail_count", { p_leg: legKey });
        if (version !== current.current.version) return;
        if (!total.error) setCount(Number(total.data || 0));
      }
      setNotice(
        kind === "saved_legs"
          ? on
            ? "Removed from saved legs."
            : "Leg saved."
          : on
            ? "No longer tailing."
            : "Added to your personal Records.",
      );
      window.dispatchEvent(new Event("vq-saved-changed"));
    } catch {
      if (version === current.current.version)
        setNotice("Could not update this leg. Please retry.");
    } finally {
      if (version === current.current.version) {
        current.current.busy = false;
        setBusy(false);
      }
    }
  }
  return (
    <div className="leg-actions" aria-busy={busy}>
      <button
        aria-pressed={saved}
        disabled={busy || !ready}
        onClick={() => void toggle("saved_legs")}
      >
        <Bookmark size={16} />
        {saved ? "Saved" : "Save leg"}
      </button>
      <button
        aria-pressed={tail}
        disabled={busy || !ready || expired}
        onClick={() => void toggle("leg_tails")}
      >
        <Flame size={16} />
        {tail ? (expired ? "In your Records" : "Tailing") : "I’m tailing"}
        {count > 0 ? ` · ${count}` : ""}
      </button>
      <small>
        Tailing adds this pick to <Link href="/history">your Records</Link>. It
        does not place or record a wager.
      </small>
      {notice && (
        <p role="status">
          {notice} {!uid && <Link href="/membership">Sign in →</Link>}
          {!ready && (
            <button
              className="text-link"
              onClick={() => setRetry((n) => n + 1)}
            >
              Retry
            </button>
          )}
        </p>
      )}
    </div>
  );
}

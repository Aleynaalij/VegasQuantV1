"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bookmark, Flame } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { savedLegs, tailCounts, tailedLegs } from "@/lib/leg-data";
import { useIsAdmin } from "@/lib/use-admin";

export default function LegActions({
  legKey,
  expired = false,
  parlay = false,
}: {
  legKey: string;
  expired?: boolean;
  parlay?: boolean;
}) {
  const admin = useIsAdmin();
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
        // Batched with every other leg card on screen and cached (lib/leg-data).
        const [a, b] = await Promise.all([
          savedLegs.load(`${id}|${legKey}`),
          tailedLegs.load(`${id}|${legKey}`),
        ]);
        if (
          !live ||
          request !== epoch ||
          stateVersion !== current.current.version ||
          current.current.busy
        )
          return;
        setSaved(!!a);
        setTail(!!b);
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

  // The tail count is one call per leg, so it loads only once the card is near the screen.
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el || visible) return;
    if (typeof IntersectionObserver === "undefined") return setVisible(true);
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisible(true);
        io.disconnect();
      }
    }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);
  useEffect(() => {
    if (!visible || !uid) return;
    let live = true;
    const cached = tailCounts.peek(legKey);
    if (cached !== undefined) setCount(cached);
    tailCounts
      .load(legKey)
      .then((n) => {
        if (live && n !== undefined) setCount(n);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [visible, uid, legKey, retry]);

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
      if (kind === "saved_legs") {
        savedLegs.invalidate([`${uid}|${legKey}`]);
        setSaved(!on);
      } else {
        tailedLegs.invalidate([`${uid}|${legKey}`]);
        tailCounts.invalidate([legKey]);
        setTail(!on);
        const total = await tailCounts.load(legKey);
        if (version !== current.current.version) return;
        if (total !== undefined) setCount(total);
      }
      setNotice(
        kind === "saved_legs"
          ? on
            ? "Removed from saved legs."
            : "Leg saved."
          : on
            ? "No longer tailing."
            : parlay
              ? "Parlay added to Home and your personal Records."
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
    <div className="leg-actions" aria-busy={busy} ref={box}>
      <button
        aria-pressed={saved}
        disabled={busy || !ready}
        onClick={() => void toggle("saved_legs")}
      >
        <Bookmark size={16} />
        {saved ? "Saved" : parlay ? "Save parlay" : "Save leg"}
      </button>
      <button
        aria-pressed={tail}
        disabled={busy || !ready || expired}
        onClick={() => void toggle("leg_tails")}
      >
        <Flame size={16} />
        {tail
          ? expired && admin
            ? "In your Records"
            : "Tailing"
          : "I’m tailing"}
        {count > 0 ? ` · ${count}` : ""}
      </button>
      <small>
        {parlay ? (
          <>
            Tailing adds this parlay to <Link href="/">Home</Link>
            {admin && (
              <>
                {" "}
                and <Link href="/history">your Records</Link>
              </>
            )}
            .
          </>
        ) : admin ? (
          <>
            Tailing adds this pick to <Link href="/history">your Records</Link>.
          </>
        ) : (
          <>Tailing marks this pick as one you’re following.</>
        )}{" "}
        It does not place or record a wager.
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

"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { setFollow } from "@/lib/follows-client";

// One-tap follow toggle for a team or player. Signed-out visitors get a sign-in link instead.
export default function FollowButton({
  kind = "team",
  topic,
  label = topic,
  compact = false,
  following,
}: {
  kind?: "team" | "player";
  topic: string;
  label?: string;
  /** Chip style: "+ Seahawks" instead of "+ Follow Seahawks". */
  compact?: boolean;
  /** Known follow state; skips the lookup when the caller already loaded follows. */
  following?: boolean;
}) {
  const [uid, setUid] = useState<string | null | undefined>(undefined),
    [on, setOn] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true,
      epoch = 0;
    async function load() {
      const n = ++epoch;
      const s = await supabase.auth.getSession();
      const id = s.data.session?.user.id || null;
      if (!live || n !== epoch) return;
      setUid(id);
      if (!id) return setOn(false);
      if (following !== undefined) return setOn(following);
      const r = await supabase
        .from("topic_follows")
        .select("topic")
        .eq("user_id", id)
        .eq("kind", kind)
        .eq("topic", topic)
        .maybeSingle();
      if (live && n === epoch) setOn(!r.error && !!r.data);
    }
    void load();
    const refresh = () => void load();
    window.addEventListener("vq-follows-changed", refresh);
    const auth = supabase.auth.onAuthStateChange(() => setTimeout(refresh, 0));
    return () => {
      live = false;
      window.removeEventListener("vq-follows-changed", refresh);
      auth.data.subscription.unsubscribe();
    };
  }, [kind, topic, following]);
  if (uid === undefined) return null;
  if (!uid)
    return (
      <Link className="follow-button" href="/membership#follow">
        {compact ? `+ ${label}` : `+ Follow ${label}`}
      </Link>
    );
  async function toggle() {
    setBusy(true);
    setError("");
    try {
      await setFollow(uid!, kind, topic, !on);
      setOn(!on);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update follow.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="follow-button"
        aria-pressed={on}
        aria-label={`${on ? "Unfollow" : "Follow"} ${topic}`}
        disabled={busy}
        onClick={toggle}
      >
        {compact
          ? `${on ? "✓" : "+"} ${label}`
          : on
            ? `✓ Following ${label}`
            : `+ Follow ${label}`}
      </button>
      {error && <small role="alert">{error}</small>}
    </>
  );
}

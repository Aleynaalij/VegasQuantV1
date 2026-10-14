"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Panel } from "./ui";
import { time } from "@/lib/domain";
import { supabase } from "@/lib/supabase";
type Ticket = {
  leg_key: string;
  name: string;
  market: string;
  matchup: string;
  release_id: string;
  result: string | null;
  expires_at: string;
};
export default function TailedParlays() {
  const [rows, setRows] = useState<Ticket[]>([]),
    [signedIn, setSignedIn] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let live = true,
      epoch = 0;
    async function load() {
      const n = ++epoch;
      try {
        const s = await supabase.auth.getSession();
        if (!live || n !== epoch) return;
        const uid = s.data.session?.user.id;
        setSignedIn(!!uid);
        if (!uid) {
          setRows([]);
          return;
        }
        const keys: string[] = [];
        for (let offset = 0; ; offset += 500) {
          const t = await supabase
            .from("leg_tails")
            .select("leg_key")
            .eq("user_id", uid)
            .order("leg_key")
            .range(offset, offset + 499);
          if (!live || n !== epoch) return;
          if (t.error) throw t.error;
          keys.push(...(t.data || []).map((t) => t.leg_key));
          if ((t.data?.length || 0) < 500) break;
        }
        const tickets: Ticket[] = [];
        for (let i = 0; i < keys.length; i += 50) {
          const r = await supabase
            .from("published_legs")
            .select("leg_key,name,market,matchup,release_id,result,expires_at")
            .in("leg_key", keys.slice(i, i + 50))
            .in("kind", ["PARLAY", "HAIL_MARY"])
            .gte("expires_at", new Date(Date.now() - 86400000).toISOString());
          if (!live || n !== epoch) return;
          if (r.error) throw r.error;
          tickets.push(
            ...(r.data || []).filter(
              (p) => !["WIN", "LOSS", "PUSH", "VOID"].includes(p.result || ""),
            ),
          );
        }
        setRows(tickets);
        setNotice("");
      } catch {
        if (live && n === epoch) {
          setRows([]);
          setNotice("Your tailed parlays could not load. Refresh to retry.");
        }
      }
    }
    void load();
    const timer = setInterval(load, 30000);
    const refresh = () => void load();
    window.addEventListener("vq-saved-changed", refresh);
    window.addEventListener("focus", refresh);
    const auth = supabase.auth.onAuthStateChange(() => {
      ++epoch;
      setRows([]);
      setSignedIn(false);
      setTimeout(() => {
        if (live) void load();
      }, 0);
    });
    return () => {
      live = false;
      ++epoch;
      clearInterval(timer);
      auth.data.subscription.unsubscribe();
      window.removeEventListener("vq-saved-changed", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  if (!signedIn) return null;
  return (
    <Panel
      title={
        notice
          ? "Your tailed parlays"
          : `Tailing ${rows.length} ${rows.length === 1 ? "parlay" : "parlays"}`
      }
    >
      <p>
        Upcoming and recent unresolved tickets you’re following. A tail records
        interest, not a placed wager.
      </p>
      {notice ? (
        <p role="status">{notice}</p>
      ) : rows.length ? (
        rows.map((r) => (
          <article className="ledger-card" key={r.leg_key}>
            <h3>{r.name}</h3>
            <p>{r.matchup}</p>
            <p>
              {r.market} ·{" "}
              {Date.parse(r.expires_at) > Date.now()
                ? `Starts ${time(r.expires_at)}`
                : "In play / awaiting final results"}
            </p>
            <Link href={`/feed#release-${r.release_id}`}>
              Open original parlay →
            </Link>
          </article>
        ))
      ) : (
        <p>Tap I’m tailing on a parlay in The Zone to add it here.</p>
      )}
      <Link href="/history">Your complete tail record →</Link>
    </Panel>
  );
}

"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Panel } from "./ui";
import { summarizeTails } from "@/lib/tail-record";
type Tail = { leg_key: string; created_at: string };
type Publication = {
  leg_key: string;
  name: string;
  market: string;
  matchup: string;
  result: string | null;
  result_source: string | null;
};
type Row = Tail & { publication?: Publication };
type OldEntry = {
  id: string;
  pick_id: string;
  book: string;
  stake_cents: number;
  payout_cents: number;
  profit_cents: number | null;
  result: string | null;
  created_at: string;
};
export default function MyTailRecord() {
  const [rows, setRows] = useState<Row[]>([]);
  const [entries, setEntries] = useState<OldEntry[]>([]);
  const [archiveError, setArchiveError] = useState(false);
  const [notice, setNotice] = useState("Loading your tailed picks…");
  const [signedIn, setSignedIn] = useState(false);
  const [limit, setLimit] = useState(20);
  useEffect(() => {
    let live = true,
      epoch = 0;
    async function load() {
      const request = ++epoch;
      try {
        const session = await supabase.auth.getSession();
        if (!live || request !== epoch) return;
        if (session.error) throw session.error;
        const uid = session.data.session?.user.id;
        setSignedIn(!!uid);
        if (!uid) {
          setRows([]);
          setEntries([]);
          setNotice("Sign in to see your personal record.");
          return;
        }
        const tails: Tail[] = [];
        for (let offset = 0; ; offset += 500) {
          const result = await supabase
            .from("leg_tails")
            .select("leg_key,created_at")
            .eq("user_id", uid)
            .order("created_at", { ascending: false })
            .order("leg_key")
            .range(offset, offset + 499);
          if (!live || request !== epoch) return;
          if (result.error) throw result.error;
          tails.push(...(result.data || []));
          if ((result.data?.length || 0) < 500) break;
        }
        const publications = new Map<string, Publication>();
        for (let offset = 0; offset < tails.length; offset += 50) {
          const result = await supabase
            .from("published_legs")
            .select("leg_key,name,market,matchup,result,result_source")
            .in(
              "leg_key",
              tails.slice(offset, offset + 50).map((t) => t.leg_key),
            );
          if (!live || request !== epoch) return;
          if (result.error) throw result.error;
          for (const p of result.data || []) publications.set(p.leg_key, p);
        }
        const archived = await supabase
          .from("personal_entry_state")
          .select(
            "id,pick_id,book,stake_cents,payout_cents,profit_cents,result,created_at",
          )
          .eq("user_id", uid)
          .order("created_at", { ascending: false });
        if (!live || request !== epoch) return;
        setArchiveError(!!archived.error);
        setEntries(archived.error ? [] : archived.data || []);
        setRows(
          tails.map((t) => ({
            ...t,
            publication: publications.get(t.leg_key),
          })),
        );
        setNotice(
          tails.length
            ? ""
            : "No tailed picks yet. Tap I’m tailing on a pick in The Zone to start your record.",
        );
      } catch {
        if (live && request === epoch) {
          setRows([]);
          setEntries([]);
          setNotice("Your record could not load. Refresh to retry.");
        }
      }
    }
    void load();
    const auth = supabase.auth.onAuthStateChange(() => {
      ++epoch;
      setRows([]);
      setEntries([]);
      setNotice("Loading your tailed picks…");
      setTimeout(() => {
        if (live) void load();
      }, 0);
    });
    const refresh = () => void load();
    window.addEventListener("vq-saved-changed", refresh);
    window.addEventListener("focus", refresh);
    const timer = setInterval(refresh, 30000);
    return () => {
      live = false;
      ++epoch;
      auth.data.subscription.unsubscribe();
      clearInterval(timer);
      window.removeEventListener("vq-saved-changed", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const summary = summarizeTails(rows);
  return (
    <Panel title="My tailed picks">
      <p>
        Your record follows the picks you tail, using their verified published
        outcomes. No assumed stakes, profit or wagers. Unverified results stay
        pending.
      </p>
      {signedIn && (
        <div className="filter-bar" aria-label="Personal tail summary">
          <strong>{summary.wins} wins</strong>
          <strong>{summary.losses} losses</strong>
          <span>{summary.pending} pending / unavailable</span>
          <span>
            {summary.pushes} pushes · {summary.voids} voids
          </span>
        </div>
      )}
      {notice && (
        <p role="status">
          {notice}{" "}
          <Link href={signedIn ? "/feed" : "/membership"}>
            {signedIn ? "Open The Zone →" : "Sign in →"}
          </Link>
        </p>
      )}
      {rows.slice(0, limit).map((row) => (
        <article className="ledger-card" key={row.leg_key}>
          <h3>{row.publication?.name || "Publication unavailable"}</h3>
          <p>
            {row.publication?.market} {row.publication?.matchup}
          </p>
          <strong>{row.publication?.result || "PENDING"}</strong>
          <p>Tailed {new Date(row.created_at).toLocaleString()}</p>
          {row.publication?.result_source?.startsWith("https://") && (
            <a
              href={row.publication.result_source}
              target="_blank"
              rel="noopener noreferrer"
            >
              Verified result source ↗
            </a>
          )}
        </article>
      ))}
      {rows.length > limit && (
        <button className="secondary" onClick={() => setLimit((n) => n + 20)}>
          Show more tailed picks
        </button>
      )}
      {signedIn && (
        <details className="admin-section">
          <summary>Previous recorded wager history ↓</summary>
          {archiveError ? (
            <p>Previous wager history could not load. Refresh to retry.</p>
          ) : !entries.length ? (
            <p>No previous recorded wagers.</p>
          ) : (
            entries.map((e) => (
              <article className="ledger-card" key={e.id}>
                <Link href={`/sweat/${e.pick_id}`}>
                  Original published pick →
                </Link>
                <p>
                  {e.book} · {e.result || "PENDING"} · Recorded{" "}
                  {new Date(e.created_at).toLocaleString()}
                </p>
                <p>
                  Stake ${(e.stake_cents / 100).toFixed(2)} · Potential payout $
                  {(e.payout_cents / 100).toFixed(2)} · Net{" "}
                  {e.profit_cents == null
                    ? "unconfirmed"
                    : `$${(e.profit_cents / 100).toFixed(2)}`}
                </p>
              </article>
            ))
          )}
        </details>
      )}
    </Panel>
  );
}

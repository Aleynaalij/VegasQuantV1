"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { onUserChange } from "@/lib/auth-user";
import { time } from "@/lib/domain";

/** A published pick or parlay the member tailed (their own leg_tails row + its publication). */
type Tailed = {
  leg_key: string;
  kind: string;
  name: string;
  market: string;
  matchup: string;
  release_id: string;
  result: string | null;
  expires_at: string;
};
type State =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "error" }
  // Tails exist but none of their publications are readable with the current access.
  | { kind: "no-access"; tails: number }
  | { kind: "ready"; rows: Tailed[] };

const PARLAY = new Set(["PARLAY", "HAIL_MARY"]);
const FINAL: Record<string, string> = { WIN: "Won", LOSS: "Lost", PUSH: "Push", VOID: "Void" };
const status = (r: Tailed, now: number) =>
  r.result && FINAL[r.result]
    ? FINAL[r.result]
    : Date.parse(r.expires_at) > now
      ? `Open · locks ${time(r.expires_at)}`
      : "Awaiting the verified result";
const href = (r: Tailed) =>
  `/feed?view=${PARLAY.has(r.kind) ? "parlays" : "legs"}&release=${encodeURIComponent(r.release_id)}#release-${encodeURIComponent(r.release_id)}`;

/**
 * Your lays → Tailed: the published parlays and picks this member tailed, kept separate from lays
 * they build and save. Reads only the member's own tails (RLS: own rows) and publications their
 * access already allows; nothing here grants access, places a wager or assumes a stake.
 */
export default function TailedLays() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const epoch = useRef(0);
  const load = useCallback(async () => {
    const n = ++epoch.current;
    setState({ kind: "loading" });
    try {
      const s = await supabase.auth.getSession();
      if (n !== epoch.current) return;
      const uid = s.data.session?.user.id;
      if (!uid) return setState({ kind: "signed-out" });
      const keys: string[] = [];
      for (let offset = 0; ; offset += 500) {
        const t = await supabase.from("leg_tails").select("leg_key").eq("user_id", uid).order("leg_key").range(offset, offset + 499);
        if (n !== epoch.current) return;
        if (t.error) throw t.error;
        keys.push(...(t.data || []).map((x) => x.leg_key as string));
        if ((t.data?.length || 0) < 500) break;
      }
      if (!keys.length) return setState({ kind: "ready", rows: [] });
      const rows: Tailed[] = [];
      for (let i = 0; i < keys.length; i += 50) {
        const r = await supabase
          .from("published_legs")
          .select("leg_key,kind,name,market,matchup,release_id,result,expires_at")
          .in("leg_key", keys.slice(i, i + 50));
        if (n !== epoch.current) return;
        if (r.error) throw r.error;
        rows.push(...((r.data || []) as Tailed[]));
      }
      if (!rows.length) return setState({ kind: "no-access", tails: keys.length });
      rows.sort((a, b) => Date.parse(b.expires_at) - Date.parse(a.expires_at) || a.leg_key.localeCompare(b.leg_key));
      setState({ kind: "ready", rows });
    } catch {
      if (n === epoch.current) setState({ kind: "error" });
    }
  }, []);
  useEffect(() => {
    void load();
    // A different account never sees this one's tails: clear first, then reload for the new one.
    const stop = onUserChange(() => void load());
    const refresh = () => void load();
    window.addEventListener("vq-saved-changed", refresh);
    return () => {
      epoch.current++;
      stop();
      window.removeEventListener("vq-saved-changed", refresh);
    };
  }, [load]);

  const now = Date.now();
  return (
    <section className="vq-tailed" aria-labelledby="vq-tailed-title">
      <header className="vq-tailed-head">
        <h1 id="vq-tailed-title">Your lays</h1>
        <nav className="vq-tailed-tabs" aria-label="Your lays">
          <Link href="/parlays">My lays</Link>
          <Link href="/parlays/tailed" aria-current="page">
            Tailed
          </Link>
        </nav>
        <p>
          Published picks and parlays you tailed, with their verified results. Separate from the lays you
          build and save. Tailing follows a pick; it never places a wager.
        </p>
      </header>
      {state.kind === "loading" ? (
        <p role="status">Loading your tailed picks…</p>
      ) : state.kind === "signed-out" ? (
        <div className="vq-tailed-empty">
          <p>Sign in to see the picks and parlays you tailed.</p>
          <Link className="vq-btn" href="/membership">
            Sign in
          </Link>
        </div>
      ) : state.kind === "error" ? (
        <div className="vq-tailed-empty" role="alert">
          <p>Your tailed picks couldn’t load. Nothing on your account changed.</p>
          <button type="button" className="secondary" onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : state.kind === "no-access" ? (
        <div className="vq-tailed-empty">
          <p>
            You tailed {state.tails === 1 ? "1 pick" : `${state.tails} picks`}, but their details need active
            research access. Your tails are kept.
          </p>
          <Link className="vq-btn" href="/membership">
            See access options
          </Link>
        </div>
      ) : !state.rows.length ? (
        <div className="vq-tailed-empty">
          <p>You haven’t tailed anything yet. Tap “I’m tailing” on a published pick or parlay before kickoff.</p>
          <Link className="vq-btn" href="/feed?view=latest">
            Open published research
          </Link>
        </div>
      ) : (
        <>
          <TailedGroup title="Parlays" rows={state.rows.filter((r) => PARLAY.has(r.kind))} now={now} />
          <TailedGroup title="Picks" rows={state.rows.filter((r) => !PARLAY.has(r.kind))} now={now} />
        </>
      )}
    </section>
  );
}

function TailedGroup({ title, rows, now }: { title: string; rows: Tailed[]; now: number }) {
  if (!rows.length) return null;
  return (
    <section className="vq-tailed-group" aria-label={`Tailed ${title.toLowerCase()}`}>
      <h2>
        {title} <small>{rows.length}</small>
      </h2>
      <ul>
        {rows.map((r) => (
          <li key={r.leg_key}>
            <Link href={href(r)} className="vq-tailed-item">
              <b>{r.name}</b>
              <small>
                {r.matchup} · {r.market}
              </small>
              <span className={`vq-tailed-status ${r.result ? `is-${r.result.toLowerCase()}` : ""}`}>{status(r, now)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

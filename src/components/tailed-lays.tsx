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
  // Tails exist but none of their publications can be read right now. The reason isn't knowable
  // from here (access ended, or a publication was withdrawn), so it is not asserted.
  | { kind: "unavailable"; tails: number }
  // `missing`: tails whose publication details couldn't be read (shown as a count, never dropped).
  | { kind: "ready"; rows: Tailed[]; missing: number };

/** Every read is bounded: a hung request becomes a recoverable error, never an endless Loading. */
const READ_MS = 10_000;
function bounded<T>(p: PromiseLike<T>): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), READ_MS)),
  ]);
}

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
      const s = await bounded(supabase.auth.getSession());
      if (n !== epoch.current) return;
      // A failed session lookup is an error to retry, not "signed out".
      if (s.error) throw s.error;
      const uid = s.data.session?.user.id;
      if (!uid) return setState({ kind: "signed-out" });
      const keys: string[] = [];
      for (let offset = 0; ; offset += 500) {
        const t = await bounded(supabase.from("leg_tails").select("leg_key").eq("user_id", uid).order("leg_key").range(offset, offset + 499));
        if (n !== epoch.current) return;
        if (t.error) throw t.error;
        keys.push(...(t.data || []).map((x) => x.leg_key as string));
        if ((t.data?.length || 0) < 500) break;
      }
      if (!keys.length) return setState({ kind: "ready", rows: [], missing: 0 });
      const rows: Tailed[] = [];
      for (let i = 0; i < keys.length; i += 50) {
        const r = await bounded(
          supabase
            .from("published_legs")
            .select("leg_key,kind,name,market,matchup,release_id,result,expires_at")
            .in("leg_key", keys.slice(i, i + 50)),
        );
        if (n !== epoch.current) return;
        if (r.error) throw r.error;
        rows.push(...((r.data || []) as Tailed[]));
      }
      if (!rows.length) return setState({ kind: "unavailable", tails: keys.length });
      rows.sort((a, b) => Date.parse(b.expires_at) - Date.parse(a.expires_at) || a.leg_key.localeCompare(b.leg_key));
      const found = new Set(rows.map((r) => r.leg_key));
      setState({ kind: "ready", rows, missing: keys.filter((k) => !found.has(k)).length });
    } catch {
      if (n === epoch.current) setState({ kind: "error" });
    }
  }, []);
  useEffect(() => {
    void load();
    // A different account never sees this one's tails: clear first, then reload for the new one.
    const stop = onUserChange(() => void load());
    const refresh = () => void load();
    // Back on the page: re-read, so results that settled meanwhile appear.
    const visible = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("vq-saved-changed", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      epoch.current++;
      stop();
      window.removeEventListener("vq-saved-changed", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [load]);

  // An open pick stops being "Open" at its lock time even if the page sits open: re-render at the
  // next lock. It then reads "Awaiting the verified result"; a result is never inferred, only read.
  const [tick, setTick] = useState(0);
  const rows = state.kind === "ready" ? state.rows : null;
  useEffect(() => {
    if (!rows) return;
    const now = Date.now();
    const next = rows.map((r) => Date.parse(r.expires_at)).filter((t) => t > now).sort((a, b) => a - b)[0];
    if (next === undefined) return;
    const t = setTimeout(() => setTick((n) => n + 1), Math.min(next - now + 50, 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [rows, tick]);

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
      ) : state.kind === "unavailable" ? (
        <div className="vq-tailed-empty">
          <p>
            You tailed {state.tails === 1 ? "1 pick" : `${state.tails} picks`}, but {state.tails === 1 ? "its" : "their"} details
            aren’t available right now. That can happen if your research access ended or a publication was
            withdrawn. Your tails are kept.
          </p>
          <div className="vq-tailed-actions">
            <button type="button" className="secondary" onClick={() => void load()}>
              Try again
            </button>
            <Link className="vq-btn" href="/membership">
              Check your access
            </Link>
          </div>
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
          {state.missing ? (
            <p role="status" className="vq-tailed-missing">
              {state.missing === 1 ? "1 more tailed pick" : `${state.missing} more tailed picks`} couldn’t be
              shown: {state.missing === 1 ? "its" : "their"} details aren’t available right now. Your tails are
              kept.
            </p>
          ) : null}
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

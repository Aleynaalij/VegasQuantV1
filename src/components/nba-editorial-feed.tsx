"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { onUserChange } from "@/lib/auth-user";
import type { NbaEditorialPick } from "@/lib/nba-editorial";
import { Shell } from "./ui";
import NbaEditorialCard from "./nba-editorial-card";
import NbaResearchFeed from "./nba-research-feed";
import "@/app/nba-editorial.css";

export default function NbaEditorialFeed() {
  const [picks, setPicks] = useState<NbaEditorialPick[]>([]);
  const [loading, setLoading] = useState(true),
    [allowed, setAllowed] = useState(false);
  const [error, setError] = useState(""),
    [epoch, setEpoch] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let live = true,
      busy = false;
    setPicks([]);
    setAllowed(false);
    setLoading(true);
    setError("");
    async function load() {
      if (busy) return;
      busy = true;
      try {
        const signal = AbortSignal.timeout(15000);
        const [a, p] = await Promise.all([
          supabase.rpc("membership_status").abortSignal(signal),
          supabase
            .from("nba_editorial_picks")
            .select(
              "id,publication_key,game_id,player,market,direction,line,odds,book,rationale,risk,unknowns,sources,evidence_sources:evidence->source_files,supersedes_id,published_at,expires_at,quote_observed_at,quote_recorded_at,quote_source_url,game:nba_games(*)",
            )
            .order("published_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(60)
            .abortSignal(signal),
        ]);
        if (!live) return;
        if (a.error || p.error) throw new Error("refresh");
        const access = a.data?.allowed === true;
        setAllowed(access);
        setPicks(access ? (p.data as unknown as NbaEditorialPick[]) : []);
        setError("");
        setNow(Date.now());
      } catch {
        if (live) {
          setPicks([]);
          setAllowed(false);
          setError("NBA selections could not refresh. Please retry.");
        }
      } finally {
        busy = false;
        if (live) setLoading(false);
      }
    }
    void load();
    const stop = onUserChange(() => {
      live = false;
      setPicks([]);
      setAllowed(false);
      setLoading(true);
      setEpoch((n) => n + 1);
    });
    const refresh = () => {
      if (document.visibilityState !== "hidden") void load();
    };
    const timer = setInterval(() => {
      setNow(Date.now());
      refresh();
    }, 60000);
    window.addEventListener("focus", refresh);
    return () => {
      live = false;
      stop();
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [epoch]);
  const superseded = new Set(picks.map((p) => p.supersedes_id).filter(Boolean));
  return (
    <Shell active="feed" sport="nba">
      <div className="nba-editorial">
        <header>
          <span className="eyebrow">VEGAS QUANT · BASKETBALL</span>
          <h1>The Zone · NBA</h1>
          <p>Legs we like. The case, the risk, and the observed price.</p>
          <Link href="/nba">View games →</Link>
        </header>
        {loading && <p role="status">Loading NBA selections…</p>}
        {error && (
          <p role="alert">
            {error}{" "}
            <button className="btn" onClick={() => setEpoch((n) => n + 1)}>
              Retry
            </button>
          </p>
        )}
        {!loading && !error && !allowed && (
          <p>
            <Link href="/account">Sign in to see NBA selections →</Link>
          </p>
        )}
        {!loading && !error && allowed && !picks.length && (
          <p>No NBA selections have been published yet.</p>
        )}
        {picks.map((p) => (
          <NbaEditorialCard
            key={p.id}
            pick={p}
            now={now}
            superseded={superseded.has(p.id)}
            enabled={!loading && !error}
          />
        ))}
        <section aria-labelledby="nba-research-heading">
          <h2 id="nba-research-heading">NBA research board</h2>
          <NbaResearchFeed />
        </section>
      </div>
    </Shell>
  );
}

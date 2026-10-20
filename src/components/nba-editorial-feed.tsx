"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { onUserChange } from "@/lib/auth-user";
import { time } from "@/lib/domain";
import {
  nbaEditorialCopy,
  nbaEditorialMarket,
  nbaEditorialOpen,
  nbaEditorialSources,
  type NbaEditorialPick,
} from "@/lib/nba-editorial";
import { Shell } from "./ui";
import CasinoCard, { CasinoCardDownload } from "./casino-card";
import type { CasinoCardData } from "@/lib/casino-card";
import GamblyLink from "./gambly-link";
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
        {picks.map((p) => {
          const open =
            !loading &&
            !error &&
            nbaEditorialOpen(p, now, superseded.has(p.id));
          const face: CasinoCardData = {
            variant: "pick",
            eyebrow: "NBA · Analyst selection",
            title: p.player,
            market: nbaEditorialMarket(p),
            matchup: p.game
              ? `${p.game.away_team} @ ${p.game.home_team} · ${time(p.game.tipoff)}`
              : "NBA matchup",
            price: `${p.book} ${p.odds > 0 ? "+" : ""}${p.odds} · observed`,
            footnote: "Qualitative selection · No validated edge claimed",
            publishedAt: p.published_at,
          };
          return (
            <section
              key={p.id}
              id={`pick-${p.id}`}
              className="nba-editorial-pick"
            >
              <CasinoCard data={face} />
              <p className="nba-editorial-quote">
                Quote: {time(p.quote_observed_at)} · Full game
              </p>
              <p>
                <strong>The case:</strong> {p.rationale}
              </p>
              <p>
                <strong>Why it could lose:</strong> {p.risk}
              </p>
              {open ? (
                <GamblyLink
                  url="https://gambly.com/"
                  selection={nbaEditorialCopy(p)}
                  beforeOpen={async () =>
                    nbaEditorialOpen(p, Date.now(), superseded.has(p.id))
                  }
                />
              ) : (
                <p className="notice">
                  {superseded.has(p.id)
                    ? "Updated selection below or above; original preserved."
                    : "Pregame copying closed. Original selection preserved."}
                </p>
              )}
              <details>
                <summary>Sources & availability</summary>
                <p>{p.unknowns}</p>
                <p>
                  FanDuel provider quote {time(p.quote_observed_at)}; received{" "}
                  {time(p.quote_recorded_at)}. This is the recorded publication
                  price, not a live executable quote.
                </p>
                <p>
                  Analyst judgment. No model probability, EV, confidence score
                  or official-pick status is assigned.
                </p>
                <ul>
                  {nbaEditorialSources(p).map((s) => (
                    <li key={s.url}>
                      <a href={s.url} target="_blank" rel="noopener noreferrer">
                        {s.label} ↗
                      </a>
                    </li>
                  ))}
                </ul>
                <a
                  href={p.quote_source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  FanDuel-attributed provider snapshot source ↗
                </a>
                {p.game && (
                  <p>
                    <Link href={`/nba/games/${p.game.slug}`}>
                      Matchup & latest markets →
                    </Link>
                  </p>
                )}
              </details>
              <CasinoCardDownload data={face} />
            </section>
          );
        })}
        <section aria-labelledby="nba-research-heading">
          <h2 id="nba-research-heading">NBA research board</h2>
          <NbaResearchFeed />
        </section>
      </div>
    </Shell>
  );
}

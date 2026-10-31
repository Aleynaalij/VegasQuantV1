"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { NewSport, SportPage } from "@/lib/sport-contract";
import { homeMoneylines, slateGame } from "@/lib/sport-page";
import { onUserChange } from "@/lib/auth-user";
import { SPORTS } from "@/lib/sports";
import SportBrief from "./sport-brief";
import SportSlate from "./sport-slate";
import SportMarkets from "./sport-markets";
import NhlGameReport from "./nhl-game-report";
import { FrankAnniversaryFireworks } from "../frank-anniversary";

/** NHL and college basketball Home: NFL's layout over the shared sports_slate contract. */
export default function SportDesk({ sport }: { sport: NewSport }) {
  const [page, setPage] = useState<SportPage | null>(null),
    [error, setError] = useState(false),
    [now, setNow] = useState(Date.now),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true,
      generation = 0;
    async function load() {
      setNow(Date.now());
      const n = ++generation;
      const r = await supabase.rpc("sports_home", {
        p_sport: sport,
        p_days: 7,
      });
      if (!live || n !== generation) return;
      setError(!!r.error);
      if (!r.error && r.data?.version === 1 && r.data.sport === sport)
        setPage(r.data as SportPage);
    }
    void load();
    const timer = setInterval(load, 60000);
    // Markets are member reads: reload (or clear) when the account signs in or out.
    const stop = onUserChange(() => {
      setPage(null);
      void load();
    });
    return () => {
      live = false;
      clearInterval(timer);
      stop();
    };
  }, [sport, retry]);
  const games = useMemo(
    () => (page?.games || []).map(slateGame),
    [page?.games],
  );
  const { faces, quoteTimes } = useMemo(
    () => homeMoneylines(page?.markets || [], now),
    [page?.markets, now],
  );
  const info = SPORTS[sport];
  return (
    <div className="sport-home" data-sport={sport}>
      {sport === "nhl" && page && !error ? <FrankAnniversaryFireworks /> : null}
      <SportBrief
        sport={sport}
        games={games}
        action={sport === "ncaab" ? "See the lines" : "Choose player props"}
        emptyTitle={
          page ? `No ${info.name} games this week.` : "Loading the slate."
        }
      />
      {error ? (
        <p role="status" className="vq-slate-empty">
          The {info.name} schedule could not load.{" "}
          <button type="button" onClick={() => setRetry((n) => n + 1)}>
            Retry
          </button>
        </p>
      ) : null}
      {page?.access ? (
        <p className="vq-prop-note">
          FanDuel moneylines for {Object.keys(faces).length} of{" "}
          {
            games.filter(
              (g) =>
                !g.status || !/FINAL|CANCEL|POSTPON|SUSPEND/i.test(g.status),
            ).length
          }{" "}
          games.{" "}
          {Object.values(quoteTimes).some((q) => q.stale)
            ? "Older quotes are labelled with their observation time. "
            : ""}
          Market lean comes from sportsbook prices, not a model edge.
        </p>
      ) : null}
      <SportSlate
        games={games}
        faces={faces}
        quoteTimes={quoteTimes}
        empty={
          page ? `No ${info.name} games scheduled this week.` : "Loading games…"
        }
      >
        {(g) => (
          <>
            {page?.access ? (
              <SportMarkets page={page} gameId={g.id} />
            ) : (
              <div className="sport-markets">
                <p role="status">Sign in to see game markets.</p>
              </div>
            )}
            {sport === "nhl" && page?.access ? <NhlGameReport gameId={g.id} /> : null}
            {g.href ? (
              <Link
                prefetch={false}
                className="vq-btn ghost sport-open"
                href={g.href}
              >
                Open the matchup →
              </Link>
            ) : null}
          </>
        )}
      </SportSlate>
    </div>
  );
}

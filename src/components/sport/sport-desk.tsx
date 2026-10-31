"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { NewSport, SportPage } from "@/lib/sport-contract";
import { latestMarkets, slateGame, sportFace } from "@/lib/sport-page";
import type { MoneylineRead } from "@/lib/home-props";
import { SPORTS } from "@/lib/sports";
import SportBrief from "./sport-brief";
import SportSlate from "./sport-slate";
import SportMarkets from "./sport-markets";
import { FrankAnniversaryFireworks } from "../frank-anniversary";

/** NHL and college basketball Home: NFL's layout over the shared sports_slate contract. */
export default function SportDesk({ sport }: { sport: NewSport }) {
  const [page, setPage] = useState<SportPage | null>(null),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true,
      generation = 0;
    async function load() {
      const n = ++generation;
      const r = await supabase.rpc("sports_slate", {
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
    const auth = supabase.auth.onAuthStateChange(() => void load());
    return () => {
      live = false;
      clearInterval(timer);
      auth.data.subscription.unsubscribe();
    };
  }, [sport, retry]);
  const games = (page?.games || []).map(slateGame);
  const faces: Record<string, MoneylineRead> = {};
  if (page)
    for (const g of games) {
      const face = sportFace(
        latestMarkets(page.markets).filter((m) => m.game_id === g.id),
      );
      if (face) faces[g.id] = face;
    }
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
      <SportSlate
        games={games}
        faces={faces}
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
            {g.href ? (
              <Link className="vq-btn ghost sport-open" href={g.href}>
                Open the matchup →
              </Link>
            ) : null}
          </>
        )}
      </SportSlate>
    </div>
  );
}

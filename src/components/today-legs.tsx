"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { odd } from "@/lib/domain";
import {
  legMarket,
  legMatchup,
  todayWindows,
  type TodayRelease,
  type TodayWindow,
} from "@/lib/today";

// Home's "Today" list: every live leg, grouped by kickoff window, each linking to its full case.
export default function TodayLegs() {
  const [windows, setWindows] = useState<TodayWindow[]>([]),
    [prices, setPrices] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    let live = true;
    async function refresh() {
      const r = await supabase
        .from("candidate_releases")
        .select("id,title,candidates,created_at,expires_at")
        .gt("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: true })
        .limit(12);
      if (!live || r.error) return;
      const w = todayWindows((r.data || []) as TodayRelease[]);
      setWindows(w);
      // Latest matched FanDuel price per leg (members only; signed-out visitors just see none).
      const keys = w.flatMap((x) =>
        x.releases.flatMap((rel) => rel.candidates.map((c) => c.leg_key!)),
      );
      if (!keys.length) return;
      const p = await supabase
        .from("leg_market_prices")
        .select("leg_key,last_price")
        .in("leg_key", keys);
      if (live && !p.error)
        setPrices(new Map((p.data || []).map((x) => [x.leg_key, Number(x.last_price)])));
    }
    void refresh();
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  if (!windows.length) return null;
  return (
    <section className="vq-today" aria-label="Today’s legs">
      <header>
        <h2>Legs we like</h2>
        <Link href="/feed?view=legs">All in The Zone →</Link>
      </header>
      {windows.map((w) => (
        <div className="vq-today-window" key={w.key}>
          <h3>{w.label}</h3>
          {w.releases.map((r) => (
            <ul key={r.id}>
              {r.candidates.map((c, i) => (
                <li key={`${r.id}-${i}`}>
                  <Link href={`/feed?view=legs#release-${r.id}`}>
                    <span>
                      <b>{c.name}</b>
                      <small>
                        {legMarket(c.market)} · {legMatchup(c.matchup)}
                      </small>
                    </span>
                    <span className="vq-today-price">
                      {typeof c.odds === "number" && <em>{odd(c.odds)}</em>}
                      {prices.has(c.leg_key!) &&
                        prices.get(c.leg_key!) !== c.odds && (
                          <small>FanDuel now {odd(prices.get(c.leg_key!)!)}</small>
                        )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ))}
        </div>
      ))}
    </section>
  );
}

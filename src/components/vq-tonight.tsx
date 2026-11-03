"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { SPORTS, type Sport } from "@/lib/sports";
import type { Game } from "@/lib/domain";
import {
  fromDeskGames,
  fromNbaGames,
  fromSportsHome,
  startLabel,
  statusLabel,
  tonightGames,
  tonightWindow,
  type TonightGame,
} from "@/lib/vq-tonight";
import "@/app/vq-tonight.css";

type Load = { state: "loading" } | { state: "error" } | { state: "ok"; games: TonightGame[] };
const ORDER: Sport[] = ["nfl", "nba", "nhl", "ncaab"];
const SHOWN = 8;

/**
 * Home's daily view: today's games (Eastern time) across sports with a route into each game's
 * existing page, the lay in progress and the Zone. Built only from readers Home already uses; it
 * does not rank games or claim research exists for a game.
 */
export default function VqTonight({ nflGames }: { nflGames: Game[] }) {
  const [now, setNow] = useState(() => Date.now());
  const day = useMemo(() => tonightWindow(now), [now]);
  const [loads, setLoads] = useState<Record<Exclude<Sport, "nfl">, Load>>({
    nba: { state: "loading" }, nhl: { state: "loading" }, ncaab: { state: "loading" },
  });
  const [all, setAll] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [draft, setDraft] = useState(0);

  const load = useCallback(async (sport: Exclude<Sport, "nfl">, w = day) => {
    setLoads((l) => ({ ...l, [sport]: { state: "loading" } }));
    try {
      let games: TonightGame[];
      if (sport === "nba") {
        const r = await supabase
          .from("nba_games")
          .select("id,slug,away_team,home_team,tipoff,tipoff_tbd,status")
          .gte("tipoff", new Date(w.start).toISOString())
          .lt("tipoff", new Date(w.end).toISOString())
          .order("tipoff")
          .limit(100);
        if (r.error) throw r.error;
        games = fromNbaGames(r.data);
      } else {
        const r = await supabase.rpc("sports_home", { p_sport: sport, p_days: 1 });
        if (r.error) throw r.error;
        games = fromSportsHome(sport, r.data);
      }
      setLoads((l) => ({ ...l, [sport]: { state: "ok", games } }));
    } catch {
      setLoads((l) => ({ ...l, [sport]: { state: "error" } }));
    }
  }, [day]);

  useEffect(() => {
    void load("nba");
    void load("nhl");
    void load("ncaab");
  }, [load]);

  // Roll over at ET midnight, and catch up when the tab wakes.
  useEffect(() => {
    const wake = () => {
      if (document.visibilityState === "visible" && Date.now() >= day.end) setNow(Date.now());
    };
    const timer = setTimeout(() => setNow(Date.now()), Math.max(1000, day.end - Date.now() + 1000));
    document.addEventListener("visibilitychange", wake);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [day.end]);

  // Signed-in state and the lay in progress (this account's draft only).
  useEffect(() => {
    let live = true;
    const read = async () => {
      const s = await supabase.auth.getSession();
      if (!live) return;
      const uid = s.data.session?.user.id;
      setSignedIn(Boolean(uid));
      try {
        const d = uid ? JSON.parse(sessionStorage.getItem(`vq-parlay-draft:${uid}`) || "null") : null;
        setDraft(Array.isArray(d?.keys) ? d.keys.length : 0);
      } catch {
        setDraft(0);
      }
    };
    void read();
    const sub = supabase.auth.onAuthStateChange(() => void read());
    return () => {
      live = false;
      sub.data.subscription.unsubscribe();
    };
  }, []);

  const rows = useMemo(() => {
    const loaded = (["nba", "nhl", "ncaab"] as const).flatMap((s) => {
      const l = loads[s];
      return l.state === "ok" ? l.games : [];
    });
    return tonightGames([...fromDeskGames(nflGames), ...loaded], now);
  }, [loads, nflGames, now]);
  const failed = (["nba", "nhl", "ncaab"] as const).filter((s) => loads[s].state === "error");
  const loading = (["nba", "nhl", "ncaab"] as const).some((s) => loads[s].state === "loading");
  const shown = all ? rows : rows.slice(0, SHOWN);
  const bySport = ORDER.map((s) => [s, shown.filter((g) => g.sport === s)] as const).filter(([, g]) => g.length);

  return (
    <section className="vq-tonight" aria-labelledby="vq-tonight-title">
      <header className="vq-tonight-head">
        <h2 id="vq-tonight-title">VQ Tonight</h2>
        <p>Today · {day.label} · Eastern time</p>
      </header>

      {failed.length ? (
        <p className="vq-tonight-alert" role="alert">
          {failed.map((s) => SPORTS[s].label).join(", ")} games could not load.{" "}
          <button type="button" onClick={() => failed.forEach((s) => void load(s))}>
            Retry
          </button>
        </p>
      ) : null}

      {!rows.length ? (
        <p className="vq-tonight-empty" role="status">
          {loading ? "Loading today’s games…" : failed.length ? "No other games to show right now." : "No games are scheduled today."}
        </p>
      ) : (
        <div className="vq-tonight-games">
          {bySport.map(([sport, games]) => (
            <div key={sport} className="vq-tonight-sport">
              <h3>{SPORTS[sport].label}</h3>
              <ul>
                {games.map((g) => {
                  const status = statusLabel(g.status);
                  return (
                    <li key={`${g.sport}:${g.id}`}>
                      <Link href={g.href} className="vq-tonight-game" aria-label={`${g.away} at ${g.home}, ${status ?? startLabel(g)}. Open the game page`}>
                        <span className="vq-tonight-teams">
                          {g.away} <small>@</small> {g.home}
                        </span>
                        <span className="vq-tonight-when">{status ? <b>{status}</b> : startLabel(g)}</span>
                        <span className="vq-tonight-go" aria-hidden="true">Game page →</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {rows.length > SHOWN ? (
            <button type="button" className="vq-tonight-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
              {all ? "Show fewer games" : `Show all ${rows.length} games`}
            </button>
          ) : null}
          {loading ? <p className="vq-tonight-note" role="status">Still loading some sports…</p> : null}
        </div>
      )}

      <div className="vq-tonight-next">
        <Link href="/parlays" className="vq-tonight-card">
          <b>{draft ? `Continue your lay · ${draft} selected` : "Your lays"}</b>
          <small>{draft ? "Pick up where you left off." : "Saved lays and the leg library."}</small>
        </Link>
        {signedIn === false ? (
          <Link href="/membership" className="vq-tonight-card">
            <b>The Zone · sign in</b>
            <small>Member discussion is for signed-in members.</small>
          </Link>
        ) : (
          <Link href="/community" className="vq-tonight-card">
            <b>The Zone</b>
            <small>Member talk, kept separate from published research.</small>
          </Link>
        )}
      </div>
    </section>
  );
}

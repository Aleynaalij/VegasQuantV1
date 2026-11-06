"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/**
 * A sport's schedule as last read. `checkedAt` is when Vegas Quant last read it, not when the
 * provider last changed it; `stale` means a later refresh failed and these are the earlier games.
 */
type Load =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ok"; games: TonightGame[]; checkedAt: number; stale: boolean };
const ORDER: Sport[] = ["nfl", "nba", "nhl", "ncaab"];
const SHOWN = 8;
/** Re-read schedules every 5 minutes while the page is visible: 3 small reads, no provider credits. */
const REFRESH = 5 * 60000;
const clock = (t: number) =>
  `${new Date(t).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })} ET`;

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

  // Each sport's newest request wins: a late answer from an earlier request (or an earlier ET day)
  // is ignored, whether it succeeded or failed.
  const latest = useRef<Record<Exclude<Sport, "nfl">, number>>({ nba: 0, nhl: 0, ncaab: 0 });
  const dayStart = useRef(day.start);
  dayStart.current = day.start;
  const load = useCallback(async (sport: Exclude<Sport, "nfl">, w = day) => {
    const n = ++latest.current[sport];
    const current = () => n === latest.current[sport] && w.start === dayStart.current;
    // Keep showing what we have while refreshing; only a first load shows "loading".
    setLoads((l) => (l[sport].state === "ok" ? l : { ...l, [sport]: { state: "loading" } }));
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
        const parsed = fromSportsHome(sport, r.data);
        if (!parsed) throw Error("Unexpected schedule response");
        games = parsed;
      }
      if (!current()) return;
      setLoads((l) => ({ ...l, [sport]: { state: "ok", games, checkedAt: Date.now(), stale: false } }));
    } catch {
      if (!current()) return;
      // A failed refresh keeps the earlier games, marked stale; a failed first load is an error.
      setLoads((l) => {
        const prev = l[sport];
        return { ...l, [sport]: prev.state === "ok" ? { ...prev, stale: true } : { state: "error" } };
      });
    }
  }, [day]);

  useEffect(() => {
    // A new ET day starts clean: the previous day's games are never shown as today's.
    setLoads({ nba: { state: "loading" }, nhl: { state: "loading" }, ncaab: { state: "loading" } });
    const all = () => (["nba", "nhl", "ncaab"] as const).forEach((s) => void load(s));
    all();
    // Same-day status changes (final, postponed) appear without a reload.
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") all();
    }, REFRESH);
    return () => clearInterval(timer);
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
    let reads = 0;
    const read = async () => {
      const n = ++reads;
      const s = await supabase.auth.getSession();
      if (!live || n !== reads) return; // a newer read (e.g. after an account change) won
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
    // Selections added or removed on Home in this visit, or in another tab.
    const changed = () => void read();
    window.addEventListener("vq-parlay-draft-changed", changed);
    window.addEventListener("storage", changed);
    window.addEventListener("focus", changed);
    return () => {
      live = false;
      sub.data.subscription.unsubscribe();
      window.removeEventListener("vq-parlay-draft-changed", changed);
      window.removeEventListener("storage", changed);
      window.removeEventListener("focus", changed);
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
  const stale = (["nba", "nhl", "ncaab"] as const).filter((s) => {
    const l = loads[s];
    return l.state === "ok" && l.stale;
  });
  const checked = (["nba", "nhl", "ncaab"] as const).flatMap((s) => {
    const l = loads[s];
    return l.state === "ok" ? [l.checkedAt] : [];
  });
  const lastChecked = checked.length ? Math.min(...checked) : null;
  const loading = (["nba", "nhl", "ncaab"] as const).some((s) => loads[s].state === "loading");
  const shown = all ? rows : rows.slice(0, SHOWN);
  const bySport = ORDER.map((s) => [s, shown.filter((g) => g.sport === s)] as const).filter(([, g]) => g.length);

  return (
    <section className="vq-tonight" aria-labelledby="vq-tonight-title">
      <header className="vq-tonight-head">
        <h2 id="vq-tonight-title">VQ Tonight</h2>
        <p>Today · {day.label} · Eastern time</p>
        {lastChecked ? (
          <p className="vq-tonight-checked">
            Schedules checked {clock(lastChecked)}. Times and statuses are as the league data
            reported them then.
          </p>
        ) : null}
      </header>

      {stale.length ? (
        <p className="vq-tonight-alert" role="alert">
          Couldn’t refresh {stale.map((s) => SPORTS[s].label).join(", ")}: showing games as last
          checked, which may be out of date.{" "}
          <button type="button" onClick={() => stale.forEach((s) => void load(s))}>
            Retry
          </button>
        </p>
      ) : null}

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
          <b>{draft ? `Continue your lay · ${draft} selected` : "My lays"}</b>
          <small>{draft ? "Pick up where you left off." : "Your saved lays and the leg library."}</small>
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

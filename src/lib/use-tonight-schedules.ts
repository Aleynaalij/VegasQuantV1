"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Sport } from "@/lib/sports";
import type { Game } from "@/lib/domain";
import {
  fromDeskGames,
  fromNbaGames,
  fromSportsHome,
  tonightGames,
  tonightWindow,
  type TonightGame,
} from "@/lib/vq-tonight";
import type { FaceState } from "@/lib/skybox-spin";

/**
 * A sport's schedule as last read. `checkedAt` is when Vegas Quant last read it, not when the
 * provider last changed it; `stale` means a later refresh failed and these are the earlier games.
 */
export type Load =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ok"; games: TonightGame[]; checkedAt: number; stale: boolean };
export type ClientSport = Exclude<Sport, "nfl">;
export const CLIENT_SPORTS = ["nba", "nhl", "ncaab"] as const;
/** Re-read schedules every 5 minutes while the page is visible: 3 small reads, no provider credits. */
const REFRESH = 5 * 60000;

/**
 * Today's schedules (Eastern time) for every sport, read once for the whole Home: NFL from the
 * server-rendered desk, the rest from the readers VQ Tonight already used. The overview and each
 * Skybox face derive from this one set of reads, so turning the box never fetches.
 */
export function useTonightSchedules(nflGames: Game[], nflUnavailable = false) {
  const [now, setNow] = useState(() => Date.now());
  const day = useMemo(() => tonightWindow(now), [now]);
  const [loads, setLoads] = useState<Record<ClientSport, Load>>({
    nba: { state: "loading" }, nhl: { state: "loading" }, ncaab: { state: "loading" },
  });

  // Each sport's newest request wins: a late answer from an earlier request (or an earlier ET day)
  // is ignored, whether it succeeded or failed.
  const latest = useRef<Record<ClientSport, number>>({ nba: 0, nhl: 0, ncaab: 0 });
  const dayStart = useRef(day.start);
  dayStart.current = day.start;
  const load = useCallback(async (sport: ClientSport, w = day) => {
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
    const all = () => CLIENT_SPORTS.forEach((s) => void load(s));
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

  const rows = useMemo(() => {
    const loaded = CLIENT_SPORTS.flatMap((s) => {
      const l = loads[s];
      return l.state === "ok" ? l.games : [];
    });
    return tonightGames([...fromDeskGames(nflGames), ...loaded], now);
  }, [loads, nflGames, now]);

  /**
   * One face's state. NFL comes from the server render: a failed desk read is "unavailable", never
   * "no games today"; its games carry no status, so none is inferred.
   */
  const faceState = useCallback(
    (sport: Sport): FaceState => {
      const games = rows.filter((g) => g.sport === sport);
      if (sport === "nfl") return nflUnavailable ? { kind: "unavailable" } : { kind: "ready", games, stale: false, checkedAt: null };
      const l = loads[sport];
      if (l.state === "loading") return { kind: "loading" };
      if (l.state === "error") return { kind: "unavailable" };
      return { kind: "ready", games, stale: l.stale, checkedAt: l.checkedAt };
    },
    [rows, loads, nflUnavailable],
  );

  return { now, day, loads, load, rows, faceState };
}

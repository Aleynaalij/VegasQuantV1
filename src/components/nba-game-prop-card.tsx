"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { NbaGame } from "@/lib/nba-board";
import {
  boxRowsFromGames,
  propTrends,
  seasonLines,
  type DefenseRow,
  type JoinedBoxRow,
  type Market,
  type PlayerLine,
  type PropTrend,
} from "@/lib/nba-research-tab";
import NbaPropCard from "./nba-prop-card";
import "@/app/nba-research-tab.css";

type Loaded = { line: PlayerLine; trend: PropTrend; defense: DefenseRow[] };
type Joined = Omit<
  JoinedBoxRow,
  | "tipoff"
  | "away_team"
  | "home_team"
  | "away_abbreviation"
  | "home_abbreviation"
> & {
  nba_game_results: {
    nba_games: {
      tipoff: string;
      away_team: string;
      home_team: string;
      away_abbreviation: string | null;
      home_abbreviation: string | null;
    };
  };
};

/**
 * The prop game-log card for one points or rebounds prop in a game's research panel. Loads on
 * open: the player's games this season and phase before this tip (matched by the same name key
 * as recorded form, refused when the name matches more than one player), usage and defense vs
 * position.
 */
export default function NbaGamePropCard({
  game,
  player,
  market,
  point,
  over,
  under,
  book,
}: {
  game: NbaGame;
  player: string;
  market: Market;
  point: number;
  over: number | null;
  under: number | null;
  book: string;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    let live = true;
    async function load() {
      setError("");
      setData(null);
      try {
        if (game.season === null || game.season_type === null)
          throw new Error("Season phase unavailable");
        const key = await supabase.rpc("nba_name_key", { n: player });
        if (key.error || !key.data)
          throw new Error("Player identity unavailable");
        const rows = await supabase
          .from("nba_player_results")
          .select(
            "game_id,athlete_id,player,team,played,minutes,points,rebounds,assists,threes,position,nba_game_results!inner(nba_games!inner(tipoff,season,season_type,away_team,home_team,away_abbreviation,home_abbreviation))",
          )
          .eq("name_key", key.data)
          .eq("played", true)
          .eq("nba_game_results.nba_games.season", game.season)
          .eq("nba_game_results.nba_games.season_type", game.season_type)
          .lt("nba_game_results.nba_games.tipoff", game.tipoff)
          .order("game_id")
          .limit(120);
        if (rows.error) throw rows.error;
        const list = (rows.data || []) as unknown as Joined[];
        if (list.length === 120)
          throw new Error("History exceeded safe window");
        const ids = new Set(list.map((r) => String(r.athlete_id)));
        if (ids.size > 1) throw new Error("Ambiguous player identity");
        if (!ids.size) throw new Error("No recorded games");
        const [u, d] = await Promise.all([
          supabase.rpc("nba_player_usage", { p_athletes: [...ids] }),
          supabase.rpc("nba_defense_vs_position", { p_season: game.season }),
        ]);
        const usage = new Map<string, number>();
        for (const r of (u.error ? [] : u.data || []) as {
          game_id: string;
          athlete_id: string;
          usage: number | string;
        }[])
          usage.set(`${r.game_id}:${r.athlete_id}`, Number(r.usage));
        const [line] = seasonLines(
          boxRowsFromGames(
            list.map(({ nba_game_results, ...r }) => ({
              ...r,
              ...nba_game_results.nba_games,
            })),
            usage,
          ),
        );
        const [trend] = propTrends(
          [{ player: line.player, market, line: point, over, under }],
          [line],
        );
        const defense = ((d.error ? [] : d.data || []) as DefenseRow[]).map(
          (r) => ({
            ...r,
            points: Number(r.points),
            rebounds: Number(r.rebounds),
          }),
        );
        if (live) setData({ line, trend, defense });
      } catch (e) {
        if (live)
          setError(
            e instanceof Error && e.message === "No recorded games"
              ? "No recorded games for this player this season yet."
              : "The game log could not load, or the player's name matches more than one player.",
          );
      }
    }
    void load();
    return () => {
      live = false;
    };
  }, [
    open,
    retry,
    player,
    market,
    point,
    over,
    under,
    game.season,
    game.season_type,
    game.tipoff,
  ]);

  const home = data ? data.line.team === game.home_team : false;
  return (
    <details
      className="nba-form npc-game"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>Game log &amp; estimate · {player}</summary>
      {open && (
        <div className="nbar">
          {!data && !error && <p role="status">Loading game log…</p>}
          {error && (
            <p role="alert">
              {error}{" "}
              <button type="button" onClick={() => setRetry((n) => n + 1)}>
                Retry
              </button>
            </p>
          )}
          {data && (
            <NbaPropCard
              trend={data.trend}
              player={data.line}
              defense={data.defense}
              book={book}
              tonight={{
                tipoff: game.tipoff,
                home,
                opponent:
                  (home ? game.away_abbreviation : game.home_abbreviation) ||
                  (home ? game.away_team : game.home_team),
                defense: home ? game.away_team : game.home_team,
              }}
            />
          )}
        </div>
      )}
    </details>
  );
}

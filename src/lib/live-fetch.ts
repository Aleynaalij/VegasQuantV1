import {
  LIVE_PATHS,
  parseScoreboard,
  scoreboardDays,
  type LiveGame,
  type LiveSport,
} from "./live-scores";
import { boxIsFinal, parseLiveBox, type LiveBox } from "./live-sweat";

/** Server-side ESPN reads shared by the live routes. Cached 20 seconds by the fetch layer. */
export async function fetchLiveGames(sport: LiveSport): Promise<LiveGame[]> {
  const boards = await Promise.all(
    scoreboardDays().map(async (day) => {
      const r = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/${LIVE_PATHS[sport]}/scoreboard?dates=${day}&limit=500${sport === "ncaab" ? "&groups=50" : ""}`,
        { next: { revalidate: 20 }, signal: AbortSignal.timeout(8000) },
      );
      if (!r.ok) throw Error(`Scores ${r.status}`);
      return parseScoreboard(await r.json());
    }),
  );
  return boards.flat();
}

/** A game's live box score and whether ESPN's own summary marks it final. */
export async function fetchLiveBox(
  sport: "nba" | "nhl",
  id: string,
): Promise<{ players: LiveBox; final: boolean }> {
  if (!/^\d{1,15}$/.test(id)) throw Error("Bad game id");
  const r = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/${LIVE_PATHS[sport]}/summary?event=${id}`,
    { next: { revalidate: 20 }, signal: AbortSignal.timeout(8000) },
  );
  if (!r.ok) throw Error(`Box ${r.status}`);
  const data = await r.json();
  const players = parseLiveBox(sport, data);
  if (!players) throw Error("Unreadable box score");
  return { players, final: boxIsFinal(data) };
}

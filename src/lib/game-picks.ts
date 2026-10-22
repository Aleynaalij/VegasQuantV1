import type { Game } from "./domain";

const easternDate = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

/** Keep today's game reachable after kickoff; otherwise show the next football day. */
export function footballPickGames(games: Game[], now = new Date()): Game[] {
  const football = games
    .filter(
      (game) =>
        (!game.sport || game.sport === "nfl") &&
        Number.isFinite(Date.parse(game.kickoff)),
    )
    .toSorted((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  const today = easternDate(now);
  const playingToday = football.filter(
    (game) => easternDate(new Date(game.kickoff)) === today,
  );
  if (playingToday.length) return playingToday;
  const next = football.find(
    (game) => Date.parse(game.kickoff) > now.getTime(),
  );
  if (!next) return [];
  const nextDay = easternDate(new Date(next.kickoff));
  return football.filter(
    (game) => easternDate(new Date(game.kickoff)) === nextDay,
  );
}

export const gamePicksPath = (slug: string) =>
  `/matchups/${encodeURIComponent(slug)}/picks`;

/** Page the game-scoped view, not the global feed or current-week catalog. */
export async function readGamePublications<T extends { leg_key: string }>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 500,
): Promise<T[]> {
  const rows = new Map<string, T>();
  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    if (page.error)
      throw new Error("This game's picks could not load. Please retry.");
    for (const row of page.data || []) rows.set(row.leg_key, row);
    if (!page.data || page.data.length < pageSize) return [...rows.values()];
  }
}

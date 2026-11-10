import type { NbaGame } from "./nba-board";
import type { NbaEditorialPick } from "./nba-editorial";

export type GameSelectionsResult =
  | { status: "ready"; picks: NbaEditorialPick[] }
  | { status: "denied" | "error"; picks: [] };

/** Access is checked before any protected publication payload is requested. */
export async function loadGameSelections(
  gameId: string,
  access: () => Promise<boolean>,
  page: (
    gameId: string,
    offset: number,
    size: number,
  ) => Promise<NbaEditorialPick[]>,
): Promise<GameSelectionsResult> {
  try {
    if (!(await access())) return { status: "denied", picks: [] };
    const picks: NbaEditorialPick[] = [];
    // Fetch complete revision history, including expired replacements. Never revive a
    // superseded original merely because its replacement expired or fell off a page.
    for (let offset = 0; ; offset += 200) {
      const rows = await page(gameId, offset, 200);
      picks.push(...rows.filter((p) => p.game_id === gameId));
      if (rows.length < 200) break;
    }
    return { status: "ready", picks };
  } catch {
    return { status: "error", picks: [] };
  }
}

export function gameSelectionCards(picks: NbaEditorialPick[], game: NbaGame) {
  const sameGame = picks.filter((p) => p.game_id === game.id);
  const superseded = new Set(
    sameGame.map((p) => p.supersedes_id).filter(Boolean),
  );
  return sameGame.map((p) => ({
    // The current schedule wins over the publication's joined snapshot.
    pick: { ...p, game },
    superseded: superseded.has(p.id),
  }));
}

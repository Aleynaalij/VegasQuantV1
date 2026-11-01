import type { LiveGame } from "./live-scores";
import { pickAlert, type LiveBox, type SweatPick } from "./live-sweat";

/** A published pick on a started game, as public.live_pick_candidates returns it. */
export type AlertCandidate = {
  sport: "nba" | "nhl" | "ncaab";
  id: string;
  provider_id: string;
  slug: string;
  market: SweatPick["market"];
  side: SweatPick["side"];
  direction: SweatPick["direction"];
  line: number | string | null;
  player: string | null;
  supersedes_id: string | null;
};

export type PlannedAlert = {
  sport: AlertCandidate["sport"];
  pick: string;
  message: string;
  link: string;
};

/**
 * Which picks are decided right now, and their one alert. Superseded NBA picks never alert (their
 * revision does). Player props need that game's box score; a game whose box can't be read waits,
 * and a final game waits for a box ESPN marks final.
 */
export async function planAlerts(
  candidates: AlertCandidate[],
  games: (sport: AlertCandidate["sport"]) => Promise<LiveGame[]>,
  box: (
    sport: "nba" | "nhl",
    id: string,
  ) => Promise<{ players: LiveBox; final: boolean } | null>,
): Promise<PlannedAlert[]> {
  const replaced = new Set(
    candidates.map((c) => c.supersedes_id).filter(Boolean),
  );
  const live = candidates.filter((c) => !replaced.has(c.id));
  const out: PlannedAlert[] = [];
  const boards = new Map<string, LiveGame[]>();
  const boxes = new Map<string, { players: LiveBox; final: boolean } | null>();
  for (const c of live) {
    if (!boards.has(c.sport))
      boards.set(c.sport, await games(c.sport).catch(() => []));
    const g = boards.get(c.sport)!.find((x) => x.id === c.provider_id);
    if (!g || g.state === "pre") continue;
    let b: LiveBox | null = null;
    if (c.market.startsWith("player_")) {
      if (c.sport === "ncaab") continue;
      const k = `${c.sport}:${g.id}`;
      if (!boxes.has(k))
        boxes.set(k, await box(c.sport, g.id).catch(() => null));
      const read = boxes.get(k)!;
      // A final game's props are judged only on a box ESPN itself marks final, never a late live read.
      if (!read || (g.state === "post" && !read.final)) continue;
      b = read.players;
    }
    const line = c.line === null || c.line === "" ? null : Number(c.line);
    const message = pickAlert(
      {
        id: c.id,
        market: c.market,
        side: c.side,
        direction: c.direction,
        line: Number.isFinite(line) ? line : null,
        player: c.player,
      },
      g,
      b,
    );
    if (message && /^[a-z0-9-]{1,120}$/.test(c.slug))
      out.push({
        sport: c.sport,
        pick: c.id,
        message: message.slice(0, 200),
        link: `/${c.sport}/games/${c.slug}`,
      });
  }
  return out;
}

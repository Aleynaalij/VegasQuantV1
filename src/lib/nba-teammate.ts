/**
 * With / without splits: how a player has done against tonight's line in games a teammate who is
 * out (or doubtful) tonight did not play, compared with games they played together. Recorded box
 * scores only; a game counts when the player played for his current team.
 */
import {
  nameKey,
  type GameStat,
  type Injury,
  type Market,
  type PlayerLine,
} from "./nba-research-tab";

export type SplitSide = { n: number; hits: number; avg: number };
export type TeammateSplit = {
  teammate: string;
  status: string;
  injury: string;
  without: SplitSide;
  with: SplitSide;
};

/** Statuses that make a teammate's absence worth showing tonight. */
const ABSENT = new Set(["Out", "Doubtful"]);
/** Fewer games apart than this and the split says nothing. */
export const MIN_WITHOUT = 3;

function side(games: GameStat[], market: Market, mark: number): SplitSide {
  const values = games.map((g) => (market === "player_points" ? g.pts : g.reb));
  const n = values.length;
  return {
    n,
    hits: values.filter((v) => v > mark).length,
    avg: n ? Math.round((values.reduce((a, b) => a + b, 0) / n) * 10) / 10 : 0,
  };
}

export function teammateSplits(
  player: PlayerLine,
  lines: PlayerLine[],
  injuries: Injury[],
  market: Market,
  mark: number,
): TeammateSplit[] {
  // His games for his current team, with a known game id.
  const mine = player.games.filter((g) => g.game && g.team === player.team);
  if (!mine.length) return [];
  const out: TeammateSplit[] = [];
  for (const injury of injuries) {
    if (injury.team !== player.team || !ABSENT.has(injury.status)) continue;
    const key = nameKey(injury.player);
    if (key === nameKey(player.player)) continue;
    const mate = lines.find(
      (l) =>
        l.athlete_id !== player.athlete_id &&
        l.team === player.team &&
        nameKey(l.player) === key,
    );
    if (!mate) continue;
    // Only games of this team count, so a traded teammate's old team never reads as "with".
    const together = new Set(
      mate.games
        .filter((g) => g.game && g.team === player.team)
        .map((g) => g.game!),
    );
    if (!together.size) continue;
    const withMate = mine.filter((g) => together.has(g.game!));
    const without = mine.filter((g) => !together.has(g.game!));
    // No shared game means no baseline to compare against: skip rather than show "with" as zero.
    if (!withMate.length || without.length < MIN_WITHOUT) continue;
    out.push({
      teammate: mate.player,
      status: injury.status,
      injury: injury.injury,
      without: side(without, market, mark),
      with: side(withMate, market, mark),
    });
  }
  // The biggest change first.
  return out.sort(
    (a, b) =>
      Math.abs(b.without.avg - b.with.avg) -
      Math.abs(a.without.avg - a.with.avg),
  );
}

/** Percentage of games over the line, or null with no games. */
export const rate = (s: SplitSide) =>
  s.n ? Math.round((s.hits / s.n) * 100) : null;
